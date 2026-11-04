/**
 * 多语种一致性检查。
 *
 * 校验四件事：
 *   1. 代码里 t("key", ...) 用到的 key，英文词典里都有（缺了就回退中文）
 *   2. 词典没有空值
 *   3. key 不跨文件重复（重复会互相覆盖，且看不出是哪边赢）
 *   4. 报告词典里没被用到的 key（多为改名残留，供清理）
 *
 *   node scripts/check-i18n.cjs          # 打印报告
 *   node scripts/check-i18n.cjs --strict # 有缺失/空值/重复就退出码 1（CI 用）
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const MSG_DIR = path.join(ROOT, "src/renderer/i18n/messages");
const SRC_DIR = path.join(ROOT, "src/renderer");
const STRICT = process.argv.includes("--strict");

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      walk(full, out);
    } else {
      out.push(full);
    }
  }
  return out;
}

// ---- 1) 词典 ----
const dict = new Map(); // key -> { file, value }
const duplicates = [];

for (const name of fs.readdirSync(MSG_DIR).filter((f) => f.endsWith(".ts") && f !== "index.ts")) {
  const file = path.join(MSG_DIR, name);
  const text = fs.readFileSync(file, "utf8");
  const re = /^\s*"([^"]+)":\s*(?:"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`)\s*,?\s*$/gm;
  for (const m of text.matchAll(re)) {
    const key = m[1];
    const value = m[2] ?? m[3] ?? "";
    if (dict.has(key)) duplicates.push({ key, first: dict.get(key).file, second: name });
    else dict.set(key, { file: name, value });
  }
}

// ---- 2) 代码里的取词 ----
const used = new Map(); // key -> count
for (const file of walk(SRC_DIR)) {
  if (!/\.(tsx?|jsx?)$/.test(file)) continue;
  if (file.includes(`${path.sep}i18n${path.sep}`)) continue;
  const text = fs.readFileSync(file, "utf8");
  for (const m of text.matchAll(/\b(?:t|tGlobal)\(\s*\n?\s*"([^"]+)"/g)) {
    used.set(m[1], (used.get(m[1]) ?? 0) + 1);
  }
}

const missing = [...used.keys()].filter((k) => !dict.has(k)).sort();
const empty = [...dict.entries()].filter(([, v]) => !String(v.value).trim()).map(([k]) => k);
const unused = [...dict.keys()].filter((k) => !used.has(k)).sort();

const line = (label, value) => console.log(`  ${label.padEnd(12)} ${value}`);
console.log("i18n check");
line("词典条数", dict.size);
line("代码引用", used.size);
line("缺失", missing.length);
line("空值", empty.length);
line("重复", duplicates.length);
line("未使用", unused.length);

if (missing.length) {
  console.log("\n以下 key 在代码里使用、但词典没有（英文界面会回退中文）:");
  for (const key of missing.slice(0, 40)) console.log(`  - ${key}`);
  if (missing.length > 40) console.log(`  … 还有 ${missing.length - 40} 条`);
}

if (empty.length) {
  console.log("\n空值 key:");
  for (const key of empty) console.log(`  - ${key}`);
}

if (duplicates.length) {
  console.log("\n重复 key:");
  for (const d of duplicates) console.log(`  - ${d.key}（${d.first} / ${d.second}）`);
}

if (unused.length) {
  console.log("\n词典里未被引用的 key（可能是改名残留）:");
  for (const key of unused.slice(0, 30)) console.log(`  - ${key}（${dict.get(key).file}）`);
  if (unused.length > 30) console.log(`  … 还有 ${unused.length - 30} 条`);
}

if (STRICT && (missing.length || empty.length || duplicates.length)) {
  process.exit(1);
}
