/**
 * 导出 Modrinth 整合包（.mrpack）
 * ------------------------------------------------------------
 * 为什么是 mrpack：PCL2 / HMCL / Prism / Modrinth App / CurseForge 都能直接导入。
 * 包里有：版本 + 加载器 + Mod 清单（带官方下载地址与哈希）+ overrides（含服务器列表）。
 * 于是「进服」对玩家变成：拿到一个文件 → 启动器里导入 → 点开始。
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { serialize } = require("./serversdat");

const API = "https://api.modrinth.com/v2";
const UA = "WulonsMCSS/27.0.0 (github.com/wulons)";

async function getJson(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`Modrinth HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function safeName(text) {
  return String(text || "mcss-room").replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, "-").slice(0, 40) || "mcss-room";
}

/**
 * @param {object} opts
 * @param {string} opts.outFile  目标 .mrpack 路径
 * @param {object} opts.room     RoomDescriptor（name/mc/loader/lv/mods/addr）
 * @param {(p:{stage:string,percent:number,detail?:string})=>void} [opts.onProgress]
 */
async function exportMrpack({ outFile, room, onProgress }) {
  if (!outFile) throw new Error("缺少导出路径");
  if (!room?.mc) throw new Error("房间信息不完整");

  const stage = fs.mkdtempSync(path.join(os.tmpdir(), "mcss-mrpack-"));
  try {
    const files = [];
    const mods = room.mods || [];
    for (let i = 0; i < mods.length; i++) {
      const mod = mods[i];
      onProgress?.({ stage: `解析 ${mod.n || mod.p}`, percent: Math.round((i / Math.max(mods.length, 1)) * 70), detail: `${i + 1}/${mods.length}` });
      const v = await getJson(`${API}/version/${encodeURIComponent(mod.v)}`);
      const file = (v.files || []).find((f) => f.primary) || v.files?.[0];
      if (!file) throw new Error(`${mod.n || mod.p} 没有可下载文件`);
      files.push({
        path: `mods/${file.filename}`,
        hashes: {
          sha1: file.hashes?.sha1 || "",
          sha512: file.hashes?.sha512 || "",
        },
        downloads: [file.url],
        fileSize: file.size,
      });
    }

    const dependencies = { minecraft: String(room.mc) };
    if (room.loader === "fabric" && room.lv) dependencies["fabric-loader"] = String(room.lv);

    const index = {
      formatVersion: 1,
      game: "minecraft",
      versionId: `${safeName(room.name)}-${Date.now().toString(36)}`,
      name: room.name || "Wulon's MCSS 房间",
      summary: `${room.mc} · ${room.loader}${room.mods?.length ? ` · ${room.mods.length} 个 Mod` : ""}`,
      files,
      dependencies,
    };
    fs.writeFileSync(path.join(stage, "modrinth.index.json"), JSON.stringify(index, null, 2));

    // overrides：把服务器写进多人列表，导入后直接出现在游戏里
    if (room.addr) {
      fs.mkdirSync(path.join(stage, "overrides"), { recursive: true });
      const serversDat = serialize([{ name: room.name || "Wulon's MCSS", ip: room.addr }]);
      fs.writeFileSync(path.join(stage, "overrides", "servers.dat"), serversDat);
    }

    onProgress?.({ stage: "打包", percent: 85 });
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    try {
      if (fs.existsSync(outFile)) fs.unlinkSync(outFile);
    } catch (e) {}

    const entries = ["modrinth.index.json"];
    if (fs.existsSync(path.join(stage, "overrides"))) entries.push("overrides");
    execFileSync("tar", ["-a", "-c", "-f", outFile, ...entries], { cwd: stage, timeout: 120000 });

    onProgress?.({ stage: "完成", percent: 100 });
    const stat = fs.statSync(outFile);
    return { ok: true, file: outFile, size: stat.size, mods: files.length };
  } finally {
    try {
      fs.rmSync(stage, { recursive: true, force: true });
    } catch (e) {}
  }
}

module.exports = { exportMrpack };
