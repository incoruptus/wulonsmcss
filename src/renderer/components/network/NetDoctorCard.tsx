import { useEffect, useState } from "react";
import { Activity, Copy, Globe, RefreshCw, Router, Wifi } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { Callout } from "@/components/ui/callout";
import { useNetDoctor } from "@/hooks/useNetDoctor";
import { describeDoctor, physicalLan, virtualCount } from "@/lib/netdoctor";
import type { NetDoctor } from "@/lib/types";
import { copyText, cx } from "@/lib/utils";
import { useI18n } from "@/i18n";

const NAT_TEXT: Record<NetDoctor["stun"]["nat"], { key: string; text: string }> = {
  cone: { key: "netdoctor.nat.cone", text: "锥形（可打洞）" },
  symmetric: { key: "netdoctor.nat.symmetric", text: "对称（只能中继）" },
  unknown: { key: "netdoctor.nat.unknown", text: "没测出来" },
};

/** 联机页顶部的网络体检：解释「能不能直连」，端口映射必须用户显式点 */
export function NetDoctorCard({ port }: { port: number }) {
  const { t } = useI18n();
  const { doctor, checking, error, refresh } = useNetDoctor();
  const advice = describeDoctor(doctor);
  const lan = physicalLan(doctor?.interfaces ?? []);
  const virtual = virtualCount(doctor?.interfaces ?? []);
  const [mapping, setMapping] = useState(false);
  const [unmapping, setUnmapping] = useState(false);
  const [mapped, setMapped] = useState<{ port: number; externalIp?: string } | null>(null);
  const v6Addr = doctor?.publicV6 ? `[${doctor.publicV6}]:${port}` : "";
  const v4Addr = doctor?.publicV4 ? `${doctor.publicV4}:${port}` : "";

  // 记一下上次映射：切页面回来还能看到「撤销」，不用让用户去路由器里翻
  const storageKey = `mcss.upnp.${port}`;
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      setMapped(raw ? (JSON.parse(raw) as { port: number; externalIp?: string }) : null);
    } catch {
      setMapped(null);
    }
  }, [storageKey]);

  function remember(next: { port: number; externalIp?: string } | null) {
    setMapped(next);
    try {
      if (next) localStorage.setItem(storageKey, JSON.stringify(next));
      else localStorage.removeItem(storageKey);
    } catch {}
  }

  async function mapPort() {
    if (!doctor || !lan) return;
    const ok = window.confirm(
      t(
        "netdoctor.upnp.confirm",
        "将在路由器上将 TCP 端口 {port} 映射到 {lan}:{port}，玩家即可通过公网地址直连。\n\n只会添加这一条 TCP 映射规则，可随时撤销；若更换网络或重启路由器，可能需要重新开启。是否继续？",
        { port, lan },
      ),
    );
    if (!ok) return;
    setMapping(true);
    try {
      const res = await window.mcss.net.upnpMap({ port, lanIp: lan });
      if (!res.ok) throw new Error(res.error || t("netdoctor.upnp.refused", "路由器拒绝映射"));
      remember({ port, externalIp: res.externalIp });
      toast.success(t("netdoctor.upnp.mapped", "端口已映射"), {
        description: `${res.externalIp || doctor.publicV4 || t("netdoctor.publicIp", "公网 IP")}:${port} → ${lan}:${port}`,
      });
      void refresh();
    } catch (e) {
      toast.error(t("netdoctor.upnp.mapFailed", "映射失败"), { description: (e as Error).message });
    } finally {
      setMapping(false);
    }
  }

  async function unmapPort() {
    setUnmapping(true);
    try {
      const res = await window.mcss.net.upnpUnmap({ port });
      if (!res.ok) throw new Error(res.error || t("netdoctor.upnp.unmapRefused", "路由器拒绝撤销"));
      remember(null);
      toast.success(t("netdoctor.upnp.unmapped", "已撤销端口映射"));
      void refresh();
    } catch (e) {
      toast.error(t("netdoctor.upnp.unmapFailed", "撤销失败"), { description: (e as Error).message });
    } finally {
      setUnmapping(false);
    }
  }

  async function copyAddress(value: string, label: string) {
    const ok = await copyText(value);
    if (ok) toast.success(t("netdoctor.copied", "已复制{label}", { label }), { description: t("netdoctor.copiedHint", "发给朋友，让他填进 Minecraft 的直接连接里") });
    else toast.error(t("netdoctor.copyFailed", "复制失败，请手动选中地址复制"));
  }

  function scrollToTunnel() {
    document.getElementById("frp-tunnel")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Activity className="size-4 text-gray-800" />
        <h3 className="t-h-14 text-gray-1000">{t("netdoctor.title", "朋友能不能进来")}</h3>
        <span className="t-label-12 text-gray-700">{t("netdoctor.subtitle", "先检查，再按下面的下一步操作")}</span>
        <Button variant="ghost" size="sm" className="ml-auto" onClick={() => void refresh()} disabled={checking}>
          <RefreshCw className={cx("size-3.5", checking && "animate-spin")} />
          {t("netdoctor.recheck", "重新检测")}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={advice.tone} size="md">
          {checking ? t("netdoctor.checking", "正在检测…") : advice.title}
        </Badge>
        <span className="t-label-12 min-w-0 flex-1 text-gray-800">{checking ? t("netdoctor.checkingDetail", "正在检查网络，预计需要几秒…") : advice.detail}</span>
      </div>

      {doctor && !checking ? (
        <Callout
          tone="info"
          title={v6Addr ? t("netdoctor.next.direct", "下一步：把直连地址发给朋友") : doctor.stun.nat === "symmetric" ? t("netdoctor.next.relay", "下一步：开一条中转线路") : t("netdoctor.next.port", "下一步：开一个入口或走中转")}
          action={
            v6Addr ? (
              <>
                <Button size="xs" variant="secondary" onClick={() => void copyAddress(v6Addr, t("netdoctor.directAddress", "直连地址"))}>
                  <Copy className="size-3" />
                  {t("netdoctor.copyAddress", "复制地址")}
                </Button>
                <Button size="xs" variant="ghost" onClick={scrollToTunnel}>
                  {t("netdoctor.switchRelay", "连不上？换中转线路")}
                </Button>
              </>
            ) : doctor.stun.nat === "symmetric" ? (
              <Button size="xs" variant="secondary" onClick={scrollToTunnel}>
                {t("netdoctor.openRelay", "去开中转线路")}
              </Button>
            ) : undefined
          }
        >
          {v6Addr ? (
            <>
              <p>
                {t("netdoctor.hint.direct", "让朋友在 Minecraft「直接连接」里粘贴下面这行。服务器启动后再发；如果朋友连不上，点「换中转线路」继续。")}
              </p>
              <div className="mt-2 rounded-lg bg-background-100 px-2.5 py-2 shadow-geist-border">
                <code className="t-mono-12 break-all text-gray-1000">{v6Addr}</code>
              </div>
            </>
          ) : doctor.stun.nat === "symmetric" ? (
            <p>{t("netdoctor.hint.symmetric", "你的网络不能直接让外面连进来。在下面的「中转线路」里开一条，把分配到的地址发给朋友。")}</p>
          ) : doctor.publicV4 && doctor.upnp.available ? (
            <p>{t("netdoctor.hint.upnp", "路由器支持自动开端口。点下面的开端口，再把地址发给朋友。")}</p>
          ) : (
            <p>{t("netdoctor.hint.none", "当前没有可直连的地址。在下面的「中转线路」里开一条，再把分配到的地址发给朋友。")}</p>
          )}
        </Callout>
      ) : null}

      <details className="rounded-xl bg-background-200 p-2.5">
        <summary className="cursor-pointer t-label-12 text-gray-700">{t("netdoctor.details", "技术详情：地址与网络类型")}</summary>
        <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
          <Row
            icon={<Wifi className="size-3.5" />}
            label={t("netdoctor.lan", "本机地址")}
            value={lan || t("netdoctor.notFound", "没找到")}
            ok={Boolean(lan)}
            copyValue={lan ? `${lan}:${port}` : undefined}
            onCopy={copyAddress}
          />
          <Row
            icon={<Globe className="size-3.5" />}
            label={t("netdoctor.publicV4", "公网 IPv4")}
            value={doctor?.publicV4 || t("netdoctor.noV4", "没拿到")}
            ok={Boolean(doctor?.publicV4)}
            copyValue={v4Addr || undefined}
            onCopy={copyAddress}
          />
          <Row
            icon={<Globe className="size-3.5" />}
            label={t("netdoctor.publicV6", "公网 IPv6")}
            value={doctor?.publicV6 || t("netdoctor.noV6", "没有")}
            ok={Boolean(doctor?.publicV6)}
            copyValue={v6Addr || undefined}
            onCopy={copyAddress}
          />
          <Row
            icon={<Router className="size-3.5" />}
            label={t("netdoctor.nat", "NAT")}
            value={doctor ? t(NAT_TEXT[doctor.stun.nat].key, NAT_TEXT[doctor.stun.nat].text) : "—"}
            ok={doctor?.stun.nat === "cone"}
            unknown={doctor?.stun.nat === "unknown"}
          />
          <Row
            icon={<Router className="size-3.5" />}
            label={t("netdoctor.upnp", "路由器 UPnP")}
            value={
              doctor
                ? doctor.upnp.available
                  ? t("netdoctor.upnp.available", "可用") + (doctor.upnp.externalIp ? t("netdoctor.upnp.externalIp", " · 外网 IP {ip}", { ip: doctor.upnp.externalIp }) : "")
                  : doctor.upnp.error || t("netdoctor.upnp.unavailable", "不可用")
                : "—"
            }
            ok={Boolean(doctor?.upnp.available)}
            unknown={!doctor}
          />
          <Row
            icon={<Globe className="size-3.5" />}
            label={t("netdoctor.stun", "STUN 映射")}
            value={doctor?.stun.mapped || doctor?.stun.error || "—"}
            ok={Boolean(doctor?.stun.ok)}
            unknown={!doctor}
          />
        </div>
      </details>

      {doctor?.upnp.available && lan ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-background-100 p-2.5 shadow-geist-border">
          <Router className="size-3.5 shrink-0 text-gray-800" />
          <span className="t-label-12 min-w-0 flex-1 text-gray-800">
            {mapped
              ? t("netdoctor.upnp.mappedHint", "已开通：朋友用 {addr} 连接", { addr: `${mapped.externalIp || doctor.upnp.externalIp || t("netdoctor.publicIp", "公网 IP")}:${mapped.port}` })
              : t("netdoctor.upnp.offer", "可以在路由器上自动开一个入口，让朋友直连；只添加这一条规则，可随时撤销。")}
          </span>
          {mapped ? (
            <Button size="xs" variant="secondary" onClick={() => void unmapPort()} loading={unmapping}>
              {t("netdoctor.upnp.unmap", "撤销映射")}
            </Button>
          ) : (
            <Button size="xs" onClick={() => void mapPort()} loading={mapping}>
              {t("netdoctor.upnp.map", "在路由器上开端口")}
            </Button>
          )}
        </div>
      ) : null}

      {error ? <p className="t-label-12 text-red-900">{error}</p> : null}

      {doctor?.interfaces.length ? (
        <details className="rounded-lg bg-background-200 p-2.5">
          <summary className="cursor-pointer t-label-12 text-gray-700">
            {t("netdoctor.ifaces", "本机 {n} 个地址", { n: doctor.interfaces.length })}{virtual ? t("netdoctor.ifacesVirtual", "（{n} 个虚拟网卡）", { n: virtual }) : ""}
          </summary>
          <div className="mt-1.5 space-y-1">
            {doctor.interfaces.map((n) => (
              <div key={`${n.name}:${n.address}`} className="flex items-center gap-2 t-label-12">
                <span className={cx("min-w-0 flex-1 truncate", n.virtual ? "text-gray-700" : "text-gray-900")}>
                  {n.name}
                </span>
                <span className="t-mono-12 text-gray-800">{n.address}</span>
                <span className="w-10 shrink-0 text-right text-gray-700">{n.family}</span>
                {n.virtual ? <span className="w-14 shrink-0 text-right text-gray-700">{t("netdoctor.virtual", "虚拟")}</span> : <span className="w-14 shrink-0" />}
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function Row({
  icon,
  label,
  value,
  ok,
  unknown,
  copyValue,
  onCopy,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  ok?: boolean;
  unknown?: boolean;
  copyValue?: string;
  onCopy?: (value: string, label: string) => Promise<void>;
}) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-2 rounded-lg bg-background-100 px-2.5 py-1.5 shadow-geist-border">
      <span className={cx("shrink-0", ok ? "text-green-900" : unknown ? "text-gray-700" : "text-amber-900")}>{icon}</span>
      <span className="w-20 shrink-0 t-label-12 text-gray-700">{label}</span>
      <span className="t-mono-12 min-w-0 flex-1 truncate text-gray-1000" title={value}>
        {value}
      </span>
      {copyValue && onCopy ? (
        <button
          type="button"
          className="shrink-0 rounded p-0.5 text-gray-700 transition-colors hover:bg-background-200 hover:text-gray-1000"
          title={t("netdoctor.copyLabel", "复制{label}", { label })}
          aria-label={t("netdoctor.copyLabel", "复制{label}", { label })}
          onClick={() => void onCopy(copyValue, label)}
        >
          <Copy className="size-3" />
        </button>
      ) : null}
    </div>
  );
}
