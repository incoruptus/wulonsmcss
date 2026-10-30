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
 * 快照名 / 条目路径的安全校验
 * ------------------------------------------------------------
 * manifest 是"数据"，不是"代码"：它可以被拷贝、同步、手改。
 * 如果一个 entry 写着 `../x`，path.join 会把它拼到 world 目录之外——
 * 实测后果是「写到了服务器根目录、world 根本没被创建，却返回 ok:true」，
 * 也就是**谎报恢复成功，而玩家的存档已经不在了**。
 * 所以：动手前先把整份 manifest 校验完，有任何一条不合法就整体拒绝。
 */
function isSafeRelPath(p) {
  if (typeof p !== "string" || !p) return false;
  if (p.includes("\0")) return false;
  if (/^[\\/]/.test(p)) return false; // 绝对路径
  if (/^[A-Za-z]:/.test(p)) return false; // 盘符
  const parts = p.split(/[\\/]+/);
  return parts.every((seg) => seg && seg !== "." && seg !== "..");
}

/** 快照目录名：只允许字母数字与 ._- */
function isSafeName(name) {
  return typeof name === "string" && /^[A-Za-z0-9._-]{1,64}$/.test(name) && name !== "." && name !== "..";
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
  if (!isSafeName(name)) return null;
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

  // 先整份校验，再动磁盘：任何一条路径不合法都整体拒绝，绝不留半截状态
  const entries = Array.isArray(manifest.entries) ? manifest.entries : [];
  if (!entries.length) return { ok: false, error: "这个快照是空的，不能恢复" };
  const bad = entries.find(
    (e) => !e || !isSafeRelPath(e.path) || !/^[0-9a-f]{40}$/i.test(String(e.hash || "")),
  );
  if (bad) return { ok: false, error: `快照内容不合法（路径 ${String(bad.path ?? "?").slice(0, 40)}），已拒绝恢复` };

  const worldDir = path.join(serverDir, "world");
  // 留底目录名带秒级时间戳：同一秒恢复两次会撞名，rename 会失败。撞了就加序号。
  let parked = path.join(serverDir, `world.before-restore-${stamp()}`);
  let n = 2;
  while (fs.existsSync(parked)) parked = path.join(serverDir, `world.before-restore-${stamp()}-${n++}`);

  try {
    if (fs.existsSync(worldDir)) fs.renameSync(worldDir, parked);
  } catch (e) {
    return { ok: false, error: `移走旧存档失败：${e.message}` };
  }

  let restored = 0;
  try {
    for (const entry of entries) {
      const source = path.join(objectsDir(serverDir), entry.hash);
      const target = path.join(worldDir, ...entry.path.split("/"));
      if (!fs.existsSync(source)) throw new Error(`快照缺少对象 ${String(entry.hash).slice(0, 8)}`);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(source, target);
      restored += 1;
    }
    // 兜底：一条都没落进 world 就不是成功
    if (!fs.existsSync(worldDir)) throw new Error("恢复后 world 目录没有生成");
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

module.exports = {
  createSnapshot,
  listSnapshots,
  restoreSnapshot,
  objectsSize,
  backupsRoot,
  snapshotsDir,
  objectsDir,
  isSafeRelPath,
  isSafeName,
};
