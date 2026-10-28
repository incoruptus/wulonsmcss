/**
 * 生成测试用房间码（与 src/renderer/lib/room.ts 的编码保持一致）
 * 只用于本地验证，不是产品代码。
 *   node scripts/make-room.cjs [lanAddr]
 */
const zlib = require("zlib");

const B64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function toB64Url(bytes) {
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

function hash6(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36).padStart(7, "0").slice(-6);
}

const lan = process.argv[2] || "127.0.0.1:25565";
const room = {
  v: 1,
  name: "局域网测试服",
  addr: "frp.example.com:25565",
  lan,
  mc: "26.1",
  loader: "fabric",
  lv: "0.20.1",
  mods: [{ p: "AANobbMI", v: "uGvVQBnw", n: "Sodium" }],
};

const json = JSON.stringify(room);
const body = toB64Url(zlib.deflateRawSync(Buffer.from(json, "utf8")));
console.log(`w1z.${hash6(json)}.${body}`);
