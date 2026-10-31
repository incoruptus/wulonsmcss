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
    return { tone: "gray", title: "还没检查", detail: "点一下检查，看看朋友现在能不能进来。", lan: null };
  }

  const nat = d.stun?.nat ?? "unknown";
  const upnp = Boolean(d.upnp?.available);

  if (nat === "symmetric" && d.publicV6) {
    return {
      tone: "green",
      title: "可以试试直连",
      detail: "检测到一条可直连的地址。先复制给朋友试一次，连不上再换中转线路。",
      lan,
    };
  }

  if (nat === "symmetric") {
    return {
      tone: "amber",
      title: "朋友不能直接进来",
      detail: "你的网络不允许外面主动连进来。用下面的中转线路，让朋友通过中转进来。",
      lan,
    };
  }

  if (nat === "cone" && upnp) {
    return {
      tone: "green",
      title: "可能可以直接进",
      detail: "路由器支持自动开一个入口。点下面的开端口，再把地址发给朋友。",
      lan,
    };
  }

  if (nat === "cone" && !upnp) {
    return {
      tone: "amber",
      title: "需要手动开一个入口",
      detail: "路由器没有响应自动开端口。可以到路由器后台手动设置，或者直接用中转线路。",
      lan,
    };
  }

  if (upnp) {
    return {
      tone: "green",
      title: "路由器可以自动开端口",
      detail: "点下面的开端口，再把地址发给朋友；如果还是连不上，就用中转线路。",
      lan,
    };
  }

  return {
    tone: "gray",
    title: "还没判断出来",
    detail: "可以再检查一次，或者直接使用中转线路。",
    lan,
  };
}
