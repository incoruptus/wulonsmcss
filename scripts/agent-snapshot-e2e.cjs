/**
 * agent 侧增量快照验证：两次快照只有变化的文件是新的
 */
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = "D:/Games/Minecraft/MCServer/wulons-mcss";
const EXE = path.join(ROOT, "agent", "target", "release", "mcss-agent.exe");
const PORT = 28505;
const BASE = `http://127.0.0.1:${PORT}`;
const TOKEN = "snap-test";

async function invoke(channel, ...args) {
  const res = await fetch(`${BASE}/api/invoke`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-mcss-token": TOKEN },
    body: JSON.stringify({ channel, args }),
    signal: AbortSignal.timeout(30000),
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
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mcss-agent-snap-"));
  const dir = path.join(tmp, "srv");
  fs.mkdirSync(path.join(dir, "world", "region"), { recursive: true });
  fs.writeFileSync(path.join(dir, "world", "level.dat"), "LEVEL");
  fs.writeFileSync(path.join(dir, "world", "region", "r.0.0.mca"), Buffer.alloc(4096, 7));

  const agent = spawn(EXE, [], {
    env: { ...process.env, MCSS_PORT: String(PORT), MCSS_TOKEN: TOKEN, MCSS_NO_OPEN: "1", MCSS_CONFIG: path.join(tmp, "config.json") },
    stdio: ["ignore", "pipe", "pipe"],
  });
  console.log("health:", await waitHealth());

  const first = await invoke("backup:snapshot", dir);
  console.log("第一次:", JSON.stringify(first.result));

  fs.writeFileSync(path.join(dir, "world", "region", "r.0.0.mca"), Buffer.alloc(4096, 8));
  const second = await invoke("backup:snapshot", dir);
  console.log("第二次:", JSON.stringify(second.result), "← 只有 4096 字节是新的");

  const list = await invoke("backup:snapshots", dir);
  console.log("列表:", (list.result || []).map((s) => `${s.name}(${s.files}文件/${s.bytesNew}B新)`).join(", "));

  fs.writeFileSync(path.join(dir, "world", "level.dat"), "BROKEN");
  const restored = await invoke("backup:restore-snapshot", dir, first.result.name);
  console.log("恢复:", JSON.stringify(restored.result));
  console.log("level.dat:", fs.readFileSync(path.join(dir, "world", "level.dat"), "utf8"));

  agent.kill();
  fs.rmSync(tmp, { recursive: true, force: true });
  await new Promise((r) => setTimeout(r, 400));
  process.exitCode = 0;
})();
