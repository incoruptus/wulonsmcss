#!/usr/bin/env node
/**
 * 生成 Modrinth slug → 中文名 对照表
 * ------------------------------------------------------------
 * 数据源：MC 百科（mcmod.cn）的条目表，PCL 把它整理成了
 * `PCLCS/Resource/WikiEntries.txt`（一个 slug|中文名 的纯文本库）。
 * 我们只取其中「Modrinth slug + 中文名」这一列，转成 JSON 给渲染层用。
 *
 * 用法：
 *   node scripts/build-zh-names.cjs                 # 从 jsDelivr 拉最新
 *   node scripts/build-zh-names.cjs --from file.txt # 用本地文件（离线/审阅）
 *
 * 说明：
 *   - 只保留有中文名的条目；没有中文名的项目在界面上显示英文标题，不编造。
 *   - 名字里的 `*` 是 PCL 的占位符（表示展示时补英文名），这里去掉。
 *   - 括号里的英文原名去掉，界面上本来就会同时显示英文标题。
 *   - 数据版权归 MC 百科 / 各条目作者；PCL 仅做整理。见 docs/ZH-NAMES.md。
 */
const fs = require("fs");
const path = require("path");

const SRC =
  "https://cdn.jsdelivr.net/gh/Hex-Dragon/PCL2@main/PCLCS/Resource/WikiEntries.txt";
const OUT = path.join(__dirname, "..", "src", "renderer", "assets", "zh-names.json");

function parse(text) {
  const lines = text.split(/\r?\n/);
  lines.pop(); // 最后一行是浏览量基数（86 进制），这里不需要
  const map = new Map();
  for (const line of lines) {
    if (!line) continue;
    for (const entry of line.split("¨")) {
      const parts = entry.split("|");
      const slugs = parts[0];
      let mr = null;
      // @slug = 仅 Modrinth；slug@ = 两个平台同 slug；cf@mr = 分平台；slug = 仅 CurseForge
      if (slugs.startsWith("@")) mr = slugs.slice(1);
      else if (slugs.endsWith("@")) mr = slugs.slice(0, -1);
      else if (slugs.includes("@")) mr = slugs.split("@")[1];
      if (!mr) continue;

      let name = (parts.length >= 2 ? parts[parts.length - 1] : "").trim();
      if (!name) continue;
      name = name.replace(/\*/g, "").trim();
      // "Xaero的小地图 (Xaero's Minimap) - 完整版" → "Xaero的小地图"
      const beforeParen = name.split(" (")[0].trim();
      if (beforeParen) name = beforeParen;
      if (!name) continue;
      // 同一个 slug 出现多次时，保留第一次（浏览量高的条目在前）
      if (!map.has(mr)) map.set(mr, name);
    }
  }
  return Object.fromEntries([...map.entries()].sort((a, b) => a[0].localeCompare(b[0])));
}

async function main() {
  const arg = process.argv.indexOf("--from");
  let text;
  if (arg > -1 && process.argv[arg + 1]) {
    text = fs.readFileSync(process.argv[arg + 1], "utf8");
    console.log(`读取本地 ${process.argv[arg + 1]}`);
  } else {
    console.log(`下载 ${SRC}`);
    const res = await fetch(SRC, {
      headers: { "User-Agent": "WulonsMCSS/28 (+https://github.com/wulons)" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    text = await res.text();
  }

  const map = parse(text);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(map, null, 0), "utf8");
  const bytes = fs.statSync(OUT).size;
  console.log(`写入 ${OUT}`);
  console.log(`条目 ${Object.keys(map).length} 个，${(bytes / 1024).toFixed(0)} KB`);
  for (const probe of ["sodium", "artifacts", "create", "jei", "luckperms", "fabric-api"]) {
    console.log(`  ${probe} → ${map[probe] ?? "(无中文名)"}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
