/**
 * 进服可达性的 IO 层
 * ------------------------------------------------------------
 * 只做三件事：
 *   1. 用本机 SLP 问服务器「你在不在」（走 window.mcss，桌面/网页同契约）；
 *   2. 用第三方 SLP 从公网问一次（给「外网到底通没通」一个正证）；
 *   3. 把公网 IP / 局域网 IP / 隧道地址收集起来，交给 reach.ts 判定。
 *
 * 判定逻辑一律不写在这里，保证四线（桌面/网页、玩家/服主）用同一套结论。
 */

import {
  formatAddr,
  parseAddr,
  targetsFromRoom,
  type ReachProbe,
  type ReachReport,
  type ReachTarget,
  type RoomAddresses,
} from "./reach";

const LOCAL_TIMEOUT = 1500;
const EXTERNAL_TIMEOUT = 7000;
const EXTERNAL_TTL = 20_000;
const IP_TTL = 5 * 60_000;
const IP_FAIL_TTL = 30_000;

type Mcss = Window["mcss"];

function api(): Mcss | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { mcss?: Mcss }).mcss ?? null;
}

async function fetchText(url: string, timeoutMs: number): Promise<string | null> {
  if (typeof fetch !== "function") return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    return (await res.text()).trim();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson<T>(url: string, timeoutMs: number): Promise<T | null> {
  if (typeof fetch !== "function") return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { accept: "application/json" } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/* ---------------- 公网 IP ---------------- */

let ipCache: { at: number; v4: string | null; v6: string | null } | null = null;

/**
 * 本机的公网出口地址。
 * 用 icanhazip 的 v4/v6 两个端点：它能直接回答「有没有公网 IPv6」。
 * 不依赖单一服务：v4 失败时退回 ipinfo。
 */
export async function publicIps(): Promise<{ v4: string | null; v6: string | null }> {
  const now = Date.now();
  if (ipCache) {
    const ttl = ipCache.v4 || ipCache.v6 ? IP_TTL : IP_FAIL_TTL;
    if (now - ipCache.at < ttl) return { v4: ipCache.v4, v6: ipCache.v6 };
  }

  const [v4Text, v6Text] = await Promise.all([
    fetchText("https://ipv4.icanhazip.com", 5000),
    fetchText("https://ipv6.icanhazip.com", 5000),
  ]);

  let v4 = v4Text && !v4Text.includes(":") ? v4Text : null;
  const v6 = v6Text && v6Text.includes(":") ? v6Text : null;

  if (!v4) {
    const info = await fetchJson<{ ip?: string }>("https://ipinfo.io/json", 5000);
    if (info?.ip && !info.ip.includes(":")) v4 = info.ip;
  }

  const out = { v4, v6 };
  ipCache = { at: now, ...out };
  return out;
}

/* ---------------- 本机 SLP ---------------- */

export async function localProbe(target: ReachTarget): Promise<ReachProbe> {
  const addr = formatAddr(target.host, target.port);
  const base = { target, addr, via: "local" as const };
  const client = api();
  if (!client?.net?.ping) {
    return { ...base, ok: false, checked: false, error: "本机助手不可用，只能靠外部探测" };
  }
  try {
    const res = await client.net.ping({ host: target.host, port: target.port, timeoutMs: LOCAL_TIMEOUT });
    if (!res) return { ...base, ok: false, checked: false, error: "探测没有返回" };
    return {
      ...base,
      ok: Boolean(res.ok && res.online !== false),
      checked: true,
      ms: res.ms,
      players: res.players,
      version: res.version,
      motd: res.motd,
      error: res.ok ? undefined : res.error || "连不上",
    };
  } catch (e) {
    return { ...base, ok: false, checked: false, error: (e as Error)?.message || "本机助手不可用" };
  }
}

/* ---------------- 第三方外证 ---------------- */

interface McsrvResponse {
  online?: boolean;
  players?: { online?: number; max?: number };
  version?: string;
  motd?: unknown;
}

const extCache = new Map<string, { at: number; probe: ReachProbe }>();

function motdText(raw: unknown): string | undefined {
  if (typeof raw === "string") return raw;
  if (raw && typeof raw === "object") {
    const clean = (raw as { clean?: unknown }).clean;
    if (Array.isArray(clean)) return clean.filter((x): x is string => typeof x === "string").join("\n");
  }
  return undefined;
}

/**
 * 从公网侧问一次服务器。
 * 注意：外证「通过」是强证据；外证「不通过」不一定是坏事——探测服务本身可能被机房/反爬拦掉。
 * 所以失败只写进 error，不直接判死刑。
 */
export async function externalProbe(target: ReachTarget, fresh = false): Promise<ReachProbe> {
  const addr = formatAddr(target.host, target.port);
  const base = { target, addr, via: "external" as const };
  const key = addr.toLowerCase();

  if (!fresh) {
    const hit = extCache.get(key);
    if (hit && Date.now() - hit.at < EXTERNAL_TTL) return { ...hit.probe, target, addr };
  }

  const hostPart = target.host.includes(":") ? `[${target.host}]` : target.host;
  const json = await fetchJson<McsrvResponse>(`https://api.mcsrvstat.us/3/${hostPart}:${target.port}`, EXTERNAL_TIMEOUT);
  if (!json || typeof json.online !== "boolean") {
    return { ...base, ok: false, checked: false, error: "外部探测服务不可用（不影响本机结论）" };
  }

  const probe: ReachProbe = {
    ...base,
    ok: json.online,
    checked: true,
    players: json.players ? { online: Number(json.players.online ?? 0), max: Number(json.players.max ?? 0) } : undefined,
    version: json.version,
    motd: motdText(json.motd),
    error: json.online ? undefined : "外部探测没连上（可能被防火墙/运营商拦了，也可能探测服务被反爬挡了）",
  };
  extCache.set(key, { at: Date.now(), probe });
  return probe;
}

/* ---------------- 服主 / 玩家两个入口 ---------------- */

async function lanIp(): Promise<string | null> {
  const client = api();
  if (!client?.app?.lanAddress) return null;
  try {
    const res = await client.app.lanAddress();
    return res?.ip || null;
  } catch {
    return null;
  }
}

async function tunnelAddr(): Promise<string | null> {
  const client = api();
  if (!client?.frp?.status) return null;
  try {
    const st = await client.frp.status();
    return st?.running && st.address ? st.address : null;
  } catch {
    return null;
  }
}

/** 服主端：本机 + 局域网先出结果，公网/隧道再补一刀（避免界面干等第三方的 7 秒） */
export async function checkHostReach(
  port: number,
  opts?: { fresh?: boolean; onPartial?: (report: ReachReport) => void },
): Promise<ReachReport> {
  const portNum = Number(port) || 25565;
  // 公网 IP 和隧道状态都不阻塞本地探测
  const ipsPromise = publicIps();
  const tunnelPromise = tunnelAddr();
  const lan = await lanIp();

  const localTargets: ReachTarget[] = [{ kind: "local", host: "127.0.0.1", port: portNum }];
  if (lan && lan !== "127.0.0.1" && lan !== "::1") localTargets.push({ kind: "lan", host: lan, port: portNum });
  const localProbes = await Promise.all(localTargets.map(localProbe));

  const partial: ReachReport = {
    at: Date.now(),
    port: portNum,
    lanIp: lan,
    publicV4: null,
    publicV6: null,
    tunnel: null,
    probes: localProbes,
  };
  opts?.onPartial?.(partial);

  const [ips, tunnel] = await Promise.all([ipsPromise, tunnelPromise]);
  const remoteTargets: ReachTarget[] = [];
  if (ips.v6) remoteTargets.push({ kind: "ipv6", host: ips.v6, port: portNum });
  if (ips.v4) remoteTargets.push({ kind: "public", host: ips.v4, port: portNum });
  const tunnelTarget = tunnel ? parseAddr(tunnel) : null;
  if (tunnelTarget && !remoteTargets.some((t) => t.host === tunnelTarget.host && t.port === tunnelTarget.port)) {
    remoteTargets.push({ kind: "tunnel", host: tunnelTarget.host, port: tunnelTarget.port });
  }

  const remoteProbes = await Promise.all(remoteTargets.map((t) => externalProbe(t, opts?.fresh)));
  const probes = [...localProbes, ...remoteProbes];
  const externalFailed = remoteProbes.some((p) => !p.checked);

  return {
    ...partial,
    at: Date.now(),
    publicV4: ips.v4,
    publicV6: ips.v6,
    tunnel,
    probes,
    externalError: externalFailed ? "外部探测服务暂时不可用，公网结论只能算「未知」" : undefined,
  };
}

/**
 * 玩家端：只打房间里的候选地址。
 * 没有本机助手（静态网页 / 没装 agent）时，退回第三方外证，至少能回答「服务器开着没」。
 */
export async function checkRoomReach(room: RoomAddresses): Promise<ReachReport> {
  const targets = targetsFromRoom(room);
  const portNum = targets[0]?.port ?? 25565;
  const probes = await Promise.all(targets.map(localProbe));

  if (targets.length && probes.every((p) => !p.checked)) {
    const fallbackTarget = targets.find((t) => t.kind !== "lan") ?? targets[0];
    const fallback = await externalProbe(fallbackTarget);
    if (fallback.checked) {
      return {
        at: Date.now(),
        port: fallbackTarget.port,
        lanIp: null,
        publicV4: null,
        publicV6: null,
        tunnel: null,
        probes: [fallback],
        externalError: "本机助手不可用，状态来自第三方探测",
      };
    }
  }

  return {
    at: Date.now(),
    port: portNum,
    lanIp: null,
    publicV4: null,
    publicV6: null,
    tunnel: null,
    probes,
  };
}
