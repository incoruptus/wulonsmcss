/**
 * 能力一致性检查：桌面版 preload 暴露的 channel vs agent 已实现的 channel
 *
 *   node scripts/check-parity.cjs          # 打印差距
 *   node scripts/check-parity.cjs --strict # 有差距就退出码 1（CI 用）
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PRELOAD = path.join(ROOT, "electron", "preload", "index.ts");
const AGENT = path.join(ROOT, "agent", "src", "main.rs");

/** 网页版天然不需要的通道（没有窗口、没有 Electron 对话框等） */
const WEB_IRRELEVANT = new Set([
  "window:is-maximized",
  "window:minimize",
  "window:maximize",
  "window:close",
  // 网页版刷新即最新，没有可替换的应用层；更新入口在网页上只做说明
  "app:update-check",
  "app:update-download",
  "app:update-apply",
]);

function desktopChannels() {
  const text = fs.readFileSync(PRELOAD, "utf8");
  const channels = new Set();
  for (const m of text.matchAll(/invoke\("([^"]+)"/g)) channels.add(m[1]);
  for (const m of text.matchAll(/subscribe\("([^"]+)"/g)) channels.add(m[1]);
  return channels;
}

function agentChannels() {
  const text = fs.readFileSync(AGENT, "utf8");
  const channels = new Set();
  // match 分支：行首一串空白 + "channel" => ...
  for (const m of text.matchAll(/^\s*"([a-z0-9-]+:[a-z0-9:-]+)"\s*=>/gm)) channels.add(m[1]);
  // 事件通道不一定出现在 match 里，只要作为字符串被广播过就算已实现
  for (const m of text.matchAll(/"(server:output|client:progress|server:status|versions:progress|frp:log|frp:status)"/g)) channels.add(m[1]);
  return channels;
}

const desktop = desktopChannels();
const agent = agentChannels();

const missing = [...desktop].filter((c) => !agent.has(c) && !WEB_IRRELEVANT.has(c)).sort();
const extra = [...agent].filter((c) => !desktop.has(c)).sort();

const group = (list) => {
  const map = new Map();
  for (const channel of list) {
    const key = channel.split(":")[0];
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(channel.slice(key.length + 1));
  }
  return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
};

console.log(`桌面版通道：${desktop.size}    agent 已实现：${agent.size}    缺：${missing.length}\n`);

if (missing.length) {
  console.log("缺的通道（按域分组）：");
  for (const [key, names] of group(missing)) {
    console.log(`  ${key.padEnd(10)} ${names.join(", ")}`);
  }
  console.log("");
}

if (extra.length) {
  console.log(`agent 多出来的（桌面版没有，通常是网页专用）：${extra.join(", ")}\n`);
}

const pct = ((desktop.size - missing.length - [...desktop].filter((c) => WEB_IRRELEVANT.has(c)).length) / (desktop.size - [...desktop].filter((c) => WEB_IRRELEVANT.has(c)).length)) * 100;
console.log(`网页版能力覆盖：${pct.toFixed(1)}%`);

if (process.argv.includes("--strict") && missing.length) process.exit(1);
