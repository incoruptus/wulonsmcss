/**
 * 世界备份
 * ------------------------------------------------------------
 * 用系统自带的 tar（Windows 10+ 的 bsdtar）打 zip，不引第三方库。
 * 备份前若服务器在跑：先 save-off + save-all flush，避免拿到写了一半的区块。
 */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

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
function create(serverDir, server) {
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
      // 给服务器一点时间落盘
      const until = Date.now() + 2500;
      while (Date.now() < until) {
        // 忙等 2.5s，备份是低频操作，简单可预期
      }
    }
    execFileSync("tar", ["-a", "-c", "-f", file, "world"], { cwd: serverDir, timeout: 10 * 60 * 1000 });
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
function restore(serverDir, name, server) {
  if (server && server.getStatus() !== "stopped") {
    return { ok: false, error: "先把服务器停掉再恢复，否则会写坏存档" };
  }
  const file = path.join(backupDir(serverDir), name);
  if (!fs.existsSync(file)) return { ok: false, error: "备份文件不存在" };

  const worldDir = path.join(serverDir, "world");
  const parked = path.join(serverDir, `world.before-restore-${stamp()}`);
  try {
    if (fs.existsSync(worldDir)) fs.renameSync(worldDir, parked);
    execFileSync("tar", ["-x", "-f", file], { cwd: serverDir, timeout: 10 * 60 * 1000 });
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

module.exports = { list, create, restore, remove, backupDir };
