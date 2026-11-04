/**
 * 生成轻量更新包。
 *
 * 桌面版 273MB 里，Electron 运行时占 200MB 以上，真正每次迭代会变的是
 * out/（主进程 + 渲染层）+ electron/ipc。把它们压成 app.asar.gz 后通常
 * 只有十几 MB，用户不必为了一个小版本重下完整包。
 *
 * 产物：
 *   release/update/mcss-app-<version>.asar.gz
 *   release/update/update.json
 *
 * update.json 里带 runtime（当前 Electron 版本）。客户端比对：
 * 运行时一致才走轻量更新，不一致提示下载完整包。
 *
 *   node scripts/make-update.cjs [--skip-build]
 */

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");
const { execSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const OUT_DIR = path.join(ROOT, "release", "update");
const TMP = path.join(ROOT, ".tmp-update");
const ASAR = path.join(TMP, "app.asar");
const GZ = path.join(OUT_DIR, `mcss-app-${pkg.version}.asar.gz`);

function sh(cmd) {
  execSync(cmd, { cwd: ROOT, stdio: "inherit", shell: true });
}

function runtimeVersion() {
  try {
    const raw = fs.readFileSync(path.join(ROOT, "node_modules", "electron", "package.json"), "utf8");
    return JSON.parse(raw).version;
  } catch {
    return "unknown";
  }
}

function main() {
  const skipBuild = process.argv.includes("--skip-build");

  if (!skipBuild) {
    console.log("building renderer + main...");
    sh("pnpm build");
  }

  fs.rmSync(TMP, { recursive: true, force: true });
  fs.mkdirSync(TMP, { recursive: true });

  // app.asar 的内容必须和完整包一致，否则轻量更新后行为会和完整包不同
  fs.cpSync(path.join(ROOT, "out"), path.join(TMP, "out"), { recursive: true });
  fs.cpSync(path.join(ROOT, "electron", "ipc"), path.join(TMP, "electron", "ipc"), { recursive: true });
  fs.copyFileSync(path.join(ROOT, "package.json"), path.join(TMP, "package.json"));

  const resDir = path.join(TMP, "resources");
  const fontDir = path.join(ROOT, "resources", "fonts");
  if (fs.existsSync(fontDir)) fs.cpSync(fontDir, path.join(resDir, "fonts"), { recursive: true });
  const icon = path.join(ROOT, "resources", "app-icon.png");
  if (fs.existsSync(icon)) {
    fs.mkdirSync(resDir, { recursive: true });
    fs.copyFileSync(icon, path.join(resDir, "app-icon.png"));
  }

  console.log("packing app.asar...");
  sh(`"${path.join(ROOT, "node_modules", ".bin", "asar.cmd")}" pack "${TMP}" "${ASAR}"`);

  console.log("compressing...");
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const asar = fs.readFileSync(ASAR);
  const gz = zlib.gzipSync(asar, { level: 9 });
  fs.writeFileSync(GZ, gz);

  const sha256 = crypto.createHash("sha256").update(gz).digest("hex");
  const notesFile = path.join(ROOT, "docs", `RELEASE-NOTES-v${pkg.version.split(".")[0]}.md`);
  const notes = fs.existsSync(notesFile)
    ? fs.readFileSync(notesFile, "utf8").split("\n").slice(0, 12).join("\n")
    : "";

  const manifest = {
    version: pkg.version,
    runtime: runtimeVersion(),
    releasedAt: new Date().toISOString(),
    notes,
    asar: {
      // 相对 update.json 的地址，换镜像时不用改客户端
      url: `./${path.basename(GZ)}`,
      sha256,
      size: gz.length,
      packed: asar.length,
    },
  };
  fs.writeFileSync(path.join(OUT_DIR, "update.json"), `${JSON.stringify(manifest, null, 2)}\n`);

  fs.rmSync(TMP, { recursive: true, force: true });

  const mb = (n) => `${(n / 1024 / 1024).toFixed(2)}MB`;
  console.log(`\nupdate package ready:`);
  console.log(`  asar    ${mb(asar.length)}`);
  console.log(`  gzip    ${mb(gz.length)}`);
  console.log(`  sha256  ${sha256}`);
  console.log(`  -> ${path.relative(ROOT, OUT_DIR)}`);
}

main();
