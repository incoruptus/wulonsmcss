/**
 * 验证 agent 的 Modrinth 与 Mods 通道
 */
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = "D:/Games/Minecraft/MCServer/wulons-mcss";
const EXE = path.join(ROOT, "agent", "target", "release", "mcss-agent.exe");
const PORT = 28485;
const BASE = `http://127.0.0.1:${PORT}`;
const TOKEN = "mods-test";

async function invoke(channel, ...args) {
  const res = await fetch(`${BASE}/api/invoke`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-mcss-token": TOKEN },
    body: JSON.stringify({ channel, args }),
  });
  return res.json();
}

async function waitHealth(ms = 8000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      const r = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(500) });
      if (r.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

(async () => {
  const agent = spawn(EXE, [], {
    env: { ...process.env, MCSS_PORT: String(PORT), MCSS_TOKEN: TOKEN, MCSS_NO_OPEN: "1", MCSS_CONFIG: path.join(ROOT, "config.json") },
    stdio: ["ignore", "pipe", "pipe"],
  });
  console.log("health:", await waitHealth());

  // 1) 扫描真实 mods 目录
  const t0 = Date.now();
  const scanned = await invoke("mods:scan", "D:/Games/Minecraft/MCServer/mods");
  const mods = scanned.result || [];
  console.log(`mods:scan → ${mods.length} 个, ${Date.now() - t0}ms`);
  console.log("sample:", mods.slice(0, 3).map((m) => `${m.name} ${m.version} [${m.environment}]`).join(" | "));
  console.log("ids resolved:", mods.filter((m) => m.id).length);

  // 2) 搜索
  const search = await invoke("modrinth:search", "sodium", { mcVersion: "26.1", loader: "fabric", limit: 3 });
  console.log("search:", (search.result?.hits || []).map((h) => h.title).join(", "), "| total:", search.result?.total);

  // 3) 版本
  const first = search.result.hits[0];
  const versions = await invoke("modrinth:versions", first.id, { mcVersion: "26.1", loader: "fabric" });
  const v = versions.result[0];
  console.log("versions:", versions.result.length, "| latest:", v.versionNumber, v.id);

  // 4) 安装到一个临时实例目录
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mcss-agent-install-"));
  const installed = await invoke("modrinth:install", { dir, fileUrl: v.files[0].url, fileName: v.files[0].filename });
  console.log("install:", JSON.stringify(installed.result).slice(0, 120));
  console.log("mods dir:", fs.readdirSync(path.join(dir, "mods")));

  // 5) 禁用 / 启用
  const jar = path.join(dir, "mods", v.files[0].filename);
  console.log("disable:", JSON.stringify((await invoke("mods:disable", jar)).result), fs.readdirSync(path.join(dir, "mods")));
  console.log("enable:", JSON.stringify((await invoke("mods:enable", jar + ".disabled")).result), fs.readdirSync(path.join(dir, "mods")));

  agent.kill();
  fs.rmSync(dir, { recursive: true, force: true });
  await new Promise((r) => setTimeout(r, 400));
  process.exitCode = 0;
})();
