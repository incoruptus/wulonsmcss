/**
 * 房间描述符（邀请链接 / 房间码）
 * ------------------------------------------------------------
 * 目标：服主把「怎么进服」压成一条自包含的链接发给朋友，不依赖我们托管任何数据。
 * 内容只放「描述」：地址、版本、加载器、Mod 的 Modrinth id —— 文件由客户端自己去拉。
 *
 * 编码：JSON → deflate-raw → base64url，前面加版本位与校验位。
 * 形如：w1z.a1b2c3.<payload>
 */

import { tGlobal } from "../i18n/core";

export const ROOM_VERSION = 1;
export const ROOM_SCHEME = "mcss";

export interface RoomModRef {
  /** Modrinth project id */
  p: string;
  /** Modrinth version id */
  v: string;
  /** 展示名 */
  n?: string;
}

export interface RoomDescriptorV1 {
  v: 1;
  /** 房间/服务器名 */
  name: string;
  /** 连接地址 host:port（主地址，旧客户端只认这个） */
  addr: string;
  /** 房主的内网地址（同一 WiFi 时优先用，快很多）；可选 */
  lan?: string;
  /**
   * 候选地址（新码才有，旧解码器会忽略）。
   * 玩家端按「局域网 → IPv6 → 公网 → 隧道」自动挑最快的一条，不再让服主做选择题。
   */
  addrs?: { k: string; host: string; port: number }[];
  /** Minecraft 版本 */
  mc: string;
  /** 服务端核心 */
  loader: string;
  /** 加载器版本（fabric 导出 mrpack 时需要） */
  lv?: string;
  /** 需要的 Java 主版本（26.1+ = 25）；缺省时由 mc 推导 */
  java?: number;
  /** 需要的客户端 Mod（按 Modrinth 版本锁定） */
  mods: RoomModRef[];
  /** 过期时间（毫秒时间戳），0/缺省 = 不过期 */
  exp?: number;
  /** 备注 */
  note?: string;
}

const B64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

export function toB64Url(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    out += B64URL[a >> 2];
    out += B64URL[((a & 3) << 4) | ((b ?? 0) >> 4)];
    if (b === undefined) break;
    out += B64URL[((b & 15) << 2) | ((c ?? 0) >> 6)];
    if (c === undefined) break;
    out += B64URL[c & 63];
  }
  return out;
}

export function fromB64Url(s: string): Uint8Array {
  const clean = s.replace(/[^A-Za-z0-9\-_]/g, "");
  const out: number[] = [];
  let buf = 0;
  let bits = 0;
  for (const ch of clean) {
    const v = B64URL.indexOf(ch);
    if (v < 0) continue;
    buf = (buf << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buf >> bits) & 0xff);
    }
  }
  return new Uint8Array(out);
}

/** FNV-1a，用于校验（不防篡改，只防手抄错） */
export function hash6(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36).padStart(7, "0").slice(-6);
}

export async function deflate(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === "undefined") return null;
  try {
    const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}

export async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") throw new Error(tGlobal("room.err.inflate", "当前环境不支持解压"));
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** 生成房间码（w1z.<校验>.<payload>） */
export async function encodeRoom(room: RoomDescriptorV1): Promise<string> {
  const json = JSON.stringify({ ...room, v: ROOM_VERSION });
  const raw = new TextEncoder().encode(json);
  const zipped = await deflate(raw);
  const body = toB64Url(zipped ?? raw);
  return `w1${zipped ? "z" : "p"}.${hash6(json)}.${body}`;
}

