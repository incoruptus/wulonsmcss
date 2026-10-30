/**
 * Mod 扫描 / 元数据解析
 * ------------------------------------------------------------
 * 不依赖 tar/unzip 子进程：直接解析 ZIP 中央目录，只读 `fabric.mod.json` 那一条，
 * 100+ 个 jar 的扫描也从秒级降到几十毫秒（比对功能要频繁扫）。
 */

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const EOCD_SIG = 0x06054b50;
const CD_SIG = 0x02014b50;
const LFH_SIG = 0x04034b50;
/** 只读元数据，不该这么大；防恶意 jar 用 zip bomb 把主进程内存打满 */
const MAX_ENTRY = 16 * 1024 * 1024;
const MAX_CD = 4 * 1024 * 1024;

function readRange(fd, position, length) {
  const buf = Buffer.alloc(length);
  const read = fs.readSync(fd, buf, 0, length, position);
  return read === length ? buf : buf.subarray(0, read);
}

function findEocd(tail) {
  for (let i = tail.length - 22; i >= 0; i -= 1) {
    if (tail.readUInt32LE(i) === EOCD_SIG) return i;
  }
  return -1;
}

/** 从 zip 中取出指定文件的内容（找不到返回 null） */
function readZipEntry(filePath, entryName) {
  let fd;
  try {
    const size = fs.statSync(filePath).size;
    if (size < 22) return null;
    fd = fs.openSync(filePath, "r");

    const tailLen = Math.min(size, 66 * 1024);
    const tail = readRange(fd, size - tailLen, tailLen);
    const eocd = findEocd(tail);
    if (eocd < 0) return null;

    const cdSize = tail.readUInt32LE(eocd + 12);
    const cdOffset = tail.readUInt32LE(eocd + 16);
    if (!cdSize || cdSize > MAX_CD || cdOffset + cdSize > size) return null;

    const cd = readRange(fd, cdOffset, cdSize);
    let p = 0;
    const wanted = entryName.toLowerCase();
    while (p + 46 <= cd.length && cd.readUInt32LE(p) === CD_SIG) {
      const method = cd.readUInt16LE(p + 10);
      const compSize = cd.readUInt32LE(p + 20);
      const nameLen = cd.readUInt16LE(p + 28);
      const extraLen = cd.readUInt16LE(p + 30);
      const commentLen = cd.readUInt16LE(p + 32);
      const localOffset = cd.readUInt32LE(p + 42);
      const name = cd.toString("utf8", p + 46, p + 46 + nameLen);
      const lower = name.toLowerCase();
      // 精确匹配，或匹配「任意目录下的同名条目」（frp 的压缩包就是 <根目录>/frpc.exe）
      if (lower === wanted || lower.endsWith("/" + wanted)) {
        const lfh = readRange(fd, localOffset, 30);
        if (lfh.readUInt32LE(0) !== LFH_SIG) return null;
        const lNameLen = lfh.readUInt16LE(26);
        const lExtraLen = lfh.readUInt16LE(28);
        if (compSize > MAX_ENTRY) return null;
        const dataStart = localOffset + 30 + lNameLen + lExtraLen;
        const raw = readRange(fd, dataStart, compSize);
        if (raw.length !== compSize) return null;
        if (method === 0) return raw;
        if (method === 8) return zlib.inflateRawSync(raw, { maxOutputLength: MAX_ENTRY });
        return null;
      }
      p += 46 + nameLen + extraLen + commentLen;
    }
    return null;
  } catch (e) {
    return null;
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch (e) {}
    }
  }
}

function parseFabricMeta(json, file, filePath, size, mtime) {
  const depends = json.depends && typeof json.depends === "object" ? json.depends : {};
  return {
    file,
    path: filePath,
    id: String(json.id || file.replace(/\.jar$/i, "")),
    name: String(json.name || json.id || file),
    version: String(json.version || ""),
    description: typeof json.description === "string" ? json.description : "",
    environment: json.environment === "client" ? "client" : json.environment === "server" ? "server" : "*",
    depends: Object.keys(depends),
    loaders: ["fabric"],
    mcVersion: typeof depends.minecraft === "string" ? depends.minecraft : "",
    size,
    mtime
  };
}

