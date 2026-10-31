/**
 * 收集随包分发的运行时依赖许可证，生成 THIRD-PARTY-NOTICES.md。
 *
 *   node scripts/collect-licenses.cjs
 *
 * 只处理 package.json 的 dependencies（不打进包里的构建工具不列），
 * 优先读各包自己的 LICENSE / COPYING 文件；找不到才退回 package.json 的 license 字段。
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const names = Object.keys(pkg.dependencies || {});

function resolvePkg(name) {
  const direct = path.join(ROOT, "node_modules", name);
  if (fs.existsSync(path.join(direct, "package.json"))) return direct;
  try {
    return path.dirname(require.resolve(`${name}/package.json`, { paths: [ROOT] }));
  } catch {
    return null;
  }
}

function findLicenseFile(dir) {
  const candidates = fs.readdirSync(dir).filter((f) => /^(LICEN[CS]E|COPYING|NOTICE)/i.test(f));
  return candidates.length ? path.join(dir, candidates[0]) : null;
}

const sections = [];
for (const name of names.sort()) {
  const dir = resolvePkg(name);
  if (!dir) continue;
  const meta = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
  const license = typeof meta.license === "string" ? meta.license : meta.license?.type || "SEE PACKAGE";
  const file = findLicenseFile(dir);
  const text = file ? fs.readFileSync(file, "utf8").trim() : "";
  sections.push({ name, version: meta.version || "", license, file: file ? path.basename(file) : "", text });
}

const head = `# 第三方许可证与声明

Wulon's MCSS 随包分发以下运行时依赖。每个依赖的许可证原文如下；若某个包没有自带 LICENSE 文件，则标注其 package.json 中的 license 字段。

本文件由 \`node scripts/collect-licenses.cjs\` 生成，请勿手工编辑。

---

`;

const body = sections
  .map((s) => {
    const title = `## ${s.name}${s.version ? `@${s.version}` : ""} — ${s.license}`;
    if (s.text) return `${title}\n\n来源：\`${s.file}\`\n\n\`\`\`\n${s.text}\n\`\`\``;
    return `${title}\n\n该包没有自带 LICENSE 文件，package.json 标注为 ${s.license}。`;
  })
  .join("\n\n---\n\n");

fs.writeFileSync(path.join(ROOT, "THIRD-PARTY-NOTICES.md"), `${head}${body}\n`, "utf8");
const kb = (Buffer.byteLength(head + body) / 1024).toFixed(0);
console.log(`写入 THIRD-PARTY-NOTICES.md：${sections.length} 个运行时依赖，约 ${kb} KB`);
