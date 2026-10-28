/**
 * 验证 net:ping（Minecraft 服务器列表协议）：对着 mock SLP 服务端问一次
 */
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = "D:/Games/Minecraft/MCServer/wulons-mcss";
const EXE = path.join(ROOT, "agent", "target", "release", "mcss-agent.exe");
const PORT = 28503;
const SLP_PORT = 28510;
const BASE = `http://127.0.0.1:${PORT}`;
const TOKEN = "ping-test";

async function invoke(channel, ...args) {
  const res = await fetch(`${BASE}/api/invoke`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-mcss-token": TOKEN },
    body: JSON.stringify({ channel, args }),
    signal: AbortSignal.timeout(15000),
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
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

(async () => {
  const mock = spawn(process.execPath, [path.join(ROOT, "scripts", "mock-slp.cjs"), String(SLP_PORT)], { stdio: "ignore" });
  await new Promise((r) => setTimeout(r, 400));

  const agent = spawn(EXE, [], {
    env: { ...process.env, MCSS_PORT: String(PORT), MCSS_TOKEN: TOKEN, MCSS_NO_OPEN: "1", MCSS_CONFIG: path.join(os.tmpdir(), "ping-config.json") },
    stdio: ["ignore", "pipe", "pipe"],
  });
  console.log("health:", await waitHealth());

  const ok = await invoke("net:ping", { host: "127.0.0.1", port: SLP_PORT, timeoutMs: 1500 });
  console.log("ping(在线):", JSON.stringify(ok.result));

  const dead = await invoke("net:ping", { host: "127.0.0.1", port: 1, timeoutMs: 500 });
  console.log("ping(离线):", JSON.stringify(dead.result));

  agent.kill();
  mock.kill();
  await new Promise((r) => setTimeout(r, 400));
  process.exitCode = 0;
})();
