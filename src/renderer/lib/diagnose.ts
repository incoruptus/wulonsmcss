/**
 * 进服诊断码
 * ------------------------------------------------------------
 * 玩家进不去时，最没用的一句话是「连不上」。
 * 这里把「房间 + 探测结果 + 客户端体检」压成一段可以发回给服主的码，
 * 服主粘贴就能还原现场，不用来回问二十个问题。
 *
 * 只带排障需要的字段：不收集账号、UUID、聊天记录、绝对路径以外的隐私。
 */

import { deflate, fromB64Url, hash6, inflate, toB64Url, type RoomDescriptorV1 } from "./room";
import type { ReachReport } from "./reach";
import type { CheckupResult } from "./checkup";

export interface DiagnosticV1 {
  v: 1;
  at: number;
  /** 被诊断的房间 */
  room: { name: string; mc: string; loader: string; addr: string; addrs: string[] };
  /** 玩家端每条地址的探测结果 */
  probes: { k: string; a: string; ok: boolean; checked: boolean; ms?: number; e?: string }[];
  /** 客户端体检（没跑到就没有） */
  client?: {
    dir: string;
    exists: boolean;
    verdict: string;
    match: string | null;
    candidates: string[];
    missing: string[];
  };
  /** 本机检测到的启动器 */
  launchers?: string[];
  /** 玩家自己写的一句话 */
  note?: string;
}

export interface DiagnosticInput {
  room: RoomDescriptorV1;
  reach?: ReachReport | null;
  checkup?: CheckupResult | null;
  launchers?: { name: string }[];
  note?: string;
}

const MAX_MISSING = 30;
const MAX_CANDIDATES = 10;

/** 从页面现有状态拼一份诊断（纯函数，方便测试） */
export function buildDiagnostic(input: DiagnosticInput): DiagnosticV1 {
  const { room, reach, checkup, launchers, note } = input;
  return {
    v: 1,
    at: Date.now(),
    room: {
      name: room.name,
      mc: room.mc,
      loader: room.loader,
      addr: room.addr,
      addrs: (room.addrs ?? []).map((a) => `${a.k}:${a.host}:${a.port}`),
    },
    probes: (reach?.probes ?? []).map((p) => ({
      k: p.target.kind,
      a: p.addr,
      ok: p.ok,
      checked: p.checked,
      ms: p.ms,
      e: p.error,
    })),
    client: checkup
      ? {
          dir: checkup.dir,
          exists: checkup.exists,
          verdict: checkup.verdict,
          match: checkup.match,
          candidates: checkup.candidates.map((c) => `${c.id} (${c.loader} ${c.mcVersion})`).slice(0, MAX_CANDIDATES),
          missing: checkup.mods.missing.map((m) => m.n ?? m.p).slice(0, MAX_MISSING),
        }
      : undefined,
    launchers: launchers?.map((l) => l.name).slice(0, 6),
    note: note?.trim() || undefined,
  };
}

/** 生成诊断码：`d1z.<校验>.<payload>`，和房间码同一套编码 */
export async function encodeDiagnostic(d: DiagnosticV1): Promise<string> {
  const json = JSON.stringify(d);
  const raw = new TextEncoder().encode(json);
  const zipped = await deflate(raw);
  const body = toB64Url(zipped ?? raw);
  return `d1${zipped ? "z" : "p"}.${hash6(json)}.${body}`;
}

/** 从一段粘贴内容里解出诊断；认不出就给中文原因 */
export async function decodeDiagnostic(input: string): Promise<DiagnosticV1> {
  const text = String(input || "");
  const match = text.match(/d1[zp]\.[0-9a-z]{6}\.[A-Za-z0-9\-_]+/);
  if (!match) throw new Error("没认出诊断码：应该以 d1z. 或 d1p. 开头");

  const [, mode, check, body] = /^d1([zp])\.([0-9a-z]{6})\.([A-Za-z0-9\-_]+)$/.exec(match[0])!;
  let bytes = fromB64Url(body);
  if (mode === "z") bytes = await inflate(bytes);

  const json = new TextDecoder().decode(bytes);
  if (hash6(json) !== check) throw new Error("诊断码校验不通过（可能复制少了几位）");

  let parsed: DiagnosticV1;
  try {
    parsed = JSON.parse(json) as DiagnosticV1;
  } catch {
    throw new Error("诊断码内容损坏");
  }
  if (parsed.v !== 1) throw new Error("诊断码来自更新的版本，请升级后再看");
  if (!parsed.room?.mc || !Array.isArray(parsed.probes)) throw new Error("诊断码信息不完整");
  return parsed;
}

/** 给服主看的一句话结论 */
export function diagnosticHeadline(d: DiagnosticV1): string {
  const online = d.probes.filter((p) => p.checked && p.ok);
  if (!online.length) {
    return d.probes.length
      ? "玩家一条地址都没连上：先确认服务器在跑、隧道没掉。"
      : "玩家没有拿到任何可探测的地址：邀请可能生成错了。";
  }
  const client = d.client;
  if (!client) return "网络是通的，但还没读到玩家的客户端信息。";
  if (client.verdict === "ready") return "网络和客户端都正常，问题可能在正版验证或白名单。";
  if (client.verdict === "need-mods") return `网络通，但玩家缺 ${client.missing.length} 个 Mod。`;
  if (client.verdict === "need-version") return "网络通，但玩家没有对应版本/加载器的实例。";
  if (client.verdict === "no-client" || client.verdict === "no-version") return "网络通，但玩家这台机器还没有可用的客户端。";
  return "网络通，客户端还需要检查。";
}
