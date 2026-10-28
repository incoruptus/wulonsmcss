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

function remove(p) {
  fs.rmSync(p, { recursive: true, force: true });
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
