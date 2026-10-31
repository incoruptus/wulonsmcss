import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { CircleHelp, Globe, Laptop, Link2, Loader2, RefreshCw, Send, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { useReach } from "@/hooks/useReach";
import { useServer } from "@/stores/server";
import { hostSummary, hostTone, hostVerdict, kindLabel, probeText, type ReachKind, type ReachProbe } from "@/lib/reach";
import { cx } from "@/lib/utils";

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
}: {
  port: number;
  onInvite?: () => void;
  notify?: boolean;
}) {
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
      toast.success("朋友现在可以进来了", { description: "公网直连已验证，可以发送邀请了" });
    } else if (verdict === "tunnel") {
      toast.success("隧道已通，可以发邀请了", { description: "玩家通过中继进入，延迟会略高于直连" });
    } else if (verdict === "lan-only") {
      toast("同一 Wi-Fi 已可进入，外网访问还需配置一条隧道", { description: "可点击「开隧道」配置一条，或仅发送给同一 Wi-Fi 下的朋友" });
    } else if (verdict === "local-only") {
      toast.error("服务器只接受本机连接", { description: "请检查 server-ip 是否被设为 127.0.0.1" });
    }
  }, [ready, report, notify, startedAt]);

  const probes = report?.probes ?? [];
  const verdict = hostVerdict(probes);
  const summary = hostSummary(verdict);
  const tone = checking ? "gray" : hostTone(verdict);
  const canInvite = probes.some((p) => p.ok && p.target.kind !== "local");

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={tone} size="md">
          {checking ? "正在检测…" : summary.title}
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
          重新检测
        </Button>
      </div>

      {!ready ? (
        <div className="rounded-lg bg-background-100 p-2.5 t-label-12 text-gray-800 shadow-geist-border">
          {running ? (
            <>
              服务器正在加载，请等待日志输出 <span className="t-mono-12">Done</span> 随后会自动检测一次。
            </>
          ) : (
            <>服务器未运行，启动后会自动检测；如需提前确认网络，可点击「重新检测」。</>
          )}
        </div>
      ) : (
        <p className="t-label-12 text-gray-800">
          {checking && probes.length ? "本机检测已完成，正在通过公网再确认一次…" : summary.detail}
        </p>
      )}

      {probes.length ? (
        <div className="space-y-1">
          {probes.map((probe) => (
            <ProbeRow key={`${probe.target.kind}:${probe.addr}`} probe={probe} />
          ))}
        </div>
      ) : checking ? (
        <div className="rounded-lg bg-background-100 p-2.5 t-label-12 text-gray-700 shadow-geist-border">正在检测…</div>
      ) : null}

      {report?.externalError ? <p className="t-label-12 text-amber-900">{report.externalError}</p> : null}
      {report?.probes.some((p) => p.via === "external") ? (
        <p className="t-label-12 text-gray-700">公网结论来自一次外部回连探测，探测失败时按「未知」处理，不会直接判定服务器不可用。</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        {verdict === "lan-only" || verdict === "local-only" || verdict === "offline" ? (
          <Button size="sm" variant="secondary" onClick={() => navigate("/network")}>
            <Link2 className="size-3.5" />
            开隧道
          </Button>
        ) : null}
        {onInvite ? (
          <Button size="sm" onClick={onInvite} disabled={!canInvite}>
            <Send className="size-3.5" />
            发邀请
          </Button>
        ) : null}
        <span className="t-label-12 text-gray-700">
          {canInvite ? "邀请会自动带上所有验证过的地址" : "至少有一条路通了再发邀请"}
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
