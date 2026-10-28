/**
 * Web 形态真机验证：起 agent + 静态站点，用 Electron 当浏览器加载网页版并截图。
 * 这样验证的是「httpClient → agent」整条链路，而不是 Electron 的 IPC。
 *
 *   node scripts/web-shot.cjs [输出png] [房间码]
 */
const { spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OUT = process.argv[2] || path.join(ROOT, "_shot-web.png");
const ROOM_CODE = process.argv[3] || "";
const AGENT_PORT = 28476;
const WEB_PORT = 5187;
const TOKEN = "web-shot-token";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};

function serveStatic(root) {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    let file = path.join(root, urlPath === "/" ? "index.html" : urlPath);
    if (!file.startsWith(root)) {
      res.writeHead(403).end();
      return;
    }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, "index.html");
    const ext = path.extname(file);
    res.writeHead(200, { "content-type": MIME[ext] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(WEB_PORT, "127.0.0.1", () => resolve(server)));
}

async function waitHealth(timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${AGENT_PORT}/api/health`, { signal: AbortSignal.timeout(800) });
      if (res.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

(async () => {
  if (!fs.existsSync(path.join(ROOT, "dist-web", "index.html"))) {
    console.error("先构建网页版：pnpm build:web");
    process.exit(1);
  }

  const agent = spawn(path.join(ROOT, "agent", "target", "release", process.platform === "win32" ? "mcss-agent.exe" : "mcss-agent"), [], {
    env: { ...process.env, MCSS_CONFIG: path.join(ROOT, "config.json"), MCSS_PORT: String(AGENT_PORT), MCSS_TOKEN: TOKEN, MCSS_NO_OPEN: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  agent.stdout.on("data", (d) => process.stdout.write("[agent] " + d));

  const server = await serveStatic(path.join(ROOT, "dist-web"));
  const ok = await waitHealth();
  if (!ok) {
    console.error("agent 没起来");
    agent.kill();
    server.close();
    process.exit(1);
  }

  const hash = !ROOM_CODE ? "/join" : ROOM_CODE.startsWith("/") ? ROOM_CODE : `/join/${ROOM_CODE}`;
  const url = `http://127.0.0.1:${WEB_PORT}/?agent=http://127.0.0.1:${AGENT_PORT}&t=${TOKEN}#${hash}`;

  const exe = path.join(ROOT, "node_modules", ".pnpm", "electron@33.4.11", "node_modules", "electron", "dist", "electron.exe");
  const env = { ...process.env, MCSS_URL: url, MCSS_SHOT: OUT, MCSS_SHOT_EXIT: "1", MCSS_SHOT_DELAY: "4000" };
  delete env.ELECTRON_RUN_AS_NODE;

  const child = spawn(exe, ["."], { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", (d) => {
    const s = String(d);
    if (s.includes("screenshot saved")) console.log(s.trim());
  });
  child.stderr.on("data", (d) => {
    const s = String(d);
    if (!/Autofill|DevTools|crashpad|Security Warning|unsafe-eval|consult|This warning/i.test(s)) process.stderr.write("[electron] " + s);
  });

  child.on("exit", () => {
    agent.kill();
    server.close();
    const exists = fs.existsSync(OUT);
    console.log(exists ? `OK -> ${OUT}` : "截图失败");
    process.exit(exists ? 0 : 1);
  });

  setTimeout(() => {
    console.error("超时");
    child.kill();
    agent.kill();
    server.close();
    process.exit(1);
  }, 45000);
})();
