/**
 * 验证 agent 的 AI 现场包：结构、脱敏、知识库内嵌
 */
const { spawn, execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = "D:/Games/Minecraft/MCServer/wulons-mcss";
const EXE = path.join(ROOT, "agent", "target", "release", "mcss-agent.exe");
const PORT = 28483;
const BASE = `http://127.0.0.1:${PORT}`;
const TOKEN = "ai-test";
const CONFIG = path.join(os.tmpdir(), `mcss-ai-config-${Date.now()}.json`);

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
  fs.writeFileSync(
    CONFIG,
    JSON.stringify({
      version: 27,
      activeInstanceId: "i1",
      sync: { token: "ghp_supersecret123456", gistId: "abc" },
      instances: [{ id: "i1", name: "测试服", mcVersion: "26.1", loader: "fabric", dir: "D:/srv", javaPath: "java", port: 25565 }],
    })
  );

  const agent = spawn(EXE, [], {
    env: { ...process.env, MCSS_PORT: String(PORT), MCSS_TOKEN: TOKEN, MCSS_NO_OPEN: "1", MCSS_CONFIG: CONFIG },
    stdio: ["ignore", "pipe", "pipe"],
  });
  console.log("health:", await waitHealth());

  const out = path.join(os.tmpdir(), `mcss-diag-${Date.now()}.zip`);
  const res = await invoke("ai:export-bundle", {
    outFile: out,
    instanceId: "i1",
    logs: ["[06:11:22] [ERROR] boom", "token ghp_abcdefghij1234567890", "Bearer abcdef1234567890"],
    symptom: { title: "端口被占用", detail: "秒退" },
  });
  console.log("bundle:", JSON.stringify(res.result).slice(0, 160));

  const entries = execFileSync("tar", ["-tf", out], { encoding: "utf8" }).trim().split("\n");
  console.log("entries:", entries.join(", "));

  const cfg = execFileSync("tar", ["-xOf", out, "config.sanitized.json"], { encoding: "utf8" });
  console.log("token redacted:", !cfg.includes("ghp_supersecret"), "| gistId redacted:", !cfg.includes("abc"), "| dir kept:", cfg.includes("D:/srv"));

  const log = execFileSync("tar", ["-xOf", out, "logs/recent.log"], { encoding: "utf8" });
  console.log("log redacted:", !log.includes("ghp_abcdefghij") && !log.includes("abcdef1234567890"));

  const knowledge = execFileSync("tar", ["-xOf", out, "knowledge.md"], { encoding: "utf8" });
  console.log("knowledge embedded:", knowledge.includes("症状"), "| bytes:", knowledge.length);

  const ctx = execFileSync("tar", ["-xOf", out, "context.md"], { encoding: "utf8" });
  console.log("context has symptom:", ctx.includes("端口被占用"), "| instance:", ctx.includes("测试服"));

  agent.kill();
  fs.rmSync(out, { force: true });
  fs.rmSync(CONFIG, { force: true });
  await new Promise((r) => setTimeout(r, 400));
  process.exitCode = 0;
})();
