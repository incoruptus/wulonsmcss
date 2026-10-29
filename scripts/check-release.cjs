/**
 * 发布前自检：把「这个包能不能发」变成一条命令。
 *
 *   node scripts/check-release.cjs           # 检查网页产物（CI 用）
 *   node scripts/check-release.cjs --package # 额外检查打包目录
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));

const problems = [];
const checks = [];

function check(name, ok, detail = "") {
  checks.push({ name, ok, detail });
  if (!ok) problems.push(`${name}${detail ? `：${detail}` : ""}`);
}

/** 1. 版本号：package.json 必须是 x.y.z，且各处引用一致 */
check("package.json 版本合法", /^\d+\.\d+\.\d+$/.test(pkg.version), pkg.version);

const agentCargo = fs.readFileSync(path.join(ROOT, "agent", "Cargo.toml"), "utf8");
check(
  "agent 从 package.json 取版本（build.rs）",
  fs.existsSync(path.join(ROOT, "agent", "build.rs")) && agentCargo.includes('path = "src/main.rs"'),
  "缺 build.rs 或 bin 配置",
);

/** 2. 网页产物 */
const distWeb = path.join(ROOT, "dist-web");
const indexHtml = path.join(distWeb, "index.html");
check("dist-web/index.html 存在", fs.existsSync(indexHtml), distWeb);

if (fs.existsSync(indexHtml)) {
  const html = fs.readFileSync(indexHtml, "utf8");
  check("页面有挂载点", html.includes('id="root"'), "index.html 里没有 #root");
  check("资源用相对路径（可挂子目录）", /src="\.\/assets\//.test(html) || /href="\.\/assets\//.test(html), "资源路径不是 ./assets/");
  check("没有内联到主域名的绝对地址", !/src="\/assets\//.test(html));

  const assets = path.join(distWeb, "assets");
  const js = fs.existsSync(assets) ? fs.readdirSync(assets).filter((f) => f.endsWith(".js")) : [];
  check("有 JS 产物", js.length > 0, assets);
}

/** 3. 打包目录（可选） */
if (process.argv.includes("--package")) {
  const outDir = path.join(path.dirname(ROOT), `wulons-mcss-b${pkg.version}`, "WulonsMCSS-win32-x64");
  check("打包目录存在", fs.existsSync(outDir), outDir);

  if (fs.existsSync(outDir)) {
    const versionFile = path.join(outDir, "version");
    const stamped = fs.existsSync(versionFile) ? fs.readFileSync(versionFile, "utf8").trim() : "";
    check("包内版本与 package.json 一致", stamped === pkg.version, `包内 ${stamped} / package ${pkg.version}`);

    const info = path.join(outDir, "build-info.json");
    check("有 build-info.json", fs.existsSync(info));
    if (fs.existsSync(info)) {
      const data = JSON.parse(fs.readFileSync(info, "utf8"));
      check("build-info 版本一致", data.version === pkg.version, JSON.stringify(data));
      check("记录了提交号", Boolean(data.commit) && data.commit !== "unknown", data.commit);
    }

    const agentExe = path.join(outDir, "resources", "agent", "mcss-agent.exe");
    check("带上了本地助手", fs.existsSync(agentExe));

    const asar = path.join(outDir, "resources", "app.asar");
    check("有 app.asar", fs.existsSync(asar));
    if (fs.existsSync(asar)) {
      const text = fs.readFileSync(asar).toString("utf8");
      // 抽查几个「新功能」字符串，确认包不是旧的
      for (const marker of ["时间机", "同 WiFi 直连", "AI 配置助手", "你的客户端可以直接进", "直接进游戏", "client:launch", "界面出了点问题"]) {
        check(`包内含新功能：${marker}`, text.includes(marker));
      }
    }
  }
}

for (const c of checks) console.log(`${c.ok ? "PASS" : "FAIL"}  ${c.name}${c.detail && !c.ok ? `  (${c.detail})` : ""}`);
console.log(`\n${checks.length - problems.length}/${checks.length} 通过`);
if (problems.length) {
  console.error("\n问题：\n" + problems.map((p) => `- ${p}`).join("\n"));
  process.exit(1);
}
