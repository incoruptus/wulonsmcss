/**
 * 图标栈盘点：统计 lucide-react 的导入面，方便评估迁移成本。
 *
 *   node scripts/icon-audit.cjs
 *   node scripts/icon-audit.cjs --aviala <path-to-index.d.ts>
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "src", "renderer");

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
}

const files = [];
walk(ROOT, files);

const counts = new Map();
const perFile = [];
for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  const match = text.match(/import\s*\{([^}]+)\}\s*from\s*["']lucide-react["']/s);
  if (!match) continue;
  const names = match[1]
    .split(",")
    .map((part) => part.trim().split(/\s+as\s+/)[0].trim())
    .filter(Boolean);
  perFile.push({ file: path.relative(ROOT, file), names });
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
}

const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
console.log(`lucide 导入文件：${perFile.length}   唯一图标：${sorted.length}\n`);
console.log(sorted.map(([name, count]) => `${name}${count > 1 ? ` ×${count}` : ""}`).join("\n"));

const avialaPath = process.argv[process.argv.indexOf("--aviala") + 1];
if (avialaPath && fs.existsSync(avialaPath)) {
  const text = fs.readFileSync(avialaPath, "utf8");
  const available = new Set(
    [...text.matchAll(/declare function ([A-Za-z0-9_]+)\(/g)].map((m) => m[1]).filter((n) => !/^(Icon|IconFrame|resolveIconSizeToken)$/.test(n)),
  );
  console.log(`\nAviala 图标数：${available.size}`);
  const missing = sorted.map(([name]) => name).filter((name) => !available.has(name));
  console.log(`同名可直接对应：${sorted.length - missing.length}`);
  console.log(`需要映射/自绘：${missing.length}`);
  console.log(missing.join(", "));
}
