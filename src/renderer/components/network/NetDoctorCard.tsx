import { useEffect, useState } from "react";
import { Activity, Globe, RefreshCw, Router, Wifi } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { useNetDoctor } from "@/hooks/useNetDoctor";
import { describeDoctor, physicalLan, virtualCount } from "@/lib/netdoctor";
import type { NetDoctor } from "@/lib/types";
import { cx } from "@/lib/utils";

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

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Activity className="size-4 text-gray-800" />
        <h3 className="t-h-14 text-gray-1000">网络体检</h3>
        <span className="t-label-12 text-gray-700">只看「外网能不能进来」，不动任何系统设置</span>
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

      <div className="grid gap-1.5 sm:grid-cols-2">
        <Row icon={<Wifi className="size-3.5" />} label="本机地址" value={lan || "没找到"} ok={Boolean(lan)} />
        <Row
          icon={<Globe className="size-3.5" />}
          label="公网 IPv4"
          value={doctor?.publicV4 || "没拿到"}
          ok={Boolean(doctor?.publicV4)}
        />
        <Row
          icon={<Globe className="size-3.5" />}
          label="公网 IPv6"
          value={doctor?.publicV6 || "没有"}
          ok={Boolean(doctor?.publicV6)}
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
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  ok?: boolean;
  unknown?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-background-100 px-2.5 py-1.5 shadow-geist-border">
      <span className={cx("shrink-0", ok ? "text-green-900" : unknown ? "text-gray-700" : "text-amber-900")}>{icon}</span>
      <span className="w-20 shrink-0 t-label-12 text-gray-700">{label}</span>
      <span className="t-mono-12 min-w-0 flex-1 truncate text-gray-1000" title={value}>
        {value}
      </span>
    </div>
  );
}
