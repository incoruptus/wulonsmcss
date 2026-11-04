/**
 * 发布 GitHub Release 并上传资产。
 *
 * 凭据从 Git Credential Manager 取（和 git push 用的是同一份），
 * 不在仓库里存 token，也不打印它。
 *
 *   node scripts/publish-release.cjs            # 创建/复用 Release 并上传全部资产
 *   node scripts/publish-release.cjs --only app # 只传 mcss-app.asar.gz
 */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const REPO = process.env.MCSS_REPO || "incoruptus/wulonsmcss";
const TAG = `v${pkg.version}`;
const PROXY = process.env.HTTPS_PROXY || process.env.https_proxy || "http://127.0.0.1:7890";
const ONLY = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : null;

function githubToken() {
  const res = spawnSync("git", ["credential", "fill"], {
    input: "protocol=https\nhost=github.com\n\n",
    encoding: "utf8",
  });
  const match = String(res.stdout || "").match(/^password=(.+)$/m);
  if (!match) throw new Error("取不到 GitHub 凭据；先 git push 一次让 GCM 存下凭据");
  return match[1].trim();
}

function api(token, method, url, body) {
  const args = [
    "-sS",
    "--max-time", "180",
    "-x", PROXY,
    "-X", method,
    "-H", `Authorization: Bearer ${token}`,
    "-H", "Accept: application/vnd.github+json",
    "-H", "X-GitHub-Api-Version: 2022-11-28",
  ];
  let tmp = null;
  if (body !== undefined) {
    // 直接 -d 传含换行的 JSON 会被 curl 当成表单数据，GitHub 会回 Problems parsing JSON
    tmp = path.join(require("os").tmpdir(), `mcss-release-${Date.now()}.json`);
    fs.writeFileSync(tmp, JSON.stringify(body), "utf8");
    args.push("-H", "Content-Type: application/json", "--data-binary", `@${tmp}`);
  }
  args.push(url);
  const res = spawnSync("curl", args, { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  if (tmp) fs.rmSync(tmp, { force: true });
  const text = String(res.stdout || "").trim();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`GitHub API 返回无法解析：${text.slice(0, 200)} ${String(res.stderr || "").slice(0, 200)}`);
  }
}

function uploadAsset(token, releaseId, file) {
  const name = path.basename(file);
  const size = fs.statSync(file).size;
  console.log(`  ↑ ${name} (${(size / 1024 / 1024).toFixed(2)}MB)`);
  const args = [
    "-sS",
    "--max-time", "900",
    "-x", PROXY,
    "-X", "POST",
    "-H", `Authorization: Bearer ${token}`,
    "-H", "Content-Type: application/octet-stream",
    "--data-binary", `@${file}`,
    `https://uploads.github.com/repos/${REPO}/releases/${releaseId}/assets?name=${encodeURIComponent(name)}`,
  ];
  const res = spawnSync("curl", args, { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  const parsed = JSON.parse(String(res.stdout || "{}"));
  if (parsed.state === "uploaded" || parsed.id) {
    console.log(`    ok (${parsed.size ?? size}B)`);
    return true;
  }
  console.log(`    failed: ${JSON.stringify(parsed).slice(0, 200)}`);
  return false;
}

function main() {
  const token = githubToken();
  console.log(`repo ${REPO}  tag ${TAG}`);

  let release = api(token, "GET", `https://api.github.com/repos/${REPO}/releases/tags/${TAG}`);
  if (!release || !release.id) {
    const notesFile = path.join(ROOT, "docs", `RELEASE-NOTES-v${pkg.version.split(".")[0]}.md`);
    const body = fs.existsSync(notesFile) ? fs.readFileSync(notesFile, "utf8") : "";
    release = api(token, "POST", `https://api.github.com/repos/${REPO}/releases`, {
      tag_name: TAG,
      name: `Wulon's MCSS ${TAG}`,
      body,
      draft: false,
      prerelease: false,
    });
    if (!release.id) throw new Error(`创建 Release 失败：${JSON.stringify(release).slice(0, 300)}`);
    console.log(`release 已创建 #${release.id}`);
  } else {
    console.log(`release 已存在 #${release.id}`);
  }

  const assets = [
    { key: "app", file: path.join(ROOT, "release/update/mcss-app.asar.gz") },
    { key: "agent-setup", file: path.join(ROOT, "release", `mcss-agent-${pkg.version}-setup.exe`) },
    { key: "agent-zip", file: path.join(ROOT, "release", `mcss-agent-${pkg.version}-win64.zip`) },
    { key: "sums", file: path.join(ROOT, "release/SHA256SUMS.txt") },
    { key: "desktop", file: path.join(ROOT, "release", `WulonsMCSS-${pkg.version}-win64.zip`) },
  ].filter((a) => (ONLY ? a.key === ONLY : true));

  const existing = new Map((release.assets || []).map((a) => [a.name, a.id]));
  for (const asset of assets) {
    if (!fs.existsSync(asset.file)) {
      console.log(`  - 跳过（不存在）${asset.file}`);
      continue;
    }
    const name = path.basename(asset.file);
    if (existing.has(name)) {
      // 重新打包后同名资产要覆盖，否则用户下到的是旧包
      console.log(`  x 替换旧资产 ${name}`);
      api(token, "DELETE", `https://api.github.com/repos/${REPO}/releases/assets/${existing.get(name)}`);
    }
    uploadAsset(token, release.id, asset.file);
  }
  console.log(`\n完成：https://github.com/${REPO}/releases/tag/${TAG}`);
}

main();
