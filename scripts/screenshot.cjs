const { spawn } = require("child_process");
const path = require("path");

const exe = "D:/Games/Minecraft/MCServer/wulons-mcss/node_modules/.pnpm/electron@33.4.11/node_modules/electron/dist/electron.exe";
const cwd = "D:/Games/Minecraft/MCServer/wulons-mcss";
const out = process.argv[2] || path.join(cwd, "_shot.png");

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
env.MCSS_SHOT = out;
env.MCSS_SHOT_EXIT = "1";
env.MCSS_SHOT_DELAY = process.argv[3] || "3500";
// 可选：从指定路由启动，例如 "/instances/legacy?tab=console"
if (process.argv[4]) env.MCSS_START_HASH = process.argv[4];

const p = spawn(exe, ["."], { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
p.stdout.on("data", (d) => process.stdout.write("[out] " + d));
p.stderr.on("data", (d) => {
  const s = String(d);
  if (!/Autofill|DevTools|crashpad|Security Warning|unsafe-eval|consult|This warning/i.test(s)) process.stderr.write("[err] " + s);
});
p.on("exit", (code) => {
  console.log("EXIT", code, "->", out);
  process.exit(0);
});
setTimeout(() => {
  console.log("TIMEOUT: killing");
  p.kill();
  setTimeout(() => process.exit(1), 1000);
}, 30000);
