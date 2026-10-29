/**
 * 世界备份
 * ------------------------------------------------------------
 * 用系统自带的 tar（Windows 10+ 的 bsdtar）打 zip，不引第三方库。
 * 备份前若服务器在跑：先 save-off + save-all flush，避免拿到写了一半的区块。
 */

const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

/** 备份/恢复都要跑 tar：用异步版，别把主进程卡住（卡住时窗口按钮都不响应） */
function untarZip(file, cwd) {
  return execFileAsync("tar", ["-a", "-c", "-f", file, "world"], { cwd, timeout: 10 * 60 * 1000 });
}

function extractZip(file, cwd) {
  return execFileAsync("tar", ["-x", "-f", file], { cwd, timeout: 10 * 60 * 1000 });
}

/** 等 ms 毫秒（不用忙等：忙等会冻住主进程的事件循环） */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function backupDir(serverDir) {
  return path.join(serverDir, "backups");
}

function list(serverDir) {
  const dir = backupDir(serverDir);
  let names = [];
  try {
    names = fs.readdirSync(dir).filter((n) => n.endsWith(".zip"));
  } catch (e) {
    return [];
  }
  return names
    .map((name) => {
      const full = path.join(dir, name);
      const stat = fs.statSync(full);
      return { name, path: full, size: stat.size, mtime: stat.mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/**
 * 打一个 zip。server 传进来是为了在跑的时候先停写。
 */
async function create(serverDir, server) {
  const worldDir = path.join(serverDir, "world");
  if (!fs.existsSync(worldDir)) return { ok: false, error: "还没有 world 目录，先启动一次服务器" };

  const dir = backupDir(serverDir);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `world-${stamp()}.zip`);
  const running = server && server.getStatus() === "running";

  let resumed = false;
  try {
    if (running) {
      server.sendCommand("save-off");
      server.sendCommand("save-all flush");
      // 给服务器一点时间落盘（异步等，别忙等）
      await sleep(2500);
    }
    await untarZip(file, serverDir);
    if (running) {
      server.sendCommand("save-on");
      resumed = true;
    }
    const stat = fs.statSync(file);
    return { ok: true, name: path.basename(file), path: file, size: stat.size };
  } catch (e) {
    if (running && !resumed) {
      try {
        server.sendCommand("save-on");
      } catch (err) {}
    }
    try {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    } catch (err) {}
    return { ok: false, error: `打包失败：${e.message}` };
  }
}

/** 恢复：先把现有 world 改名留底，再解压。要求服务器已停止。 */
async function restore(serverDir, name, server) {
  if (server && server.getStatus() !== "stopped") {
    return { ok: false, error: "先把服务器停掉再恢复，否则会写坏存档" };
  }
  // 和 remove 用同一套白名单：否则 `..\..\x.zip` 能指向任意 zip
  if (!/^[\w.-]+\.zip$/.test(name)) return { ok: false, error: "文件名不合法" };
  const file = path.join(backupDir(serverDir), name);
  if (!fs.existsSync(file)) return { ok: false, error: "备份文件不存在" };

  const worldDir = path.join(serverDir, "world");
  // 同上：撞名会让 rename 失败，加序号
  let parked = path.join(serverDir, `world.before-restore-${stamp()}`);
  let n = 2;
  while (fs.existsSync(parked)) parked = path.join(serverDir, `world.before-restore-${stamp()}-${n++}`);
  try {
    if (fs.existsSync(worldDir)) fs.renameSync(worldDir, parked);
    await extractZip(file, serverDir);
    return { ok: true, parked: path.basename(parked) };
  } catch (e) {
    // 解压失败就把原来的世界放回去
    try {
      if (fs.existsSync(worldDir)) fs.rmSync(worldDir, { recursive: true, force: true });
      if (fs.existsSync(parked)) fs.renameSync(parked, worldDir);
    } catch (err) {}
    return { ok: false, error: `恢复失败：${e.message}` };
  }
}

function remove(serverDir, name) {
  if (!/^[\w.-]+\.zip$/.test(name)) return { ok: false, error: "文件名不合法" };
  try {
    fs.unlinkSync(path.join(backupDir(serverDir), name));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/** 只保留最近 keep 份，返回删掉的 */
function prune(serverDir, keep) {
  const n = Math.max(1, Number(keep) || 5);
  const all = list(serverDir);
  const removed = [];
  for (const item of all.slice(n)) {
    try {
      fs.unlinkSync(item.path);
      removed.push(item.name);
    } catch (e) {}
  }
  return { ok: true, removed, kept: all.slice(0, n).map((x) => x.name) };
}

module.exports = { list, create, restore, remove, prune, backupDir };
