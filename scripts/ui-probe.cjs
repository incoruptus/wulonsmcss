/**
 * 界面探针：起一个真实窗口 → 执行一段脚本（点按钮/切标签页）→ 等一会儿 → 截图 + 抓 DOM 文本
 *
 * 用途：把"我点了 XX 之后就黑屏了"变成一条可复现、可断言的命令。
 * 黑屏时 DOM 文本是空的、截出来是全黑 —— 这两种现象都能在这里直接看到。
 *
 * 用法：
 *   node scripts/ui-probe.cjs --click "[aria-label='新建实例']" --delay 9000
 *   node scripts/ui-probe.cjs --js "location.hash='#/settings'" --route "#/settings"
 *   node scripts/ui-probe.cjs --click "text=加入房间"
 *
 * 参数：
 *   --js <代码>        在窗口里执行的 JS（与 --click 二选一）
 *   --click <选择器>   document.querySelector(sel).click()；text= 开头则按文本找按钮
 *   --route <hash>     启动路由，例如 "#/instances"
 *   --delay <ms>       点完到截图之间的等待（默认 8000）
 *   --act-delay <ms>   窗口显示到点按钮之间的等待（默认 1500）
 *   --shot <png>       截图路径（默认 _probe.png）
 *   --keep             保留窗口（不截图退出），用于手点
 *
 * 退出码：0 = 页面有内容；1 = 空白/黑屏（探针判定为崩溃）
 */
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_EXE = path.join(ROOT, "node_modules", ".pnpm", "electron@33.4.11", "node_modules", "electron", "dist", "electron.exe");

function arg(name, fallback = "") {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = process.argv[i + 1];
  return v && !v.startsWith("--") ? v : "true";
}

/** --exe：探针可以直接打打包好的免安装版，而不只是开发目录里的 electron */
const customExe = arg("exe");
const EXE = customExe ? path.resolve(customExe) : DEFAULT_EXE;
const APP_ARGS = customExe ? [] : ["."];

const js = arg("js");
const click = arg("click");
const route = arg("route");
const delay = arg("delay", "8000");
const actDelay = arg("act-delay", "1500");
const shot = path.resolve(ROOT, arg("shot", "_probe.png"));
const keep = process.argv.includes("--keep");

let code = js;
if (!code && click) {
  code = click.startsWith("text=")
    ? `(() => {
        const want = ${JSON.stringify(click.slice(5))};
        const el = [...document.querySelectorAll("button,a")].find((n) => (n.textContent || "").trim().includes(want));
        if (!el) return "NOT_FOUND:" + want;
        el.click();
        return "clicked:" + want;
      })()`
    : `(() => {
        const el = document.querySelector(${JSON.stringify(click)});
        if (!el) return "NOT_FOUND:" + ${JSON.stringify(click)};
        el.click();
        return "clicked:" + ${JSON.stringify(click)};
      })()`;
}

if (!fs.existsSync(EXE)) {
  console.error("找不到 electron：", EXE);
  process.exit(2);
}

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
env.MCSS_LOG_STDOUT = "1";
if (code) env.MCSS_ACT = code;
if (code) env.MCSS_ACT_DELAY = actDelay;
if (route) env.MCSS_START_HASH = route;
if (!keep) {
  env.MCSS_DUMP = "1";
  env.MCSS_SHOT = shot;
  env.MCSS_SHOT_DELAY = delay;
  env.MCSS_SHOT_EXIT = "1";
}

const child = spawn(EXE, APP_ARGS, { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"] });
let out = "";
child.stdout.on("data", (d) => {
  const s = String(d);
  out += s;
  if (/DUMP>>>|screenshot saved|console-error|renderer-gone|act/.test(s)) process.stdout.write("[app] " + s);
});
child.stderr.on("data", (d) => {
  const s = String(d);
  if (!/Autofill|DevTools|crashpad|Security Warning|unsafe-eval|consult|This warning|GPU|gpu/i.test(s)) process.stderr.write("[app:err] " + s);
});

const timer = setTimeout(() => {
  console.log("TIMEOUT: 探针超时，强杀");
  child.kill();
  process.exit(1);
}, Number(delay) + 30000);

child.on("exit", () => {
  clearTimeout(timer);
  const dump = (out.match(/DUMP>>>([\s\S]*?)(?:\n\[app\]|$)/) || [])[1] || "";
  // dump 第一行是 location 信息，剩下才是页面文本
  const body = dump.split("\n").slice(1).join("\n").trim();
  if (keep) return process.exit(0);
  console.log(`\n=== 结果 ===\n截图：${shot}\n页面文本长度：${body.length}`);
  const expect = arg("expect");
  if (expect && !body.includes(expect)) {
    console.log(`❌ 页面里没找到「${expect}」`);
    process.exit(1);
  }
  if (body.length < 20) {
    console.log("❌ 页面几乎空白 —— 认定黑屏/白屏");
    process.exit(1);
  }
  console.log("✅ 页面有内容");
  process.exit(0);
});
