/**
 * 端到端验证：占住 25565 → 自动启动服务器 → 触发「端口被占用」诊断卡 → 截图
 */
const net = require("net");
const { spawn } = require("child_process");

const EXE = "D:/Games/Minecraft/MCServer/wulons-mcss/node_modules/.pnpm/electron@33.4.11/node_modules/electron/dist/electron.exe";
const ROOT = "D:/Games/Minecraft/MCServer/wulons-mcss";
const SHOT = "D:/Games/Minecraft/MCServer/wulons-mcss/_shot-crash.png";

const blocker = net.createServer(() => {});
blocker.listen(25565, "0.0.0.0", () => {
  console.log("port 25565 occupied");
  const env = { ...process.env, MCSS_AUTOSTART: "legacy", MCSS_START_HASH: "/instances/legacy?tab=console", MCSS_SHOT: SHOT, MCSS_SHOT_EXIT: "1", MCSS_SHOT_DELAY: "32000" };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = spawn(EXE, ["."], { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"] });
  app.stdout.on("data", (d) => { const s = String(d); if (s.includes("screenshot")) console.log(s.trim()); });
  app.on("exit", () => {
    blocker.close();
    console.log("done ->", SHOT);
    process.exit(0);
  });
  setTimeout(() => { app.kill(); blocker.close(); process.exit(1); }, 90000);
});
