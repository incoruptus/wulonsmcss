const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist-web");
const PORT = Number(process.env.PROBE_PORT || 5199);
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(String(req.url || "/").split("?")[0]);
  if (p === "/") p = "/index.html";
  const file = path.join(DIST, p);
  if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404);
    res.end("not found");
    return;
  }
  res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});

server.listen(PORT, "127.0.0.1", () => {
  const exe = path.join(
    ROOT,
    "node_modules", ".pnpm", "electron@33.4.11", "node_modules", "electron", "dist", "electron.exe",
  );
  const env = {
    ...process.env,
    PROBE_URL: `http://127.0.0.1:${PORT}/#/settings`,
    PROBE_OUT: path.join(ROOT, "_shot-lang.png"),
  };
  // 在 bash 里跑时可能带着 ELECTRON_RUN_AS_NODE，会让 electron 退化成纯 node
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(exe, [path.join(ROOT, "scripts", "lang-probe-main.cjs")], {
    cwd: ROOT,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (d) => process.stdout.write(String(d)));
  child.stderr.on("data", (d) => {
    const s = String(d);
    if (!/Autofill|DevTools|crashpad|Security Warning|unsafe-eval|consult/i.test(s)) process.stderr.write("[electron] " + s);
  });
  child.on("exit", () => {
    server.close();
  });
  setTimeout(() => {
    child.kill();
    server.close();
    process.exit(1);
  }, 40000);
});
