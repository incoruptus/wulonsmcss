/**
 * 进服可达性（纯逻辑）
 * ------------------------------------------------------------
 * 一条邀请里可以有多条候选地址：同一 WiFi、公网 IPv4、公网 IPv6、隧道。
 * 这里只做「合并、排序、挑最快、给结论」，不碰网络；IO 在 reach-io.ts。
 * 桌面/网页、玩家/服主四线共用同一套判定，测试也不用 mock 网络。
 */

import { tGlobal } from "@/i18n/core";

export type ReachKind = "local" | "lan" | "ipv6" | "public" | "tunnel" | "manual";

export interface ReachTarget {
  kind: ReachKind;
  host: string;
  port: number;
}

export interface ReachProbe {
  target: ReachTarget;
  /** 可展示、可复制的地址（IPv6 会自动带方括号） */
  addr: string;
  ok: boolean;
  /** 这次探测是否真的执行了。外证服务不可用时为 false，结论应为「未知」而不是「离线」 */
  checked: boolean;
  ms?: number;
  via: "local" | "external";
  players?: { online: number; max: number };
  version?: string;
  motd?: string;
  error?: string;
}

export interface ReachReport {
  at: number;
  port: number;
  lanIp: string | null;
  publicV4: string | null;
  publicV6: string | null;
  tunnel: string | null;
  probes: ReachProbe[];
  /** 外证整体不可用时的原因，不影响本机结论 */
  externalError?: string;
}

/** 房间码里的地址（只会是这几种；未知值按手动地址处理） */
export interface RoomAddrRef {
  k: string;
  host: string;
  port: number;
}

/** 服主的结论：朋友能用哪条路进来 */
export type HostVerdict = "public" | "tunnel" | "lan-only" | "local-only" | "offline" | "unknown";

/** 玩家的结论：我现在能不能连上 */
export type PlayerVerdict = "ready" | "offline" | "unknown";

const RANK: Record<ReachKind, number> = { lan: 0, ipv6: 1, public: 2, tunnel: 3, manual: 4, local: 9 };

const KIND_TEXT: Record<ReachKind, { key: string; text: string }> = {
  local: { key: "reach.kind.local", text: "本机" },
  lan: { key: "reach.kind.lan", text: "同一网络" },
  ipv6: { key: "reach.kind.ipv6", text: "直连" },
  public: { key: "reach.kind.public", text: "直连" },
  tunnel: { key: "reach.kind.tunnel", text: "中转" },
  manual: { key: "reach.kind.manual", text: "手动地址" },
};

export function kindLabel(kind: ReachKind): string {
  const item = KIND_TEXT[kind];
  return item ? tGlobal(item.key, item.text) : tGlobal("reach.kind.address", "地址");
}

function valid(host: string, port: number): { host: string; port: number } | null {
  const h = host.trim();
  if (!h) return null;
  if (!Number.isFinite(port) || port < 1 || port > 65535) return null;
  return { host: h, port };
}

/**
 * 解析 host:port。
 * - `1.2.3.4:25565`、`example.com:25565`
 * - `[2001:db8::1]:25565`（IPv6 必须带方括号才能写端口）
 * - 裸 IPv6 `2001:db8::1` → 默认端口
 */
export function parseAddr(input: string, fallbackPort = 25565): { host: string; port: number } | null {
  const text = String(input || "").trim();
  if (!text) return null;

  const bracketed = /^\[([^\]]+)\](?::(\d{1,5}))?$/.exec(text);
  if (bracketed) return valid(bracketed[1], Number(bracketed[2] ?? fallbackPort));

  const colons = (text.match(/:/g) || []).length;
  if (colons === 0) return valid(text, fallbackPort);
  if (colons === 1) {
    const idx = text.indexOf(":");
    return valid(text.slice(0, idx), Number(text.slice(idx + 1) || fallbackPort));
  }
  // 多冒号 = 裸 IPv6，不再猜哪个是端口
  return valid(text, fallbackPort);
}

export function formatAddr(host: string, port: number): string {
  return host.includes(":") ? `[${host}]:${port}` : `${host}:${port}`;
}

