/**
 * 桌面能力对齐的端到端验证（用临时 config，不碰用户数据）
 */
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = "D:/Games/Minecraft/MCServer/wulons-mcss";
const EXE = path.join(ROOT, "agent", "target", "release", "mcss-agent.exe");
const PORT = 28491;
const BASE = `http://127.0.0.1:${PORT}`;
const TOKEN = "parity-test";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mcss-parity-"));
const CONFIG = path.join(tmp, "config.json");
fs.writeFileSync(CONFIG, JSON.stringify({ version: 27, instances: [], activeInstanceId: null, marker: "keep-me" }));

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

  // 1) Java 探测
  const java = await invoke("app:detect-java");
  const javas = java.result || [];
  console.log("detect-java:", javas.length, "个 →", javas.slice(0, 3).map((j) => `Java ${j.major} (${path.basename(j.path)})`).join(", "));

  // 2) props 读写
  const propsFile = path.join(tmp, "server.properties");
  fs.writeFileSync(propsFile, "#Minecraft server properties\nmotd=hi\nserver-port=25565\n");
  const read = await invoke("props:read", propsFile);
  console.log("props:read:", JSON.stringify(read.result));
  await invoke("props:write", propsFile, { "server-port": "25566", motd: "一起玩", difficulty: "hard" });
  console.log("props:write →", fs.readFileSync(propsFile, "utf8").trim().split("\n").slice(-3).join(" | "));

  // 3) fs.copy / remove
  const srcDir = path.join(tmp, "src");
  fs.mkdirSync(path.join(srcDir, "sub"), { recursive: true });
  fs.writeFileSync(path.join(srcDir, "a.txt"), "A");
  fs.writeFileSync(path.join(srcDir, "sub", "b.txt"), "B");
  const copied = await invoke("fs:copy", srcDir, path.join(tmp, "dst"));
  const dstFiles = fs.readdirSync(path.join(tmp, "dst", "sub"));
  console.log("fs:copy:", copied.result?.ok, "| dst/sub:", dstFiles.join(","));
  const removed = await invoke("fs:remove", path.join(tmp, "dst"));
  console.log("fs:remove:", removed.result?.ok, "| gone:", !fs.existsSync(path.join(tmp, "dst")));

  // 4) ai:docs-path
  const docs = await invoke("ai:docs-path");
  const docsDir = docs.result;
  console.log("ai:docs-path:", docsDir, "| files:", fs.readdirSync(docsDir).join(","));

  // 5) mods:resolve-modrinth（真实数据）
  const resolve = await invoke("mods:resolve-modrinth", [
    { id: "sodium", file: "sodium-fabric-0.8.9+mc26.1.1.jar", version: "0.8.9+mc26.1.1", name: "Sodium" },
    { id: "definitely-not-a-mod", file: "x.jar", version: "1.0", name: "Not A Mod" },
  ]);
  console.log("resolve-modrinth:", JSON.stringify(resolve.result));

  // 6) config:reset（临时配置，安全）
  const before = JSON.parse(fs.readFileSync(CONFIG, "utf8"));
  const reset = await invoke("config:reset");
  const after = JSON.parse(fs.readFileSync(CONFIG, "utf8"));
  console.log("config:reset:", "marker before:", before.marker, "| after:", after.marker ?? "(gone)", "| version:", after.version);

  agent.kill();
  fs.rmSync(tmp, { recursive: true, force: true });
  await new Promise((r) => setTimeout(r, 400));
  process.exitCode = 0;
})();
