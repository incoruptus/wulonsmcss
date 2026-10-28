/**
 * 抓取网页版某个路由的可见文本（用于断言不在首屏的内容）
 *   node scripts/web-dump.cjs "/settings"
 */
const { spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const path = require("path");

const ROOT = "D:/Games/Minecraft/MCServer/wulons-mcss";
const HASH = process.argv[2] || "/settings";
const AGENT_PORT = 28488;
const WEB_PORT = 5188;
const TOKEN = "dump-token";

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".png": "image/png" };

function serveStatic(root) {
  const server = http.createServer((req, res) => {
    let file = path.join(root, (req.url || "/").split("?")[0] === "/" ? "index.html" : (req.url || "/").split("?")[0]);
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, "index.html");
    res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(WEB_PORT, "127.0.0.1", () => resolve(server)));
}

async function waitHealth(ms = 8000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      const r = await fetch(`http://127.0.0.1:${AGENT_PORT}/api/health`, { signal: AbortSignal.timeout(500) });
      if (r.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

(async () => {
  const agent = spawn(path.join(ROOT, "agent", "target", "release", "mcss-agent.exe"), [], {
    env: { ...process.env, MCSS_CONFIG: path.join(ROOT, "config.json"), MCSS_PORT: String(AGENT_PORT), MCSS_TOKEN: TOKEN, MCSS_NO_OPEN: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const server = await serveStatic(path.join(ROOT, "dist-web"));
  await waitHealth();

  const url = `http://127.0.0.1:${WEB_PORT}/?agent=http://127.0.0.1:${AGENT_PORT}&t=${TOKEN}#${HASH}`;
  const exe = path.join(ROOT, "node_modules", ".pnpm", "electron@33.4.11", "node_modules", "electron", "dist", "electron.exe");
  const env = { ...process.env, MCSS_URL: url, MCSS_DUMP: "1", MCSS_SHOT_EXIT: "1", MCSS_SHOT_DELAY: "4500" };
  delete env.ELECTRON_RUN_AS_NODE;

  const child = spawn(exe, ["."], { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  child.stdout.on("data", (d) => (out += d));
  child.on("exit", () => {
    agent.kill();
    server.close();
    const idx = out.indexOf("DUMP>>>");
    console.log(idx >= 0 ? out.slice(idx + "DUMP>>>".length) : "(no dump)");
    process.exit(0);
  });
  setTimeout(() => {
    child.kill();
    agent.kill();
    server.close();
    process.exit(1);
  }, 30000);
})();