/** 从房间码 / 邀请链接里解出描述符 */
export async function decodeRoom(input: string): Promise<RoomDescriptorV1> {
  const code = extractCode(input);
  const m = code.match(/^w1([zp])\.([0-9a-z]{6})\.([A-Za-z0-9\-_]+)$/);
  if (!m) throw new Error(tGlobal("room.err.invalid", "这不是一个有效的房间码"));
  const [, mode, check, body] = m;

  let bytes = fromB64Url(body);
  if (mode === "z") bytes = await inflate(bytes);
  let json: string;
  try {
    json = new TextDecoder().decode(bytes);
  } catch {
    throw new Error(tGlobal("room.err.corrupt", "房间码内容损坏"));
  }
  if (hash6(json) !== check) throw new Error(tGlobal("room.err.checksum", "房间码校验未通过，可能复制时遗漏了部分字符"));

  let parsed: RoomDescriptorV1;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error(tGlobal("room.err.parse", "房间码内容无法解析"));
  }
  if (parsed.v !== ROOM_VERSION) throw new Error(tGlobal("room.err.newer", "房间码来自更高版本，请升级后再试"));
  if (parsed.exp && Date.now() > parsed.exp) throw new Error(tGlobal("room.err.expired", "该房间已过期，请让服主重新发送"));
  if (!parsed.addr || !parsed.mc) throw new Error(tGlobal("room.err.incomplete", "房间信息不完整"));
  return parsed;
}

/** 支持粘贴：完整链接、mcss:// 深链、或光秃秃的房间码 */
export function extractCode(input: string): string {
  const text = String(input || "").trim();
  if (!text) throw new Error(tGlobal("room.err.empty", "房间码是空的"));
  const m = text.match(/(?:w1[zp]\.[0-9a-z]{6}\.[A-Za-z0-9\-_]+)/);
  if (m) return m[0];
  throw new Error(tGlobal("room.err.unrecognized", "无法识别房间码，请检查是否遗漏了开头几位"));
}

/** 邀请链接（给网页用）；origin 由调用方按当前部署地址传入 */
export function roomWebLink(code: string, origin = ""): string {
  // 没部署网页就不要编一个不存在的链接；调用方只在有 origin 时展示
  if (!origin) return "";
  return `${origin.replace(/\/+$/, "")}/#/join/${code}`;
}

/** 深链（唤起本地助手） */
export function roomDeepLink(code: string): string {
  return `${ROOM_SCHEME}://join/${code}`;
}

/** 一键准备好：唤起助手后直接开始生成进服包，不再需要点按钮 */
export function roomInstallLink(code: string): string {
  return `${ROOM_SCHEME}://install/${code}`;
}

const LOADER_NAME: Record<string, string> = {
  vanilla: "Vanilla",
  paper: "Paper",
  purpur: "Purpur",
  fabric: "Fabric",
  forge: "Forge",
  neoforge: "NeoForge",
};

/** 人话版说明，方便直接发给朋友 */
export function roomShareText(room: RoomDescriptorV1, code: string, origin?: string): string {
  const loader =
    room.loader === "vanilla" ? tGlobal("room.loader.vanilla", "原版") : (LOADER_NAME[room.loader] ?? room.loader);
  const lines = [
    tGlobal("room.share.intro", "来一起玩「{name}」吧！", { name: room.name }),
    tGlobal("room.share.addr", "外网：{addr}", { addr: room.addr }),
  ];
  if (room.lan && room.lan !== room.addr) {
    lines.push(tGlobal("room.share.lan", "同一 Wi-Fi：{addr}（同一网络下优先使用，速度更快）", { addr: room.lan }));
  }
  if (room.addrs?.length) {
    lines.push(tGlobal("room.share.addrs", "共 {n} 条地址，进服时会自动选择最快的一条", { n: room.addrs.length }));
  }
  lines.push(tGlobal("room.share.version", "版本：Minecraft {mc}{loader}", { mc: room.mc, loader: loader ? ` · ${loader}` : "" }));
  if (room.mods.length) {
    lines.push(tGlobal("room.share.mods", "玩家需准备 {n} 个模组，打开链接后会自动准备", { n: room.mods.length }));
  }
  lines.push("");
  if (origin) {
    lines.push(tGlobal("room.share.webLink", "一键进服：{url}", { url: roomWebLink(code, origin) }));
    lines.push(tGlobal("room.share.code", "房间码：{code}", { code }));
  } else {
    lines.push(tGlobal("room.share.code", "房间码：{code}", { code }));
    lines.push(tGlobal("room.share.codeHint", "（在 MCSS 的「加入游戏」里粘贴这个码）"));
  }
  return lines.join("\n");
}
