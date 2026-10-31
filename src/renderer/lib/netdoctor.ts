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
    return { tone: "gray", title: "还没体检", detail: "点击检测，评估外网访问是否可行。", lan: null };
  }

  const nat = d.stun?.nat ?? "unknown";
  const upnp = Boolean(d.upnp?.available);

  if (nat === "symmetric") {
    return {
      tone: "amber",
      title: "对称 NAT：直连基本不通",
      detail: "对称 NAT 下打洞与 UPnP 均无法生效，建议使用隧道；若可获得公网 IPv6 地址，优先使用 IPv6。",
      lan,
    };
  }

  if (nat === "cone" && upnp) {
    return {
      tone: "green",
      title: "有直连的机会",
      detail: "NAT 支持打洞，路由器也支持 UPnP，为 25565 添加一条 TCP 端口映射后，朋友即可直连。",
      lan,
    };
  }

  if (nat === "cone" && !upnp) {
    return {
      tone: "amber",
      title: "NAT 支持打洞，但路由器未响应 UPnP 请求",
      detail: "可在路由器后台手动映射 25565，或直接使用隧道。",
      lan,
    };
  }

  if (upnp) {
    return {
      tone: "green",
      title: "路由器支持 UPnP",
      detail: "可在路由器中为 25565 添加 TCP 映射；若仍不通，建议使用隧道。",
      lan,
    };
  }

  return {
    tone: "gray",
    title: "NAT 没测出来",
    detail: "UDP 可能被运营商或防火墙拦截，此情况建议使用隧道。",
    lan,
  };
}
