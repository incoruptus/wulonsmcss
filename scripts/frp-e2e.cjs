/**
 * FRP 端到端验证：本机起一个 frps，再用 frp.start() 连上去，
 * 确认「配置生成 → 进程启动 → 日志解析 → 公网地址」整条链路可用。
 * 仅作为开发期验证脚本，不入库。
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { readZipEntry } = require("./electron/ipc/mods.js");
const frp = require("./electron/ipc/frp.js");

const zip = path.join(os.tmpdir(), "frp-test.zip");
const tmp = path.join(os.tmpdir(), "frp-e2e");
fs.mkdirSync(tmp, { recursive: true });

// 1) 取出 frps.exe
const frpsBuf = readZipEntry(zip, "frps.exe");
if (!frpsBuf) throw new Error("zip 里没有 frps.exe");
const frpsExe = path.join(tmp, "frps.exe");
fs.writeFileSync(frpsExe, frpsBuf);

// 2) 起 frps
const frpsCfg = path.join(tmp, "frps.toml");
fs.writeFileSync(frpsCfg, 'bindPort = 17000\nauth.token = "e2e-token"\n');
const frps = spawn(frpsExe, ["-c", frpsCfg], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
frps.stdout.on("data", (d) => process.stdout.write("[frps] " + d));
frps.stderr.on("data", (d) => process.stdout.write("[frps!] " + d));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  await sleep(1500);

  const lines = [];
  frp.onLog((l) => {
    lines.push(l);
    process.stdout.write("[frpc] " + l + "\n");
  });

  const profile = {
    name: "e2e-mc",
    kind: "frpc",
    serverAddr: "127.0.0.1",
    serverPort: 17000,
    token: "e2e-token",
    localPort: 25565,
    remotePort: 25599,
    type: "tcp",
  };

  const res = await frp.start(profile);
  console.log("start ->", JSON.stringify(res));
  await sleep(4000);
  console.log("status ->", JSON.stringify(frp.status()));

  const ok =
    res.ok &&
    /start proxy success/i.test(lines.join("\n")) &&
    frp.status().address === "127.0.0.1:25599";

  frp.stop();
  await sleep(500);
  frps.kill();
  console.log(ok ? "E2E PASS" : "E2E FAIL");
  process.exit(ok ? 0 : 1);
})().catch((e) => {
  console.error("E2E ERROR", e);
  try { frps.kill(); } catch {}
  process.exit(1);
});
