import { useState } from "react";
import { toast } from "sonner";
import { ArrowUpRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { detectShell } from "@/lib/shell";
import { useI18n } from "@/i18n";

type CheckResult = Awaited<ReturnType<typeof window.mcss.app.updateCheck>>;
type Phase = "idle" | "checking" | "latest" | "available" | "runtime" | "downloading";

/**
 * 轻量更新入口。
 *
 * 桌面版只换应用层 asar（几 MB），Electron 运行时变了才提示下载完整包；
 * 网页版没有可替换的应用层，刷新就是最新，这里只说明一句。
 */
export function UpdatePanel() {
  const web = detectShell() === "web";
  const [phase, setPhase] = useState<Phase>("idle");
  const [info, setInfo] = useState<CheckResult | null>(null);
  const { t } = useI18n();

  if (web) {
    return (
      <p className="t-copy-13 text-gray-800">
        {t("update.web", "网页版刷新后即为最新版本，不需要单独更新。")}
      </p>
    );
  }

  async function check() {
    setPhase("checking");
    try {
      const res = await window.mcss.app.updateCheck();
      setInfo(res);
      if (!res.available) setPhase("latest");
      else setPhase(res.runtimeOk ? "available" : "runtime");
    } catch (e) {
      toast.error((e as Error).message);
      setPhase("idle");
    }
  }

  async function install() {
    setPhase("downloading");
    try {
      const res = await window.mcss.app.updateDownload();
      toast.success(
        t("update.toast.done", "更新包已下载（{size}MB），即将重启", { size: (res.size / 1024 / 1024).toFixed(1) }),
      );
      await window.mcss.app.updateApply();
    } catch (e) {
      toast.error((e as Error).message);
      setPhase("available");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        variant="secondary"
        size="sm"
        onClick={check}
        disabled={phase === "checking" || phase === "downloading"}
      >
        <RefreshCw className={phase === "checking" ? "size-3.5 animate-spin" : "size-3.5"} />
        {t("update.check", "检查更新")}
      </Button>

      {phase === "latest" ? (
        <span className="t-copy-13 text-gray-800">{t("update.latest", "已是最新版本（v{v}）", { v: info?.current ?? "" })}</span>
      ) : null}

      {phase === "available" && info ? (
        <>
          <span className="t-copy-13 text-gray-800">
            {t("update.available", "有新版 v{latest}，约 {size}MB", {
              latest: info.latest,
              size: (info.size / 1024 / 1024).toFixed(1),
            })}
          </span>
          <Button size="sm" variant="accent" onClick={install}>
            {t("update.install", "下载并重启")}
          </Button>
        </>
      ) : null}

      {phase === "runtime" && info ? (
        <>
          <span className="t-copy-13 text-gray-800">
            {t("update.runtime", "v{latest} 需要新的运行环境，请下载完整包", { latest: info.latest })}
          </span>
          <Button size="sm" variant="secondary" onClick={() => window.mcss.app.openExternal("https://github.com/wulons/wulons-mcss/releases/latest")}>
            {t("update.openDownload", "打开下载页")}<ArrowUpRight className="size-3.5" />
          </Button>
        </>
      ) : null}

      {phase === "downloading" ? <span className="t-copy-13 text-gray-800">{t("update.downloading", "正在下载更新包…")}</span> : null}
    </div>
  );
}
