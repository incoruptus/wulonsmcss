/**
 * 验证 agent 的备份通道：create / list / restore / remove
 * 用假的 world 目录，不碰真实存档。
 */
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = "D:/Games/Minecraft/MCServer/wulons-mcss";
const EXE = path.join(ROOT, "agent", "target", "release", "mcss-agent.exe");
const PORT = 28481;
const BASE = `http://127.0.0.1:${PORT}`;
const TOKEN = "backup-test";

const pad = (n) => String(n).padStart(2, "0");
const stamp = () => {
  const d = new Date();
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
};

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

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mcss-agent-backup-"));
  fs.mkdirSync(path.join(dir, "world", "region"), { recursive: true });
  fs.writeFileSync(path.join(dir, "world", "level.dat"), "leveldata");
  fs.writeFileSync(path.join(dir, "world", "region", "r.0.0.mca"), Buffer.alloc(4096, 1));

  const created = await invoke("backup:create", dir);
  console.log("create:", JSON.stringify(created.result));

  const listed = await invoke("backup:list", dir);
  console.log("list:", (listed.result || []).map((b) => `${b.name} ${(b.size / 1024).toFixed(1)}KB`));

  // 改坏世界，再从备份恢复
  fs.writeFileSync(path.join(dir, "world", "level.dat"), "corrupted");
  const restored = await invoke("backup:restore", dir, created.result.name);
  console.log("restore:", JSON.stringify(restored.result));
  console.log("level.dat after restore:", fs.readFileSync(path.join(dir, "world", "level.dat"), "utf8"));
  console.log("parked dirs:", fs.readdirSync(dir).filter((n) => n.startsWith("world.before-restore")));

  const removed = await invoke("backup:remove", dir, created.result.name);
  console.log("remove:", JSON.stringify(removed.result), "| left:", (await invoke("backup:list", dir)).result.length);

  // 文件名穿越必须被拒
  const evil = await invoke("backup:remove", dir, "../../evil.zip");
  console.log("path traversal rejected:", typeof evil.error === "string", evil.error);

  agent.kill();
  fs.rmSync(dir, { recursive: true, force: true });
  await new Promise((r) => setTimeout(r, 500));
  process.exitCode = 0;
})();
