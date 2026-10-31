import { useEffect, useState } from "react";
import { Activity, Copy, Globe, RefreshCw, Router, Wifi } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { useNetDoctor } from "@/hooks/useNetDoctor";
import { describeDoctor, physicalLan, virtualCount } from "@/lib/netdoctor";
import type { NetDoctor } from "@/lib/types";
import { copyText, cx } from "@/lib/utils";

const NAT_LABEL: Record<NetDoctor["stun"]["nat"], string> = {
  cone: "锥形（可打洞）",
  symmetric: "对称（只能中继）",
  unknown: "没测出来",
};

/** 联机页顶部的网络体检：解释「能不能直连」，端口映射必须用户显式点 */
export function NetDoctorCard({ port }: { port: number }) {
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
      `将在路由器上将 TCP 端口 ${port} 映射到 ${lan}:${port}，玩家即可通过公网地址直连。\n\n` +
        `只会添加这一条 TCP 映射规则，可随时撤销；若更换网络或重启路由器，可能需要重新开启。是否继续？`,
    );
    if (!ok) return;
    setMapping(true);
    try {
      const res = await window.mcss.net.upnpMap({ port, lanIp: lan });
      if (!res.ok) throw new Error(res.error || "路由器拒绝映射");
      remember({ port, externalIp: res.externalIp });
      toast.success("端口已映射", {
        description: `${res.externalIp || doctor.publicV4 || "公网 IP"}:${port} → ${lan}:${port}`,
      });
      void refresh();
    } catch (e) {
      toast.error("映射失败", { description: (e as Error).message });
    } finally {
      setMapping(false);
    }
  }

  async function unmapPort() {
    setUnmapping(true);
    try {
      const res = await window.mcss.net.upnpUnmap({ port });
      if (!res.ok) throw new Error(res.error || "路由器拒绝撤销");
      remember(null);
      toast.success("已撤销端口映射");
      void refresh();
    } catch (e) {
      toast.error("撤销失败", { description: (e as Error).message });
    } finally {
      setUnmapping(false);
    }
  }

  async function copyAddress(value: string, label: string) {
    const ok = await copyText(value);
    if (ok) toast.success(`已复制${label}`, { description: "发给朋友，让他填进 Minecraft 的直接连接里" });
    else toast.error("复制失败，请手动选中地址复制");
  }

  function scrollToTunnel() {
    document.getElementById("frp-tunnel")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Activity className="size-4 text-gray-800" />
        <h3 className="t-h-14 text-gray-1000">网络体检</h3>
        <span className="t-label-12 text-gray-700">先判断能不能直连；不能直连时，下一步在下面开隧道</span>
        <Button variant="ghost" size="sm" className="ml-auto" onClick={() => void refresh()} disabled={checking}>
          <RefreshCw className={cx("size-3.5", checking && "animate-spin")} />
          重新检测
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={advice.tone} size="md">
          {checking ? "正在检测…" : advice.title}
        </Badge>
        <span className="t-label-12 min-w-0 flex-1 text-gray-800">{checking ? "正在检测 NAT 类型与路由器，预计需要几秒…" : advice.detail}</span>
      </div>

      {doctor && !checking ? (
        <div className="rounded-xl border border-brand-300/40 bg-brand-100/40 p-3">
          <div className="t-label-13 font-semibold text-gray-1000">
            {v6Addr ? "下一步：把 IPv6 地址发给朋友" : doctor.stun.nat === "symmetric" ? "下一步：开一条隧道" : "下一步：开端口或走隧道"}
          </div>
          {v6Addr ? (
            <>
              <p className="mt-1 t-copy-12 text-gray-800">
                让朋友在 Minecraft「直接连接」里粘贴下面这行。他也要有 IPv6；服务器启动后再发，先让手机 5G 试一次，进不去说明学校封了 IPv6 入站，再走隧道。
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-background-100 px-2.5 py-2 shadow-geist-border">
                <code className="t-mono-12 min-w-0 flex-1 break-all text-gray-1000">{v6Addr}</code>
                <Button size="xs" variant="secondary" onClick={() => void copyAddress(v6Addr, " IPv6 地址")}>
                  <Copy className="size-3" />
                  复制地址
                </Button>
                <Button size="xs" variant="ghost" onClick={scrollToTunnel}>
                  IPv6 不通？走隧道
                </Button>
              </div>
            </>
          ) : doctor.stun.nat === "symmetric" ? (
            <>
              <p className="mt-1 t-copy-12 text-gray-800">
                对称 NAT 下 UPnP 和端口映射都不通。在下面的「隧道配置」里填 SakuraFrp / FRP，拿到公网地址后再发给朋友。
              </p>
              <Button size="xs" variant="secondary" className="mt-2" onClick={scrollToTunnel}>
                去隧道配置
              </Button>
            </>
          ) : doctor.publicV4 && doctor.upnp.available ? (
            <p className="mt-1 t-copy-12 text-gray-800">
              路由器支持 UPnP。可在下面开一条 TCP 端口映射，然后把公网 IPv4 发给朋友。
            </p>
          ) : (
            <p className="mt-1 t-copy-12 text-gray-800">
              当前没有可直连的公网地址。在下面的「隧道配置」里开一条隧道，再把分配到的地址发给朋友。
            </p>
          )}
        </div>
      ) : null}

      <div className="grid gap-1.5 sm:grid-cols-2">
        <Row
          icon={<Wifi className="size-3.5" />}
          label="本机地址"
          value={lan || "没找到"}
          ok={Boolean(lan)}
          copyValue={lan ? `${lan}:${port}` : undefined}
          onCopy={copyAddress}
        />
        <Row
          icon={<Globe className="size-3.5" />}
          label="公网 IPv4"
          value={doctor?.publicV4 || "没拿到"}
          ok={Boolean(doctor?.publicV4)}
          copyValue={v4Addr || undefined}
          onCopy={copyAddress}
        />
        <Row
          icon={<Globe className="size-3.5" />}
          label="公网 IPv6"
          value={doctor?.publicV6 || "没有"}
          ok={Boolean(doctor?.publicV6)}
          copyValue={v6Addr || undefined}
          onCopy={copyAddress}
        />
        <Row
          icon={<Router className="size-3.5" />}
          label="NAT"
          value={doctor ? NAT_LABEL[doctor.stun.nat] : "—"}
          ok={doctor?.stun.nat === "cone"}
          unknown={doctor?.stun.nat === "unknown"}
        />
        <Row
          icon={<Router className="size-3.5" />}
          label="路由器 UPnP"
          value={
            doctor
              ? doctor.upnp.available
                ? `可用${doctor.upnp.externalIp ? ` · 外网 IP ${doctor.upnp.externalIp}` : ""}`
                : doctor.upnp.error || "不可用"
              : "—"
          }
          ok={Boolean(doctor?.upnp.available)}
          unknown={!doctor}
        />
        <Row
          icon={<Globe className="size-3.5" />}
          label="STUN 映射"
          value={doctor?.stun.mapped || doctor?.stun.error || "—"}
          ok={Boolean(doctor?.stun.ok)}
          unknown={!doctor}
        />
      </div>

      {doctor?.upnp.available && lan ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-background-100 p-2.5 shadow-geist-border">
          <Router className="size-3.5 shrink-0 text-gray-800" />
          <span className="t-label-12 min-w-0 flex-1 text-gray-800">
            {mapped
              ? `已映射：${mapped.externalIp || doctor.upnp.externalIp || "公网 IP"}:${mapped.port} → ${lan}:${mapped.port}`
              : `路由器支持 UPnP，可为 ${port} 创建一条 TCP 端口映射，仅添加此条规则，可随时撤销。`}
          </span>
          {mapped ? (
            <Button size="xs" variant="secondary" onClick={() => void unmapPort()} loading={unmapping}>
              撤销映射
            </Button>
          ) : (
            <Button size="xs" onClick={() => void mapPort()} loading={mapping}>
              在路由器上开端口
            </Button>
          )}
        </div>
      ) : null}

      {error ? <p className="t-label-12 text-red-900">{error}</p> : null}

      {doctor?.interfaces.length ? (
        <details className="rounded-lg bg-background-200 p-2.5">
          <summary className="cursor-pointer t-label-12 text-gray-700">
            本机 {doctor.interfaces.length} 个地址{virtual ? `（${virtual} 个虚拟网卡）` : ""}
          </summary>
          <div className="mt-1.5 space-y-1">
            {doctor.interfaces.map((n) => (
              <div key={`${n.name}:${n.address}`} className="flex items-center gap-2 t-label-12">
                <span className={cx("min-w-0 flex-1 truncate", n.virtual ? "text-gray-700" : "text-gray-900")}>
                  {n.name}
                </span>
                <span className="t-mono-12 text-gray-800">{n.address}</span>
                <span className="w-10 shrink-0 text-right text-gray-700">{n.family}</span>
                {n.virtual ? <span className="w-14 shrink-0 text-right text-gray-700">虚拟</span> : <span className="w-14 shrink-0" />}
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
          title={`复制${label}`}
          aria-label={`复制${label}`}
          onClick={() => void onCopy(copyValue, label)}
        >
          <Copy className="size-3" />
        </button>
      ) : null}
    </div>
  );
}
