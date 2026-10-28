/**
 * 增量备份（内容寻址快照）
 * ------------------------------------------------------------
 * 世界目录里真正会变的通常只有几个 region 文件，其余几小时都不动。
 * 所以不重复打包：按文件内容哈希去重，快照只记「路径 → 哈希」。
 *
 * 为什么不用硬链接：Minecraft 的 region 文件是原地改写的，
 * 硬链接会让旧快照跟着一起被改坏——那比不备份更危险。
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const SNAPSHOT_VERSION = 1;

function backupsRoot(serverDir) {
  return path.join(serverDir, "backups");
}

function objectsDir(serverDir) {
  return path.join(backupsRoot(serverDir), "objects");
}

function snapshotsDir(serverDir) {
  return path.join(backupsRoot(serverDir), "snapshots");
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** 递归列出 world 下的文件（相对路径用 / 分隔，便于跨平台比较） */
function walk(dir, base = "", out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, rel, out);
    else if (entry.isFile()) out.push({ rel, full });
  }
  return out;
}

function hashFile(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha1");
    const stream = fs.createReadStream(file);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

/**
 * 打一个快照。
 * @returns {Promise<{ok:boolean, name?:string, files?:number, bytesTotal?:number, bytesNew?:number, error?:string}>}
 */
async function createSnapshot(serverDir) {
  const worldDir = path.join(serverDir, "world");
  if (!fs.existsSync(worldDir)) return { ok: false, error: "还没有 world 目录，先启动一次服务器" };

  const objects = objectsDir(serverDir);
  const snapshots = snapshotsDir(serverDir);
  fs.mkdirSync(objects, { recursive: true });
  fs.mkdirSync(snapshots, { recursive: true });

  const files = walk(worldDir);
  const entries = [];
  let bytesTotal = 0;
  let bytesNew = 0;

  for (const file of files) {
    const stat = fs.statSync(file.full);
    const hash = await hashFile(file.full);
    entries.push({ path: file.rel, size: stat.size, hash });
    bytesTotal += stat.size;

    const target = path.join(objects, hash);
    if (!fs.existsSync(target)) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(file.full, target);
      bytesNew += stat.size;
    }
  }

  // 同一秒内连打两个快照也不能互相覆盖
  let name = `snap-${stamp()}`;
  let counter = 2;
  while (fs.existsSync(path.join(snapshots, name))) {
    name = `snap-${stamp()}-${counter}`;
    counter += 1;
  }
  const dir = path.join(snapshots, name);
  fs.mkdirSync(dir, { recursive: true });
  const manifest = {
    version: SNAPSHOT_VERSION,
    at: Date.now(),
    source: "world",
    files: entries.length,
    bytesTotal,
    bytesNew,
    entries,
  };
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest));

  return { ok: true, name, files: entries.length, bytesTotal, bytesNew };
}

/** 已用对象总大小（用来算“省了多少”） */
function objectsSize(serverDir) {
  let total = 0;
  try {
    for (const name of fs.readdirSync(objectsDir(serverDir))) {
      total += fs.statSync(path.join(objectsDir(serverDir), name)).size;
    }
  } catch {}
  return total;
}

function readManifest(serverDir, name) {
  try {
    return JSON.parse(fs.readFileSync(path.join(snapshotsDir(serverDir), name, "manifest.json"), "utf8"));
  } catch {
    return null;
  }
}

/** 快照列表（新→旧） */
function listSnapshots(serverDir) {
  let names = [];
  try {
    names = fs.readdirSync(snapshotsDir(serverDir));
  } catch {
    return [];
  }
  const stored = objectsSize(serverDir);
  return names
    .map((name) => {
      const manifest = readManifest(serverDir, name);
      if (!manifest) return null;
      return {
        name,
        at: manifest.at,
        files: manifest.files,
        bytesTotal: manifest.bytesTotal,
        bytesNew: manifest.bytesNew,
        stored,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.at - a.at);
}

/**
 * 从快照恢复到 world/：先把当前 world 改名留底，再按 manifest 拼回去。
 * 要求服务器已停止（由调用方保证）。
 */
function restoreSnapshot(serverDir, name) {
  const manifest = readManifest(serverDir, name);
  if (!manifest) return { ok: false, error: "快照不存在或已损坏" };

  const worldDir = path.join(serverDir, "world");
  const parked = path.join(serverDir, `world.before-restore-${stamp()}`);

  try {
    if (fs.existsSync(worldDir)) fs.renameSync(worldDir, parked);
  } catch (e) {
    return { ok: false, error: `移走旧存档失败：${e.message}` };
  }

  let restored = 0;
  try {
    for (const entry of manifest.entries) {
      const source = path.join(objectsDir(serverDir), entry.hash);
      const target = path.join(worldDir, ...entry.path.split("/"));
      if (!fs.existsSync(source)) throw new Error(`快照缺少对象 ${entry.hash.slice(0, 8)}`);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(source, target);
      restored += 1;
    }
  } catch (e) {
    // 回滚
    try {
      fs.rmSync(worldDir, { recursive: true, force: true });
      if (fs.existsSync(parked)) fs.renameSync(parked, worldDir);
    } catch {}
    return { ok: false, error: `恢复失败，已还原：${e.message}` };
  }

  return { ok: true, restored, parked: path.basename(parked) };
}

module.exports = { createSnapshot, listSnapshots, restoreSnapshot, objectsSize, backupsRoot, snapshotsDir, objectsDir };
