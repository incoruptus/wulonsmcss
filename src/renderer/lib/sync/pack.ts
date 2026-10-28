/**
 * 同步包工具：稳定序列化 / 指纹 / 信封构建与解析
 * - stableJson：键排序，跨端字节级一致
 * - quickHash：FNV-1a 四通道 128-bit（非加密，只用于跳过无变化推送与校验截断）
 * - 信封：format + version + checksum 三道闸门，载荷一律 AES-GCM 密文
 */

import { decryptPayload, encryptPayload, pairIdOf } from "./crypto";
import { SYNC_FORMAT, SYNC_FORMAT_VERSION, type SyncEnvelopeV1, type SyncPayloadV1 } from "./types";

export function stableJson(v: unknown): string {
  return JSON.stringify(sortValue(v));
}

function sortValue(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortValue);
  if (v && typeof v === "object") {
    const obj = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      if (obj[key] === undefined) continue;
      out[key] = sortValue(obj[key]);
    }
    return out;
  }
  return v;
}

export function quickHash(v: unknown): string {
  const s = typeof v === "string" ? v : stableJson(v);
  const seeds = [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b];
  const parts: string[] = [];
  for (const seed of seeds) {
    let h = seed >>> 0;
    for (let i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    parts.push(h.toString(16).padStart(8, "0"));
  }
  return parts.join("");
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** 构建加密信封 */
export async function buildEnvelope(
  payload: SyncPayloadV1,
  opts: { deviceId: string; pairCode: string },
): Promise<SyncEnvelopeV1> {
  const enc = await encryptPayload(stableJson(payload), opts.pairCode);
  return {
    format: SYNC_FORMAT,
    version: SYNC_FORMAT_VERSION,
    packId: uid(),
    deviceId: opts.deviceId,
    pairId: pairIdOf(opts.pairCode),
    createdAt: Date.now(),
    crypto: { alg: "AES-GCM", iv: enc.iv, kdf: "PBKDF2-SHA256", iter: enc.iter, gz: enc.gz },
    payload: enc.payloadB64,
    checksum: quickHash(enc.payloadB64),
  };
}

export function serializeEnvelope(envelope: SyncEnvelopeV1): string {
  return JSON.stringify(envelope);
}

function parseEnvelopeBase(text: string): SyncEnvelopeV1 {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("这不是一个同步包（JSON 解析失败）");
  }
  const env = raw as Partial<SyncEnvelopeV1>;
  if (env.format !== SYNC_FORMAT) throw new Error("这不是 Wulon's MCSS 的同步包");
  if (env.version !== SYNC_FORMAT_VERSION) throw new Error("同步包来自更新版本的应用，请先升级");
  if (typeof env.payload !== "string" || typeof env.checksum !== "string") throw new Error("同步包内容不完整");
  if (quickHash(env.payload) !== env.checksum) throw new Error("同步包校验和不一致（可能被截断）");
  return env as SyncEnvelopeV1;
}

/** 解析信封（需要配对码解密） */
export async function parseEnvelope(text: string, pairCode: string): Promise<SyncPayloadV1> {
  const env = parseEnvelopeBase(text);
  let payloadJson: string;
  if (env.crypto?.alg === "AES-GCM") {
    payloadJson = await decryptPayload(env.payload, pairCode, {
      iv: env.crypto.iv,
      iter: env.crypto.iter,
      gz: env.crypto.gz,
    });
  } else {
    try {
      payloadJson = new TextDecoder().decode(b64ToBytes(env.payload));
    } catch {
      throw new Error("同步内容无法解码");
    }
  }
  let payload: unknown;
  try {
    payload = JSON.parse(payloadJson);
  } catch {
    throw new Error("同步内容无法解析");
  }
  const p = payload as Partial<SyncPayloadV1>;
  if (!Array.isArray(p.instances) || !Array.isArray(p.tombstones)) throw new Error("同步内容结构异常");
  return p as SyncPayloadV1;
}

/** 仅供测试：把明文包成 base64 载荷（不做加密） */
export function encodePlainPayload(payload: SyncPayloadV1): string {
  return bytesToB64(new TextEncoder().encode(stableJson(payload)));
}
