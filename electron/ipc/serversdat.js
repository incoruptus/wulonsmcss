/**
 * 往客户端的 servers.dat 里加一条服务器
 * ------------------------------------------------------------
 * servers.dat 是未压缩的 NBT：
 *   TAG_Compound("") { TAG_List("servers", TAG_Compound) [ {name, ip}, ... ] }
 * 只做「追加/更新一条」，保留文件里其它条目。
 */

const fs = require("fs");
const path = require("path");

/* ---------------- 最小 NBT 读写 ---------------- */

function readString(buf, off) {
  const len = buf.readUInt16BE(off);
  return { value: buf.toString("utf8", off + 2, off + 2 + len), next: off + 2 + len };
}

function writeString(text) {
  const bytes = Buffer.from(text, "utf8");
  const head = Buffer.alloc(2);
  head.writeUInt16BE(bytes.length, 0);
  return Buffer.concat([head, bytes]);
}

/**
 * 解析 servers.dat，返回 [{name, ip}]；**读不懂返回 null**（不是空数组）。
 * 空数组代表“文件确实没有服务器”；null 代表“别覆盖，先备份”。
 */
function parse(buf) {
  try {
    if (buf.length < 3 || buf[0] !== 0x0a) return null;
    let off = 3; // root: type(0x0a) + name(len=0)
    const servers = [];
    while (off < buf.length) {
      const type = buf[off];
      if (type === 0x00) break;
      const name = readString(buf, off + 1);
      off = name.next;
      if (type !== 0x09 || name.value !== "servers") return null;
      const count = buf.readInt32BE(off + 1);
      off += 5;
      for (let i = 0; i < count; i++) {
        if (buf[off] !== 0x0a) return null;
        const compName = readString(buf, off + 1);
        off = compName.next;
        const entry = { name: "", ip: "" };
        while (buf[off] !== 0x00) {
          const t = buf[off];
          const n = readString(buf, off + 1);
          off = n.next;
          if (t === 0x08) {
            const v = readString(buf, off);
            off = v.next;
            if (n.value === "name") entry.name = v.value;
            else if (n.value === "ip") entry.ip = v.value;
          } else if (t === 0x01) off += 1;
          else if (t === 0x03) off += 4;
          else if (t === 0x04) off += 8;
          else return null;
        }
        off += 1; // TAG_End
        servers.push(entry);
      }
      return servers;
    }
    return servers;
  } catch (e) {
    return null;
  }
}

function serialize(servers) {
  const parts = [];
  parts.push(Buffer.from([0x0a, 0x00, 0x00])); // root compound, empty name
  parts.push(Buffer.from([0x09])); // list
  parts.push(writeString("servers"));
  parts.push(Buffer.from([0x0a])); // element type = compound
  const count = Buffer.alloc(4);
  count.writeInt32BE(servers.length, 0);
  parts.push(count);
  for (const s of servers) {
    parts.push(Buffer.from([0x0a, 0x00, 0x00])); // compound with empty name
    parts.push(Buffer.from([0x08]));
    parts.push(writeString("name"));
    parts.push(writeString(String(s.name || "Server")));
    parts.push(Buffer.from([0x08]));
    parts.push(writeString("ip"));
    parts.push(writeString(String(s.ip || "")));
    parts.push(Buffer.from([0x00])); // end compound
  }
  parts.push(Buffer.from([0x00])); // end root
  return Buffer.concat(parts);
}

/** 加到 <mcDir>/servers.dat（同 ip 则更新名字） */
function addServer(mcDir, { name, ip }) {
  if (!mcDir) throw new Error("缺少 .minecraft 目录");
  if (!ip) throw new Error("缺少服务器地址");
  const file = path.join(mcDir, "servers.dat");
  let servers = [];
  if (fs.existsSync(file)) {
    const parsed = parse(fs.readFileSync(file));
    if (!parsed) {
      // 读不懂就绝不清空覆盖：先留一份 .bak，让玩家/启动器自己决定
      try {
        fs.copyFileSync(file, `${file}.bak`);
      } catch (e) {}
      throw new Error("servers.dat 里有无法识别的内容，已备份为 servers.dat.bak，没有改动原文件");
    }
    servers = parsed;
  }
  const existing = servers.find((s) => s.ip === ip);
  if (existing) existing.name = name || existing.name;
  else servers.push({ name: name || "Wulon's MCSS", ip });

  fs.mkdirSync(mcDir, { recursive: true });
  fs.writeFileSync(file, serialize(servers));
  return { ok: true, file, count: servers.length, servers };
}

module.exports = { addServer, parse, serialize };
