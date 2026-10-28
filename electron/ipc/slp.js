/**
 * Minecraft Server List Ping
 * ------------------------------------------------------------
 * 不装插件也能问出「在线人数 / 版本 / MOTD」，和多人游戏列表里看到的是同一份数据。
 * 协议：Handshake(packetId 0) → Status Request(0x01 0x00) → JSON。
 * 全部手写，避免为这点东西引依赖。
 */

const net = require("net");

function varint(value) {
  const out = [];
  let v = value;
  for (;;) {
    let byte = v & 0x7f;
    v >>>= 7;
    if (v) byte |= 0x80;
    out.push(byte);
    if (!v) break;
  }
  return Buffer.from(out);
}

function readVarint(buf, offset) {
  let result = 0;
  let shift = 0;
  let i = offset;
  for (;;) {
    if (i >= buf.length) return null;
    const byte = buf[i++];
    result |= (byte & 0x7f) << shift;
    if (!(byte & 0x80)) return [result, i];
    shift += 7;
  }
}

function putString(text) {
  const bytes = Buffer.from(text, "utf8");
  return Buffer.concat([varint(bytes.length), bytes]);
}

/** description 可能是字符串，也可能是 {text, extra} 结构 */
function minecraftText(value) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  return `${value.text ?? ""}${Array.isArray(value.extra) ? value.extra.map(minecraftText).join("") : ""}`;
}

/**
 * @returns {Promise<{ok:boolean, online:boolean, ms?:number, players?:{online:number,max:number}, version?:string, motd?:string, error?:string}>}
 */
function ping(host = "127.0.0.1", port = 25565, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = net.createConnection({ host, port: Number(port) });
    let buf = Buffer.alloc(0);
    let settled = false;

    const finish = (payload) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(payload);
    };

    socket.setTimeout(timeoutMs, () => finish({ ok: false, online: false, error: "连接超时" }));

    socket.on("connect", () => {
      const payload = Buffer.concat([
        varint(0), // handshake
        varint(47), // protocol（-1 也行，47 更稳）
        putString(host),
        Buffer.from([(Number(port) >> 8) & 0xff, Number(port) & 0xff]),
        varint(1), // next state = status
      ]);
      socket.write(Buffer.concat([varint(payload.length), payload]));
      socket.write(Buffer.from([0x01, 0x00])); // status request
    });

    socket.on("data", (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      const header = readVarint(buf, 0);
      if (!header) return;
      const [packetLen, afterLen] = header;
      if (buf.length < afterLen + packetLen) return;

      const body = buf.subarray(afterLen, afterLen + packetLen);
      const pid = readVarint(body, 0);
      if (!pid) return;
      const strLen = readVarint(body, pid[1]);
      if (!strLen) return;

      const json = body.subarray(strLen[1], strLen[1] + strLen[0]).toString("utf8");
      try {
        const data = JSON.parse(json);
        finish({
          ok: true,
          online: true,
          ms: Date.now() - start,
          players: { online: data?.players?.online ?? 0, max: data?.players?.max ?? 0 },
          version: data?.version?.name ?? "",
          motd: minecraftText(data?.description),
        });
      } catch (e) {
        finish({ ok: false, online: false, error: "状态解析失败" });
      }
    });

    socket.on("error", (err) => finish({ ok: false, online: false, error: err.message }));
  });
}

module.exports = { ping, varint, readVarint, minecraftText };
