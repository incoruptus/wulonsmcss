/**
 * 极简 Minecraft Server List Ping 应答器，用来验证 net:ping 的协议实现
 *   node scripts/mock-slp.cjs 28510
 */
const net = require("net");

function varint(value) {
  const out = [];
  let v = value;
  for (;;) {
    let byte = v & 0x7f;
    v >>>= 7;
    if (v !== 0) byte |= 0x80;
    out.push(byte);
    if (v === 0) break;
  }
  return Buffer.from(out);
}

const port = Number(process.argv[2] || 28510);
const status = {
  version: { name: "26.1", protocol: 773 },
  players: { online: 3, max: 10, sample: [{ name: "Steve", id: "0000" }] },
  description: { text: "朋友的生存服", extra: [{ text: " · 晚上八点开" }] },
};

const server = net.createServer((socket) => {
  let buf = Buffer.alloc(0);
  socket.on("data", (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    // 状态请求就是最后两个字节 0x01 0x00
    if (buf.length >= 2 && buf[buf.length - 2] === 0x01 && buf[buf.length - 1] === 0x00) {
      const json = Buffer.from(JSON.stringify(status), "utf8");
      const payload = Buffer.concat([Buffer.from([0x00]), varint(json.length), json]);
      socket.write(Buffer.concat([varint(payload.length), payload]));
      buf = Buffer.alloc(0);
    }
  });
  socket.on("error", () => {});
});

server.listen(port, "127.0.0.1", () => console.log(`mock SLP on 127.0.0.1:${port}`));
setTimeout(() => process.exit(0), 30000);
