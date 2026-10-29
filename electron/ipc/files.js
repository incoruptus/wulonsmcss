const fs = require("fs");
const path = require("path");

function readText(filePath) {
  return fs.readFileSync(filePath, "utf-8").replace(/^\uFEFF/, "");
}

function writeText(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf-8");
}

function listDir(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return [];
  }
  return entries
    .map((entry) => {
      const full = path.join(dir, entry.name);
      let size = 0;
      let mtime = 0;
      try {
        const st = fs.statSync(full);
        size = st.size;
        mtime = st.mtimeMs;
      } catch (e) {}
      return { name: entry.name, path: full, isDir: entry.isDirectory(), size, mtime };
    })
    .sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name, "zh-CN") : a.isDir ? -1 : 1));
}

function exists(p) {
  return fs.existsSync(p);
}

function mkdir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

/**
 * 递归删除。
 * 通道层再挡一道：UI 调用点都做了名字白名单，但这个通道本身可以被直接调用，
 * 一个空串或盘符根目录进来就是灾难。这里拒绝"太浅"的路径。
 */
function remove(p) {
  if (typeof p !== "string" || !p.trim()) throw new Error("拒绝删除：路径为空");
  // 先看原始输入：在 Linux/CI 上 path.resolve("C:\\") 会变成一个普通相对路径，
  // 光靠解析后的深度判断挡不住盘符根目录
  if (/^[A-Za-z]:[\\/]?$/.test(p.trim())) throw new Error("拒绝删除：这是盘符根目录");
  const resolved = path.resolve(p);
  if (resolved === path.parse(resolved).root) throw new Error("拒绝删除：这是根目录");
  const depth = resolved.split(/[\\/]+/).filter(Boolean).length;
  if (depth < 2) throw new Error(`拒绝删除：路径太浅（${resolved}）`);
  fs.rmSync(resolved, { recursive: true, force: true });
}

function copy(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
  return dest;
}

function readProperties(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  const props = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    props[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return props;
}

function writeProperties(filePath, props) {
  let content = `#Minecraft server properties\n#${new Date().toUTCString()}\n`;
  for (const [key, val] of Object.entries(props)) {
    content += `${key}=${val}\n`;
  }
  fs.writeFileSync(filePath, content, "utf-8");
}

module.exports = { readText, writeText, listDir, exists, mkdir, remove, copy, readProperties, writeProperties };
