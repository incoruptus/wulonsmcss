/**
 * 校验两套下载实现都被同一份契约覆盖。
 *
 * 起因：下载逻辑在 Node（electron/ipc/download.js）和 Rust（agent 的 download_to）
 * 各有一份，行为很容易悄悄漂移。这里不比较代码，只要求两边都测到同样的场景——
 * 场景清单在 scripts/download-contract.json。
 *
 *   node scripts/check-download-contract.cjs
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const contract = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts", "download-contract.json"), "utf8"));
const targets = [
  { name: "Node（electron/ipc/download.test.ts）", file: path.join(ROOT, "electron/ipc/download.test.ts") },
  { name: "Rust（agent/src/main.rs 的 download_contract）", file: path.join(ROOT, "agent/src/main.rs") },
];

let failed = false;
for (const target of targets) {
  const text = fs.readFileSync(target.file, "utf8");
  const missing = contract.scenarios.filter((s) => !text.includes(`[${s.id}]`)).map((s) => s.id);
  if (missing.length) {
    failed = true;
    console.log(`FAIL  ${target.name} 缺少场景：${missing.join(", ")}`);
  } else {
    console.log(`PASS  ${target.name} 覆盖 ${contract.scenarios.length} 个场景`);
  }
}

if (failed) {
  console.error("\n契约要求：scripts/download-contract.json 里的每个场景，两边都要有用例（测试名带 [id]）。");
  process.exit(1);
}