/** 无 fabric.mod.json 时退化为文件名解析：name-1.2.3.jar */
function fallbackMeta(file, filePath, size, mtime) {
  const base = file.replace(/\.jar$/i, "");
  const m = base.match(/^(.+?)-(\d[\w.+-]*)$/);
  return {
    file,
    path: filePath,
    id: (m ? m[1] : base).toLowerCase().replace(/[^a-z0-9_]+/g, "-"),
    name: m ? m[1] : base,
    version: m ? m[2] : "",
    description: "",
    environment: "*",
    depends: [],
    loaders: [],
    mcVersion: "",
    size,
    mtime
  };
}

function tomlValue(raw) {
  let v = String(raw || "").trim();
  const hash = v.indexOf(" #");
  if (hash >= 0) v = v.slice(0, hash).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  return v;
}

/** Forge / NeoForge 的 META-INF/mods.toml（只取第一个 [[mods]] 段） */
function parseTomlMeta(text, loader, file, filePath, size, mtime) {
  let inMods = false;
  const fields = {};
  for (const line of String(text || "").split(/\r?\n/)) {
    const t = line.trim();
    if (t === "[[mods]]") {
      if (inMods) break;
      inMods = true;
      continue;
    }
    if (t.startsWith("[[")) {
      if (inMods) break;
      continue;
    }
    if (!inMods || !t || t.startsWith("#")) continue;
    const m = t.match(/^([A-Za-z0-9_]+)\s*=\s*(.+)$/);
    if (!m) continue;
    fields[m[1]] = tomlValue(m[2]);
  }
  const side = String(fields.side || "BOTH").toUpperCase();
  const environment = side === "CLIENT" ? "client" : side === "SERVER" ? "server" : "*";
  const id = fields.modId || file.replace(/\.jar$/i, "").toLowerCase().replace(/[^a-z0-9_]+/g, "-");
  const version = /^\$\{/.test(fields.version || "") ? "" : fields.version || "";
  return {
    file,
    path: filePath,
    id: String(id),
    name: String(fields.displayName || fields.modId || file),
    version: String(version),
    description: String(fields.description || ""),
    environment,
    depends: [],
    loaders: [loader],
    mcVersion: "",
    size,
    mtime,
  };
}

function readModMeta(jarPath) {
  let stat;
  try {
    stat = fs.statSync(jarPath);
  } catch (e) {
    return null;
  }
  const file = path.basename(jarPath);
  const buf = readZipEntry(jarPath, "fabric.mod.json");
  if (buf) {
    try {
      const json = JSON.parse(buf.toString("utf8").replace(/^\uFEFF/, ""));
      return parseFabricMeta(json, file, jarPath, stat.size, stat.mtimeMs);
    } catch (e) {
      /* 落到文件名解析 */
    }
  }
  for (const [entry, loader] of [
    ["META-INF/neoforge.mods.toml", "neoforge"],
    ["META-INF/mods.toml", "forge"],
  ]) {
    const toml = readZipEntry(jarPath, entry);
    if (!toml) continue;
    const meta = parseTomlMeta(toml.toString("utf8"), loader, file, jarPath, stat.size, stat.mtimeMs);
    if (meta.id) return meta;
  }
  return fallbackMeta(file, jarPath, stat.size, stat.mtimeMs);
}

/** 扫描目录下所有 .jar（不递归） */
function scanMods(dir) {
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch (e) {
    return [];
  }
  const out = [];
  for (const name of names) {
    if (!/\.jar$/i.test(name)) continue;
    if (/\.(disabled|old|bak)$/i.test(name)) continue;
    const full = path.join(dir, name);
    try {
      if (!fs.statSync(full).isFile()) continue;
    } catch (e) {
      continue;
    }
    const meta = readModMeta(full);
    if (meta) out.push(meta);
  }
  out.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  return out;
}

module.exports = { readZipEntry, readModMeta, scanMods };
