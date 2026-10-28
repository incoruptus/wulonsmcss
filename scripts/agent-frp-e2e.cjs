/**
 * FRP 通道验证（异步版）：start 立刻返回，进度走事件；轮询状态直到出结果
 */
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = "D:/Games/Minecraft/MCServer/wulons-mcss";
const EXE = path.join(ROOT, "agent", "target", "release", "mcss-agent.exe");
const PORT = 28499;
const BASE = `http://127.0.0.1:${PORT}`;
const TOKEN = "frp-test";

async function invoke(channel, ...args) {
  const res = await fetch(`${BASE}/api/invoke`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-mcss-token": TOKEN },
    body: JSON.stringify({ channel, args }),
    signal: AbortSignal.timeout(20000),
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
    env: { ...process.env, MCSS_PORT: String(PORT), MCSS_TOKEN: TOKEN, MCSS_NO_OPEN: "1", MCSS_CONFIG: path.join(os.tmpdir(), "frp-config.json") },
    stdio: ["ignore", "pipe", "pipe"],
  });
  console.log("health:", await waitHealth());
  console.log("status(初始):", JSON.stringify((await invoke("frp:status")).result));
  console.log("stop(空跑):", JSON.stringify((await invoke("frp:stop")).result));

  const t0 = Date.now();
  const started = await invoke("frp:start", {
    serverAddr: "127.0.0.1",
    serverPort: 1,
    token: "x",
    name: "mc",
    localPort: 25565,
    remotePort: 25565,
  });
  console.log("start 立即返回:", JSON.stringify(started.result), `(${Date.now() - t0}ms)`);

  let last = null;
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const s = (await invoke("frp:status")).result;
    if (JSON.stringify(s) !== JSON.stringify(last)) {
      console.log(`  [${((Date.now() - t0) / 1000).toFixed(0)}s] status:`, JSON.stringify(s).slice(0, 160));
      last = s;
    }
    if (!s.pending) break;
  }

  await invoke("frp:stop");
  console.log("status(停止后):", JSON.stringify((await invoke("frp:status")).result));

  const exe = path.join(process.env.USERPROFILE, ".wulons-mcss", "frp", "frpc.exe");
  console.log("frpc.exe:", fs.existsSync(exe) ? `${(fs.statSync(exe).size / 1048576).toFixed(1)}MB` : "不存在");

  agent.kill();
  await new Promise((r) => setTimeout(r, 400));
  process.exitCode = 0;
})();
