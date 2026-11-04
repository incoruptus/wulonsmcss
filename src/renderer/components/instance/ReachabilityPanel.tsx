import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { CircleHelp, Copy, Globe, Laptop, Link2, Loader2, RefreshCw, Send, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { useReach } from "@/hooks/useReach";
import { useI18n } from "@/i18n";
import { useServer } from "@/stores/server";
import { hostSummary, hostTone, hostVerdict, kindLabel, probeText, chooseBest, type ReachKind, type ReachProbe } from "@/lib/reach";
import { copyText, cx } from "@/lib/utils";

const ICON: Record<ReachKind, React.ReactNode> = {
  local: <Laptop className="size-3.5" />,
  lan: <Wifi className="size-3.5" />,
  ipv6: <Globe className="size-3.5" />,
  public: <Globe className="size-3.5" />,
  tunnel: <Link2 className="size-3.5" />,
  manual: <CircleHelp className="size-3.5" />,
};

/**
 * 「朋友能不能进来」卡片。
 * 服主在首页/实例页看到的是同一份结论：已验证可达 / 仅局域网 / 只接受本机 / 未知。
 * 服务器没加载完时不自动发请求，避免每次开应用都去打第三方探测。
 */
export function ReachabilityPanel({
  port,
  onInvite,
  notify = false,
  variant = "persistent",
}: {
  port: number;
  onInvite?: () => void;
  notify?: boolean;
  /** 临时房间只说这一次的邀请；常驻服务器强调固定地址 */
  variant?: "room" | "persistent";
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const ready = useServer((s) => s.ready);
  const status = useServer((s) => s.status);
  const startedAt = useServer((s) => s.startedAt);
  const running = status === "running" || status === "starting";
  const { report, checking, refresh } = useReach(port, { auto: ready });
  const notifiedFor = useRef<number | null>(null);

  useEffect(() => {
    if (!ready || !report || !notify) return;
    // 同一轮启动只提示一次；旧报告（上一轮服务器）不算
    if (notifiedFor.current === startedAt) return;
    if (startedAt && report.at < startedAt) return;
    notifiedFor.current = startedAt;

    const verdict = hostVerdict(report.probes);
    const fresh = startedAt ? Date.now() - startedAt < 120_000 : false;
    if (!fresh) return;
    if (verdict === "public") {
      toast.success(t("reach.public.title", "朋友现在可以进来了"), { description: t("reach.public.desc", "公网直连已验证，可以发送邀请了") });
    } else if (verdict === "tunnel") {
      toast.success(t("reach.tunnel.title", "中转已通，可以发邀请了"), { description: t("reach.tunnel.desc", "玩家通过中转进入，能直连时优先用直连") });
    } else if (verdict === "lan-only") {
      toast(t("reach.lan.title", "同一网络已可进入，外网朋友还需要一条中转线路"), { description: t("reach.lan.desc", "可点击「开中转线路」配置一条，或只发给同一网络下的朋友") });
    } else if (verdict === "local-only") {
      toast.error(t("reach.localOnly.title", "服务器只接受本机连接"), { description: t("reach.localOnly.desc", "请检查 server-ip 是否被设为 127.0.0.1") });
    }
  }, [ready, report, notify, startedAt]);

  const probes = report?.probes ?? [];
  const verdict = hostVerdict(probes);
  const summary = hostSummary(verdict);
  const tone = checking ? "gray" : hostTone(verdict);
  const canInvite = probes.some((p) => p.ok && p.target.kind !== "local");
  const best = chooseBest(probes);
  const copyAddr = best && best.target.kind !== "local" ? best.addr : "";

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={tone} size="md">
          {checking ? t("reach.checking", "正在检测…") : summary.title}
        </Badge>
        {checking ? <Loader2 className="size-3.5 animate-spin text-gray-700" /> : null}
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          onClick={() => void refresh({ fresh: true })}
          disabled={checking}
        >
          <RefreshCw className={cx("size-3.5", checking && "animate-spin")} />
          {t("reach.recheck", "重新检测")}
        </Button>
      </div>

      {!ready ? (
        <div className="rounded-lg bg-background-100 p-2.5 t-label-12 text-gray-800 shadow-geist-border">
          {running ? (
            <>
              {t("reach.loadingPrefix", "服务器正在加载，请等待日志输出 ")}<span className="t-mono-12">Done</span>{t("reach.loadingSuffix", " 随后会自动检测一次。")}
            </>
          ) : (
            <>{t("reach.notRunning", "服务器未运行，启动后会自动检测；如需提前确认网络，可点击「重新检测」。")}</>
          )}
        </div>
      ) : (
        <p className="t-label-12 text-gray-800">
          {checking && probes.length ? t("reach.localDone", "本机检测已完成，正在通过公网再确认一次…") : summary.detail}
        </p>
      )}

      {probes.length ? (
        <div className="space-y-1">
          {probes.map((probe) => (
            <ProbeRow key={`${probe.target.kind}:${probe.addr}`} probe={probe} />
          ))}
        </div>
      ) : checking ? (
        <div className="rounded-lg bg-background-100 p-2.5 t-label-12 text-gray-700 shadow-geist-border">{t("reach.detecting", "正在检测…")}</div>
      ) : null}

      {report?.externalError ? <p className="t-label-12 text-amber-900">{report.externalError}</p> : null}
      {report?.probes.some((p) => p.via === "external") ? (
        <p className="t-label-12 text-gray-700">{t("reach.externalNote", "公网结论来自一次外部回连探测，探测失败时按「未知」处理，不会直接判定服务器不可用。")}</p>
      ) : null}

      {copyAddr ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-brand-300/40 bg-brand-100/40 px-2.5 py-2">
          <span className="t-label-12 text-gray-800">
            {best?.target.kind === "lan" ? t("reach.lanFill", "同一 Wi-Fi 的朋友在 Minecraft 里填：") : t("reach.directFill", "朋友在 Minecraft「直接连接」里填：")}
          </span>
          <code className="t-mono-12 min-w-0 flex-1 break-all text-gray-1000">{copyAddr}</code>
          <Button
            size="xs"
            variant="secondary"
            onClick={async () => {
              const ok = await copyText(copyAddr);
              if (ok) toast.success(t("reach.addrCopied", "地址已复制，发给朋友即可连接"));
              else toast.error(t("reach.addrCopyFailed", "复制失败，请手动选中地址"));
            }}
          >
            <Copy className="size-3" />
            {t("reach.copyAddr", "复制地址")}
          </Button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        {verdict === "lan-only" || verdict === "local-only" || verdict === "offline" ? (
          <Button size="sm" variant="secondary" onClick={() => navigate("/network")}>
            <Link2 className="size-3.5" />
            {t("reach.openTunnel", "开中转线路")}
          </Button>
        ) : null}
        {onInvite ? (
          <Button size="sm" onClick={onInvite} disabled={!canInvite}>
            <Send className="size-3.5" />
            {t("reach.invite", "发邀请")}
          </Button>
        ) : null}
        <span className="t-label-12 text-gray-700">
          {canInvite
            ? variant === "room"
              ? t("reach.roomOnly", "邀请只对这一次有效，玩完关服即可")
              : t("reach.autoAddrs", "邀请会自动带上所有验证过的地址")
            : t("reach.needPath", "至少有一条路通了再发邀请")}
        </span>
      </div>
    </div>
  );
}

function ProbeRow({ probe }: { probe: ReachProbe }) {
  const ok = probe.ok && probe.checked;
  const unknown = !probe.checked;
  return (
    <div className="flex items-center gap-2 rounded-lg bg-background-100 px-2.5 py-1.5 shadow-geist-border">
      <span className={cx("shrink-0", ok ? "text-green-900" : unknown ? "text-gray-700" : "text-red-900")}>{ICON[probe.target.kind]}</span>
      <span className="w-16 shrink-0 t-label-12 text-gray-700">{kindLabel(probe.target.kind)}</span>
      <span className="t-mono-12 min-w-0 flex-1 truncate text-gray-1000">{probe.addr}</span>
      <span
        className={cx(
          "shrink-0 t-label-12",
          ok ? "text-green-900" : unknown ? "text-gray-700" : "text-red-900",
        )}
        title={probe.error}
      >
        {probeText(probe)}
      </span>
    </div>
  );
}