/** 合并多个来源的候选地址，按 host:port 去重，先出现的优先 */
export function mergeTargets(groups: ReachTarget[][]): ReachTarget[] {
  const seen = new Set<string>();
  const out: ReachTarget[] = [];
  for (const target of groups.flat()) {
    if (!target?.host) continue;
    const key = `${target.host.toLowerCase()}:${target.port}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(target);
  }
  return out;
}

/** 按「同一 WiFi 优先」排序；同优先级保持原顺序 */
export function sortTargets(targets: ReachTarget[]): ReachTarget[] {
  return [...targets].sort((a, b) => RANK[a.kind] - RANK[b.kind]);
}

/** 房间描述符里和地址有关的部分（老码只有 addr / lan） */
export interface RoomAddresses {
  addr: string;
  lan?: string;
  addrs?: RoomAddrRef[];
}

/** 从房间描述符还原候选地址：新码用 addrs，老码退回 lan + addr */
export function targetsFromRoom(room: RoomAddresses): ReachTarget[] {
  const fromAddrs: ReachTarget[] = [];
  for (const item of room.addrs ?? []) {
    if (!item?.host) continue;
    const kind: ReachKind =
      item.k === "lan" || item.k === "ipv6" || item.k === "public" || item.k === "tunnel" ? item.k : "manual";
    fromAddrs.push({ kind, host: item.host, port: item.port });
  }

  const fromLan: ReachTarget[] = [];
  const lan = room.lan ? parseAddr(room.lan) : null;
  if (lan) fromLan.push({ kind: "lan", host: lan.host, port: lan.port });

  const fromPrimary: ReachTarget[] = [];
  const primary = room.addr ? parseAddr(room.addr) : null;
  if (primary) fromPrimary.push({ kind: "manual", host: primary.host, port: primary.port });

  return sortTargets(mergeTargets([fromAddrs, fromLan, fromPrimary]));
}

/** 能连上的里面按优先级挑一条（局域网永远优先，其次 IPv6、公网、隧道） */
export function chooseBest(probes: ReachProbe[]): ReachProbe | null {
  const ok = probes.filter((p) => p.ok && p.checked);
  ok.sort((a, b) => RANK[a.target.kind] - RANK[b.target.kind] || (a.ms ?? 9999) - (b.ms ?? 9999));
  return ok[0] ?? null;
}

/** 邀请的主地址：尽量选覆盖面最广的那条（隧道 > 公网 > IPv6 > 局域网） */
export function primaryAddress(probes: ReachProbe[]): string | null {
  const order: ReachKind[] = ["tunnel", "public", "ipv6", "lan", "manual"];
  for (const kind of order) {
    const hit = probes.find((p) => p.ok && p.checked && p.target.kind === kind);
    if (hit) return hit.addr;
  }
  return null;
}

export function hostVerdict(probes: ReachProbe[]): HostVerdict {
  const checked = probes.filter((p) => p.checked);
  if (!checked.length) return "unknown";
  const good = (kind: ReachKind) => checked.some((p) => p.ok && p.target.kind === kind);
  if (good("public") || good("ipv6")) return "public";
  if (good("tunnel")) return "tunnel";
  if (good("lan")) return "lan-only";
  if (good("local")) return "local-only";
  return "offline";
}

export function playerVerdict(probes: ReachProbe[]): PlayerVerdict {
  const checked = probes.filter((p) => p.checked);
  if (!checked.length) return "unknown";
  return checked.some((p) => p.ok) ? "ready" : "offline";
}

export function hostSummary(verdict: HostVerdict): { title: string; detail: string } {
  switch (verdict) {
    case "public":
      return { title: tGlobal("reach.host.public.title", "朋友可以进来"), detail: tGlobal("reach.host.public.detail", "这条地址已经能从外网连上，把它发给朋友即可。") };
    case "tunnel":
      return { title: tGlobal("reach.host.tunnel.title", "朋友可以通过中转进来"), detail: tGlobal("reach.host.tunnel.detail", "这条线路多一次中转；如果能直连，优先用直连地址。") };
    case "lan-only":
      return { title: tGlobal("reach.host.lan.title", "只有同一网络能进"), detail: tGlobal("reach.host.lan.detail", "同一个 Wi-Fi 下的朋友可以进；外网朋友需要开一条中转线路。") };
    case "local-only":
      return {
        title: tGlobal("reach.host.local.title", "朋友还进不来"),
        detail: tGlobal("reach.host.local.detail", "服务器只接受本机连接。检查服务器是否绑定了 127.0.0.1，或防火墙是否拦住了 Java。"),
      };
    case "offline":
      return { title: tGlobal("reach.host.offline.title", "服务器没响应"), detail: tGlobal("reach.host.offline.detail", "先启动服务器，等它加载完成后再检查一次。") };
    default:
      return { title: tGlobal("reach.host.unknown.title", "还没检查"), detail: tGlobal("reach.host.unknown.detail", "点一下检查，看看朋友现在能不能进来。") };
  }
}

/** 结论 → 徽章颜色（玩家/服主共用，避免各写一套） */
export function hostTone(verdict: HostVerdict): "green" | "amber" | "red" | "gray" {
  if (verdict === "public" || verdict === "tunnel") return "green";
  if (verdict === "lan-only") return "amber";
  if (verdict === "unknown") return "gray";
  return "red";
}

export function playerSummary(verdict: PlayerVerdict): { title: string; detail: string } {
  switch (verdict) {
    case "ready":
      return { title: tGlobal("reach.player.ready.title", "服务器在线"), detail: tGlobal("reach.player.ready.detail", "已连接服务器，可以进入游戏。") };
    case "offline":
      return { title: tGlobal("reach.player.offline.title", "服务器没响应"), detail: tGlobal("reach.player.offline.detail", "所有地址均已尝试，可能服务器未启动，或双方不在同一网络。") };
    default:
      return { title: tGlobal("reach.player.unknown.title", "还没探测"), detail: tGlobal("reach.player.unknown.detail", "正在确认服务器状态。") };
  }
}

/** 把探测结果转成房间码里的地址列表（只带真正验证过的） */
export function roomAddrsFrom(probes: ReachProbe[]): RoomAddrRef[] {
  const ok = probes.filter((p) => p.ok && p.checked && p.target.kind !== "local");
  return sortTargets(ok.map((p) => p.target)).map((t) => ({ k: t.kind, host: t.host, port: t.port }));
}

/** 一句话解释每条探测结果，UI 直接用 */
export function probeText(probe: ReachProbe): string {
  if (!probe.checked) return probe.error || tGlobal("reach.probe.unknown", "无法探测");
  if (probe.ok) {
    return probe.ms != null
      ? tGlobal("reach.probe.okWithMs", "已连通 · {ms}ms", { ms: probe.ms })
      : tGlobal("reach.probe.ok", "已连通");
  }
  return probe.error || tGlobal("reach.probe.failed", "连不上");
}
