/**
 * client:launch 的真实性验证：让 agent 真起一个进程，确认返回 pid 且命令被执行。
 * 不启动游戏（那需要真实的客户端），只验证「通道 → spawn」这段。
 */
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = "D:/Games/Minecraft/MCServer/wulons-mcss";
const EXE = path.join(ROOT, "agent", "target", "release", "mcss-agent.exe");
const PORT = 28530;
const BASE = `http://127.0.0.1:${PORT}`;
const TOKEN = "launch-test";

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
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mcss-launch-"));
  const agent = spawn(EXE, [], {
    env: { ...process.env, MCSS_PORT: String(PORT), MCSS_TOKEN: TOKEN, MCSS_NO_OPEN: "1", MCSS_CONFIG: path.join(tmp, "config.json") },
    stdio: ["ignore", "pipe", "pipe"],
  });
  console.log("health:", await waitHealth());

  // 用 cmd 写一个文件，间接证明命令真的被执行了（而不是只返回了个 pid）
  const marker = path.join(tmp, "launched.txt");
  const res = await invoke("client:launch", {
    command: ["cmd", "/c", "echo", "ok", ">", marker],
    cwd: tmp,
  });
  console.log("launch:", JSON.stringify(res.result));

  await new Promise((r) => setTimeout(r, 1200));
  const ran = fs.existsSync(marker) && fs.readFileSync(marker, "utf8").includes("ok");
  console.log("命令真的执行了:", ran);

  const empty = await invoke("client:launch", { command: [] });
  console.log("空命令被拒:", typeof empty.error === "string", empty.error);

  const missing = await invoke("client:launch", { command: ["definitely-not-a-real-binary-xyz"] });
  console.log("不存在的可执行文件:", JSON.stringify(missing.result));

  agent.kill();
  fs.rmSync(tmp, { recursive: true, force: true });
  await new Promise((r) => setTimeout(r, 300));
  process.exitCode = ran ? 0 : 1;
})();
