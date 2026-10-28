/**
 * 预检对齐验证：真实实例 + 人为构造的坏实例
 */
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = "D:/Games/Minecraft/MCServer/wulons-mcss";
const EXE = path.join(ROOT, "agent", "target", "release", "mcss-agent.exe");
const PORT = 28495;
const BASE = `http://127.0.0.1:${PORT}`;
const TOKEN = "preflight-test";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mcss-pf-"));
const brokenDir = path.join(tmp, "broken");
fs.mkdirSync(brokenDir, { recursive: true });
const CONFIG = path.join(tmp, "config.json");
fs.writeFileSync(
  CONFIG,
  JSON.stringify({
    version: 27,
    activeInstanceId: "real",
    instances: [
      { id: "real", name: "真实服", mcVersion: "26.1", loader: "fabric", dir: "D:/Games/Minecraft/MCServer", javaPath: "", port: 25565, memoryMax: 16 },
      { id: "broken", name: "坏实例", mcVersion: "26.1", loader: "fabric", dir: brokenDir, javaPath: "", port: 25599, memoryMax: 9999 },
    ],
  })
);

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

  const real = await invoke("server:preflight", "real");
  console.log("真实实例 ok:", real.result?.ok, "| issues:", (real.result?.issues || []).map((i) => `${i.level}:${i.id}`).join(", ") || "无");

  const broken = await invoke("server:preflight", "broken");
  console.log("坏实例 ok:", broken.result?.ok);
  for (const i of broken.result?.issues || []) {
    console.log(`  [${i.level}] ${i.id} — ${i.title}（fix=${i.fix}）`);
  }

  const missing = await invoke("server:preflight", "nope");
  console.log("不存在的实例:", JSON.stringify(missing).slice(0, 80));

  agent.kill();
  fs.rmSync(tmp, { recursive: true, force: true });
  await new Promise((r) => setTimeout(r, 400));
  process.exitCode = 0;
})();
