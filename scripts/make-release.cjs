/**
 * 生成可上传到 GitHub Release 的 agent 资产。
 *
 *   node scripts/make-release.cjs          # 用已编译的 agent
 *   node scripts/make-release.cjs --build  # 先 cargo build --release
 *
 * 产物：release/mcss-agent-<version>-win64.zip + SHA256SUMS.txt
 * 官网的「下载助手」按钮就指向这个 zip。
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const RELEASE_DIR = path.join(ROOT, "release");
const AGENT_EXE = path.join(ROOT, "agent", "target", "release", "mcss-agent.exe");

if (process.argv.includes("--build")) {
  console.log("cargo build --release …");
  execSync("cargo build --release --manifest-path agent/Cargo.toml", { cwd: ROOT, stdio: "inherit" });
}

if (!fs.existsSync(AGENT_EXE)) {
  console.error(`找不到 ${AGENT_EXE}\n先跑：cargo build --release --manifest-path agent/Cargo.toml（或加 --build）`);
  process.exit(1);
}

fs.mkdirSync(RELEASE_DIR, { recursive: true });

const stage = fs.mkdtempSync(path.join(require("os").tmpdir(), "mcss-rel-"));
fs.copyFileSync(AGENT_EXE, path.join(stage, "mcss-agent.exe"));
fs.copyFileSync(path.join(ROOT, "agent", "README.md"), path.join(stage, "README.md"));

const zipName = `mcss-agent-${pkg.version}-win64.zip`;
const zipPath = path.join(RELEASE_DIR, zipName);
if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
execSync(`tar -a -c -f "${zipPath}" mcss-agent.exe README.md`, { cwd: stage, stdio: "inherit" });
fs.rmSync(stage, { recursive: true, force: true });

// 再放一份**不带版本号**的稳定名：网页上的下载按钮用它，
// 否则每次发版链接都会失效（releases/latest/download/<带版本号的名字>）
const stableName = "mcss-agent-win64.zip";
const stablePath = path.join(RELEASE_DIR, stableName);
fs.copyFileSync(zipPath, stablePath);

const buf = fs.readFileSync(zipPath);
const sha256 = crypto.createHash("sha256").update(buf).digest("hex");
const sumsPath = path.join(RELEASE_DIR, "SHA256SUMS.txt");
fs.writeFileSync(sumsPath, `${sha256}  ${zipName}\n${sha256}  ${stableName}\n`);

console.log(`\n产物：${zipPath}`);
console.log(`稳定名：${stablePath}（网页按钮用这个，发版不会失效）`);
console.log(`大小：${(buf.length / 1024).toFixed(0)} KB`);
console.log(`SHA256：${sha256}`);
console.log(`列表：${sumsPath}`);
console.log(`\n上传到 Release 后，两个名字都要传；网页按钮指向：<repo>/releases/latest/download/${stableName}`);
