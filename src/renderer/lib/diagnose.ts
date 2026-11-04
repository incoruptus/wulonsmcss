/**
 * 进服诊断码
 * ------------------------------------------------------------
 * 玩家进不去时，最没用的一句话是「连不上」。
 * 这里把「房间 + 探测结果 + 客户端体检」压成一段可以发回给服主的码，
 * 服主粘贴就能还原现场，不用来回问二十个问题。
 *
 * 只带排障需要的字段：不收集账号、UUID、聊天记录、绝对路径以外的隐私。
 */

import { tGlobal } from "@/i18n/core";
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
  if (!match) throw new Error(tGlobal("diagnose.err.badPrefix", "无法识别诊断码，应以 d1z. 或 d1p. 开头"));

  const [, mode, check, body] = /^d1([zp])\.([0-9a-z]{6})\.([A-Za-z0-9\-_]+)$/.exec(match[0])!;
  let bytes = fromB64Url(body);
  if (mode === "z") {
    try {
      bytes = await inflate(bytes);
    } catch {
      throw new Error(tGlobal("diagnose.err.corruptPartial", "诊断码内容损坏，可能复制时遗漏了部分字符"));
    }
  }

  const json = new TextDecoder().decode(bytes);
  if (hash6(json) !== check) throw new Error(tGlobal("diagnose.err.checksum", "诊断码校验未通过，可能复制时遗漏了部分字符"));

  let parsed: DiagnosticV1;
  try {
    parsed = JSON.parse(json) as DiagnosticV1;
  } catch {
    throw new Error(tGlobal("diagnose.err.corrupt", "诊断码内容损坏"));
  }
  if (parsed.v !== 1) throw new Error(tGlobal("diagnose.err.newerVersion", "诊断码来自更高版本，请升级后再查看"));
  if (!parsed.room?.mc || !Array.isArray(parsed.probes)) throw new Error(tGlobal("diagnose.err.incomplete", "诊断码信息不完整"));
  return parsed;
}

/** 给服主看的下一步：结论之后总要说清楚该做什么 */
export function diagnosticNext(d: DiagnosticV1): { title: string; detail: string; action?: "network" } {
  const online = d.probes.filter((p) => p.checked && p.ok);
  if (!online.length) {
    if (!d.probes.length) {
      return {
        title: tGlobal("diag.next.noAddr.title", "邀请里没有可用地址"),
        detail: tGlobal("diag.next.noAddr.detail", "让朋友重新发一次邀请，或者你在联机页重新生成一条邀请。"),
        action: "network",
      };
    }
    return {
      title: tGlobal("diag.next.offline.title", "朋友还没连上"),
      detail: tGlobal("diag.next.offline.detail", "先确认服务器已经启动。服务器已经在运行时，去联机页开一条中转线路，再把新地址发给朋友。"),
      action: "network",
    };
  }

  const client = d.client;
  if (!client) {
    return {
      title: tGlobal("diag.next.reDiagnose.title", "让朋友再发一次诊断"),
      detail: tGlobal("diag.next.reDiagnose.detail", "网络已经通了，但这次没有读到朋友的客户端信息。让他在加入页重新点一次「复制诊断」。"),
    };
  }
  if (client.verdict === "need-mods") {
    return {
      title: tGlobal("diag.next.needMods.title", "让朋友补齐模组"),
      detail: tGlobal("diag.next.needMods.detail", "网络已经通了，朋友还缺 {n} 个模组。把进服包发给他导入，或者让他装上同样的模组。", { n: client.missing.length }),
    };
  }
  if (client.verdict === "need-version") {
    return {
      title: tGlobal("diag.next.needVersion.title", "让朋友换成对应版本"),
      detail: tGlobal("diag.next.needVersion.detail", "网络已经通了，但朋友没有这个版本和加载器。让他用进服包，或者装成与服务器一致的版本。"),
    };
  }
  if (client.verdict === "no-client" || client.verdict === "no-version") {
    return {
      title: tGlobal("diag.next.noClient.title", "朋友还没装好游戏"),
      detail: tGlobal("diag.next.noClient.detail", "网络已经通了，但朋友的电脑上没找到可用的 Minecraft。让他先安装 Java 版并登录，再回来试。"),
    };
  }
  if (client.verdict === "ready") {
    return {
      title: tGlobal("diag.next.auth.title", "检查正版验证和白名单"),
      detail: tGlobal("diag.next.auth.detail", "网络和客户端都正常。确认服务器没有开启正版验证、白名单里也有朋友的名字，再让他进一次。"),
    };
  }
  return {
    title: tGlobal("diag.next.fallback.title", "让朋友再试一次"),
    detail: tGlobal("diag.next.fallback.detail", "网络已经通了，客户端还需要进一步检查。让朋友重新复制诊断，或把游戏里的报错一起发来。"),
  };
}

/** 给服主看的一句话结论 */
export function diagnosticHeadline(d: DiagnosticV1): string {
  const online = d.probes.filter((p) => p.checked && p.ok);
  if (!online.length) {
    return d.probes.length
      ? tGlobal("diag.headline.none", "玩家未能连接任何地址，请先确认服务器运行状态与中转连接。")
      : tGlobal("diag.headline.noProbe", "玩家未获取到可探测的地址，邀请可能生成有误。");
  }
  const client = d.client;
  if (!client) return tGlobal("diag.headline.noClientInfo", "网络连接正常，但尚未读取到玩家的客户端信息。");
  if (client.verdict === "ready") return tGlobal("diag.headline.ready", "网络与客户端均正常，问题可能出在正版验证或白名单。");
  if (client.verdict === "need-mods") return tGlobal("diag.headline.needMods", "网络连接正常，但玩家缺少 {n} 个模组。", { n: client.missing.length });
  if (client.verdict === "need-version") return tGlobal("diag.headline.needVersion", "网络连接正常，但玩家没有对应版本与加载器的服务器。");
  if (client.verdict === "no-client" || client.verdict === "no-version") return tGlobal("diag.headline.noClient", "网络连接正常，但该玩家的机器上没有可用客户端。");
  return tGlobal("diag.headline.fallback", "网络连接正常，客户端仍需进一步检查。");
}
