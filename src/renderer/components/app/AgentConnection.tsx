import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Download, FolderOpen, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SwitchRow } from "@/components/ui/field";
import { Badge } from "@/components/ui/misc";
import { useAgentStatus } from "@/hooks/useAgentStatus";
import { useI18n } from "@/i18n";
import { agentBaseUrl, detectShell } from "@/lib/shell";
import { agentDownloadReady, agentDownloadUrl } from "@/lib/links";

/**
 * 网页版的「本机助手」状态卡：连接、版本、开机自启、日志。
 * 之前这里只写了一行「仅监听 127.0.0.1」，用户既不知道有没有连上，也没法关掉自启。
 */
export function AgentConnection() {
  const web = detectShell() === "web";
  const agent = useAgentStatus(web);
  const [autostart, setAutostart] = useState<boolean | null>(null);
  const [appData, setAppData] = useState("");
  const [busy, setBusy] = useState(false);
  const { t } = useI18n();

  useEffect(() => {
    if (web && agent.status !== "online") return;
    void window.mcss.app
      .info()
      .then((info) => setAppData(info.appData || ""))
      .catch(() => {});
  }, [web, agent.status]);

  useEffect(() => {
    if (web && agent.status !== "online") {
      setAutostart(null);
      return;
    }
    let alive = true;
    void window.mcss.app
      .autostart()
      .then((state) => alive && setAutostart(state.enabled))
      .catch(() => alive && setAutostart(null));
    return () => {
      alive = false;
    };
  }, [web, agent.status]);

  async function toggleAutostart(enabled: boolean) {
    setBusy(true);
    try {
      const state = await window.mcss.app.setAutostart(enabled);
      setAutostart(state.enabled);
      toast.success(state.enabled ? t("agent.autostart.onToast", "已设为开机启动") : t("agent.autostart.offToast", "已取消开机启动"), {
        description: state.enabled
          ? t("agent.autostart.onToastDesc", "下次登录 Windows 时，助手会在后台自己起来。")
          : t("agent.autostart.offToastDesc", "已从启动项移除；已经运行的助手不受影响。"),
      });
    } catch (e) {
      toast.error(t("agent.autostart.failed", "没有改成开机自启"), { description: (e as Error).message });
      setAutostart(enabled);
    } finally {
      setBusy(false);
    }
  }

  function openLog() {
    if (!appData) {
      toast.error(t("agent.log.noDataDir", "拿不到数据目录，暂时打不开日志"));
      return;
    }
    void window.mcss.app.openPath(`${appData}\\wulons-mcss\\agent.log`).catch((e) => {
      toast.error(t("agent.log.notCreated", "日志还没生成"), { description: (e as Error).message });
    });
  }

  if (!web) {
    return (
      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg bg-background-200 p-3">
        <ShieldCheck className="size-4 shrink-0 text-green-900" />
        <span className="t-label-13 text-gray-900">{t("agent.desktop.note", "桌面版自带全部本机能力，不需要额外安装助手。")}</span>
        <span className="ml-auto flex items-center gap-2">
          <span className="t-label-12 text-gray-700">{t("agent.autostart", "开机自启")}</span>
          <Button
            size="xs"
            variant="ghost"
            disabled={autostart === null || busy}
            onClick={() => void toggleAutostart(!(autostart ?? false))}
            loading={busy}
          >
            {autostart === null
              ? t("agent.autostart.loading", "读取中…")
              : autostart
                ? t("agent.autostart.on", "已开启，点击关闭")
                : t("agent.autostart.off", "未开启，点击开启")}
          </Button>
        </span>
      </div>
    );
  }

  const tone = agent.status === "online" ? "green" : agent.status === "checking" ? "amber" : "gray";
  const label =
    agent.status === "online"
      ? t("agent.status.online", "已连接")
      : agent.status === "checking"
        ? t("agent.status.checking", "检查中")
        : agent.status === "blocked"
          ? t("agent.status.blocked", "连接受阻")
          : t("agent.status.offline", "未连接");

  return (
    <div className="mt-4 rounded-lg bg-background-200 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={tone} size="sm">{label}</Badge>
        <span className="t-label-13 text-gray-900">
          {agent.status === "online"
            ? t("agent.running", "本机助手{v} 正在后台运行", { v: agent.version ? ` v${agent.version}` : "" })
            : agent.status === "checking"
              ? t("agent.checking", "正在检查本机助手…")
              : agent.status === "blocked"
                ? t("agent.blocked", "助手在运行，但这个页面被拒绝访问")
                : t("agent.offline", "这台电脑上还没有检测到助手")}
        </span>
        <span className="ml-auto flex flex-wrap items-center gap-2">
          {agent.status !== "online" && agentDownloadReady() ? (
            <Button size="xs" onClick={() => window.open(agentDownloadUrl(), "_blank", "noopener,noreferrer")}>
              <Download className="size-3" />
              {t("agent.download", "下载安装包")}
            </Button>
          ) : null}
          <Button size="xs" variant="ghost" onClick={() => void agent.refresh()} loading={agent.refreshing}>
            <RefreshCw className="size-3" />
            {t("agent.refresh", "重新检测")}
          </Button>
        </span>
      </div>

      {agent.status === "blocked" && agent.message ? (
        <p className="mt-2 t-label-12 leading-5 text-amber-900">{agent.message}</p>
      ) : null}

      {agent.status === "offline" ? (
        <p className="mt-2 t-label-12 leading-5 text-amber-900">
          {t("agent.offline.hint", "如果任务管理器里已经有 mcss-agent.exe，点「重新检测」；Edge 询问是否允许访问本地网络时请点允许。")}
        </p>
      ) : null}

      {agent.status === "online" ? (
        <div className="mt-3 space-y-1.5 border-t border-gray-300 pt-3">
          <SwitchRow
            label={t("agent.autostart.switch", "开机自动启动助手")}
            hint={t("agent.autostart.switchHint", "登录 Windows 后在后台运行，不弹窗口；关闭后仍可在开始菜单手动打开")}
            checked={Boolean(autostart)}
            disabled={autostart === null || busy}
            onCheckedChange={(value) => void toggleAutostart(value)}
          />
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="t-mono-12 truncate text-gray-700" title={agentBaseUrl()}>{agentBaseUrl()}</span>
            <Button size="xs" variant="ghost" className="ml-auto" onClick={openLog} title={t("agent.log.title", "助手日志：连接、配对、启动失败都记在这里")}>
              <FolderOpen className="size-3" />
              {t("agent.log.open", "打开日志")}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
