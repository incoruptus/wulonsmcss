/**
 * 网络体检的「说人话」部分
 * ------------------------------------------------------------
 * 原始数据是给排障用的；这里只负责回答一句：
 * 「我这台机器，朋友从外网进来希望大不大？下一步做什么？」
 */

import type { NetDoctor, NetInterface } from "./types";

export function physicalLan(list: NetInterface[]): string | null {
  const candidates = list.filter((n) => n.family === "IPv4" && !n.internal && !n.virtual);
  return candidates[0]?.address ?? null;
}

export function virtualCount(list: NetInterface[]): number {
  return list.filter((n) => n.virtual && !n.internal).length;
}

export interface DoctorAdvice {
  tone: "green" | "amber" | "gray";
  title: string;
  detail: string;
  lan: string | null;
}

export function describeDoctor(d: NetDoctor | null): DoctorAdvice {
  const lan = d ? physicalLan(d.interfaces) : null;
  if (!d) {
    return { tone: "gray", title: "还没体检", detail: "点一下检测，看看外网进来的希望大不大。", lan: null };
  }

  const nat = d.stun?.nat ?? "unknown";
  const upnp = Boolean(d.upnp?.available);

  if (nat === "symmetric") {
    return {
      tone: "amber",
      title: "对称 NAT：直连基本不通",
      detail: "打洞和 UPnP 都救不了对称 NAT，开一条隧道最稳；能拿到公网 IPv6 的话优先 IPv6。",
      lan,
    };
  }

  if (nat === "cone" && upnp) {
    return {
      tone: "green",
      title: "有直连的机会",
      detail: "NAT 允许打洞，路由器也支持 UPnP；给 25565 做一条 TCP 端口映射，朋友就能直连。",
      lan,
    };
  }

  if (nat === "cone" && !upnp) {
    return {
      tone: "amber",
      title: "NAT 能打洞，但路由器没响应 UPnP",
      detail: "要么去路由器后台手动映射 25565，要么开一条隧道；两条都比干等强。",
      lan,
    };
  }

  if (upnp) {
    return {
      tone: "green",
      title: "路由器支持 UPnP",
      detail: "可以在路由器里给 25565 做 TCP 映射试试；打不通就开隧道。",
      lan,
    };
  }

  return {
    tone: "gray",
    title: "NAT 没测出来",
    detail: "UDP 可能被运营商或防火墙拦了；这种情况隧道最稳。",
    lan,
  };
}
