/**
 * 版本与下载通道验证：清单、Fabric loader、真实安装一个服务端
 */
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = "D:/Games/Minecraft/MCServer/wulons-mcss";
const EXE = path.join(ROOT, "agent", "target", "release", "mcss-agent.exe");
const PORT = 28497;
const BASE = `http://127.0.0.1:${PORT}`;
const TOKEN = "versions-test";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mcss-ver-"));
const CONFIG = path.join(tmp, "config.json");
fs.writeFileSync(CONFIG, JSON.stringify({ version: 27, instances: [] }));

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
    env: { ...process.env, MCSS_PORT: String(PORT), MCSS_TOKEN: TOKEN, MCSS_NO_OPEN: "1", MCSS_CONFIG: CONFIG },
    stdio: ["ignore", "pipe", "pipe"],
  });
  console.log("health:", await waitHealth());

  const mc = await invoke("versions:minecraft");
  const list = mc.result || [];
  console.log("versions:minecraft:", list.length, "个，最新:", list[0]?.id, list[0]?.type);

  const loaders = await invoke("versions:fabric-loaders", "26.1");
  const ls = loaders.result || [];
  console.log("fabric-loaders(26.1):", ls.length, "个，首个:", ls[0]?.version, "stable:", ls[0]?.stable);

  const target = path.join(tmp, "server");
  const t0 = Date.now();
  const installed = await invoke("versions:install", {
    dir: target,
    mc: "26.1",
    loader: "fabric",
    loaderVersion: ls[0]?.version,
  });
  console.log("install:", JSON.stringify(installed.result), `(${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  const files = fs.readdirSync(target).map((f) => `${f} ${(fs.statSync(path.join(target, f)).size / 1048576).toFixed(1)}MB`);
  console.log("server dir:", files.join(", "));

  agent.kill();
  fs.rmSync(tmp, { recursive: true, force: true });
  await new Promise((r) => setTimeout(r, 400));
  process.exitCode = 0;
})();
