/**
 * 房间描述符（邀请链接 / 房间码）
 * ------------------------------------------------------------
 * 目标：服主把「怎么进服」压成一条自包含的链接发给朋友，不依赖我们托管任何数据。
 * 内容只放「描述」：地址、版本、加载器、Mod 的 Modrinth id —— 文件由客户端自己去拉。
 *
 * 编码：JSON → deflate-raw → base64url，前面加版本位与校验位。
 * 形如：w1z.a1b2c3.<payload>
 */

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
  /** 连接地址 host:port */
  addr: string;
  /** 房主的内网地址（同一 WiFi 时优先用，快很多）；可选 */
  lan?: string;
  /** Minecraft 版本 */
  mc: string;
  /** 服务端核心 */
  loader: string;
  /** 加载器版本（fabric 导出 mrpack 时需要） */
  lv?: string;
  /** 需要的客户端 Mod（按 Modrinth 版本锁定） */
  mods: RoomModRef[];
  /** 过期时间（毫秒时间戳），0/缺省 = 不过期 */
  exp?: number;
  /** 备注 */
  note?: string;
}

const B64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function toB64Url(bytes: Uint8Array): string {
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

function fromB64Url(s: string): Uint8Array {
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
function hash6(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36).padStart(7, "0").slice(-6);
}

async function deflate(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === "undefined") return null;
  try {
    const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}

async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") throw new Error("当前环境不支持解压");
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
  if (!m) throw new Error("这不是一个有效的房间码");
  const [, mode, check, body] = m;

  let bytes = fromB64Url(body);
  if (mode === "z") bytes = await inflate(bytes);
  let json: string;
  try {
    json = new TextDecoder().decode(bytes);
  } catch {
    throw new Error("房间码内容损坏");
  }
  if (hash6(json) !== check) throw new Error("房间码校验不通过（可能少抄了几位）");

  let parsed: RoomDescriptorV1;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("房间码内容无法解析");
  }
  if (parsed.v !== ROOM_VERSION) throw new Error("房间码来自更新的版本，请升级后再试");
  if (parsed.exp && Date.now() > parsed.exp) throw new Error("这个房间已经过期了，让服主重新发一个");
  if (!parsed.addr || !parsed.mc) throw new Error("房间信息不完整");
  return parsed;
}

/** 支持粘贴：完整链接、mcss:// 深链、或光秃秃的房间码 */
export function extractCode(input: string): string {
  const text = String(input || "").trim();
  if (!text) throw new Error("房间码是空的");
  const m = text.match(/(?:w1[zp]\.[0-9a-z]{6}\.[A-Za-z0-9\-_]+)/);
  if (m) return m[0];
  throw new Error("没认出房间码，检查一下是不是漏了开头几位");
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
  vanilla: "原版",
  paper: "Paper",
  purpur: "Purpur",
  fabric: "Fabric",
  forge: "Forge",
  neoforge: "NeoForge",
};

/** 人话版说明，方便直接发给朋友 */
export function roomShareText(room: RoomDescriptorV1, code: string, origin?: string): string {
  const loader = LOADER_NAME[room.loader] ?? room.loader;
  const lines = [
    `来一起玩「${room.name}」吧！`,
    `地址：${room.addr}`,
    `版本：Minecraft ${room.mc}${loader ? ` · ${loader}` : ""}`,
  ];
  if (room.mods.length) lines.push(`朋友要准备：${room.mods.length} 个 Mod（打开链接会自动准备）`);
  lines.push("");
  if (origin) {
    lines.push(`一键进服：${roomWebLink(code, origin)}`);
    lines.push(`房间码：${code}`);
  } else {
    // 没有部署网页时不要伪造 404 链接：直接给码 + 粘贴位置
    lines.push(`房间码：${code}`);
    lines.push("（在 MCSS 的「加入游戏」里粘贴这个码）");
  }
  return lines.join("\n");
}
