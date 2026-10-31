/**
 * 生成可上传到 GitHub Release 的 agent 资产。
 *
 *   node scripts/make-release.cjs          # 用已编译的 agent
 *   node scripts/make-release.cjs --build  # 先 cargo build --release
 *
 * 产物：
 *   release/mcss-agent-<version>-win64.zip   便携版
 *   release/mcss-agent-<version>-setup.exe    安装包（Windows + Inno Setup 6）
 *   release/SHA256SUMS.txt
 *
 * 网页的「下载助手」按钮指向稳定名 mcss-agent-setup.exe。
 * 找不到 Inno Setup 时只产出 zip，并在日志里明确提示。
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { execFileSync, execSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const RELEASE_DIR = path.join(ROOT, "release");
const AGENT_EXE = path.join(ROOT, "agent", "target", "release", "mcss-agent.exe");
const ISS = path.join(ROOT, "installer", "agent.iss");

if (process.argv.includes("--build")) {
  console.log("cargo build --release …");
  execSync("cargo build --release --manifest-path agent/Cargo.toml", { cwd: ROOT, stdio: "inherit" });
}

if (!fs.existsSync(AGENT_EXE)) {
  console.error(`找不到 ${AGENT_EXE}\n先跑：cargo build --release --manifest-path agent/Cargo.toml（或加 --build）`);
  process.exit(1);
}

fs.mkdirSync(RELEASE_DIR, { recursive: true });

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function findIscc() {
  if (process.platform !== "win32") return "";
  const candidates = [
    process.env.INNO_SETUP_ISCC,
    path.join(process.env.LOCALAPPDATA || "", "Programs", "Inno Setup 6", "ISCC.exe"),
    "C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe",
    "C:\\Program Files\\Inno Setup 6\\ISCC.exe",
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p)) || "";
}

const assets = [];

// 1. 便携版 zip
const stage = fs.mkdtempSync(path.join(require("os").tmpdir(), "mcss-rel-"));
fs.copyFileSync(AGENT_EXE, path.join(stage, "mcss-agent.exe"));
fs.copyFileSync(path.join(ROOT, "agent", "README.md"), path.join(stage, "README.md"));

const zipName = `mcss-agent-${pkg.version}-win64.zip`;
const zipPath = path.join(RELEASE_DIR, zipName);
if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
execSync(`tar -a -c -f "${zipPath}" mcss-agent.exe README.md`, { cwd: stage, stdio: "inherit" });
fs.rmSync(stage, { recursive: true, force: true });

const stableZip = "mcss-agent-win64.zip";
fs.copyFileSync(zipPath, path.join(RELEASE_DIR, stableZip));
assets.push(zipName, stableZip);

// 2. 安装包：安装到 %LOCALAPPDATA%\Programs，写开始菜单和卸载项
const setupName = `mcss-agent-${pkg.version}-setup.exe`;
let setupPath = "";
const iscc = findIscc();
if (iscc && fs.existsSync(ISS)) {
  console.log(`Inno Setup：${iscc}`);
  execFileSync(
    iscc,
    [`/DAppVersion=${pkg.version}`, `/DSourceExe=${AGENT_EXE}`, ISS],
    { cwd: ROOT, stdio: "inherit" },
  );
  setupPath = path.join(RELEASE_DIR, setupName);
  if (!fs.existsSync(setupPath)) throw new Error(`安装包没有生成：${setupPath}`);
  const stableSetup = "mcss-agent-setup.exe";
  fs.copyFileSync(setupPath, path.join(RELEASE_DIR, stableSetup));
  assets.push(setupName, stableSetup);
} else {
  console.warn("未找到 Inno Setup 6（或 installer/agent.iss），本次只产出便携版 zip。");
  console.warn("安装：winget install --id JRSoftware.InnoSetup -e；或设置 INNO_SETUP_ISCC。");
}

const lines = assets.map((name) => `${sha256(path.join(RELEASE_DIR, name))}  ${name}`);
const sumsPath = path.join(RELEASE_DIR, "SHA256SUMS.txt");
fs.writeFileSync(sumsPath, `${lines.join("\n")}\n`);

console.log("\n产物：");
for (const name of assets) {
  const file = path.join(RELEASE_DIR, name);
  console.log(`  ${name}  ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
}
if (setupPath) console.log(`\n网页下载按钮：<repo>/releases/latest/download/mcss-agent-setup.exe`);
console.log(`校验清单：${sumsPath}`);
