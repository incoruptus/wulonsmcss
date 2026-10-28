// 文件 I/O 工具
// 负责数据包文件的写入

import fs from "node:fs"
import path from "node:path"

export function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

export function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8")
}

export function writeReadme(outputDir, worlds) {
  const content = `# Wulon's MCSS Multi-World — 生成的数据包

生成时间: ${new Date().toISOString()}
生成器: wulons-mcss-mwm v26.1.0

## 包含的世界

${worlds.map(w => `- \`${w.namespace || "wulons"}:${w.name}\` — ${w.label || w.name} (${w.type || "overworld"})`).join("\n")}

## 安装

将本数据包放入 \`world/datapacks/\` 目录，然后执行 \`/reload\` 即可加载。

## 传送

\`/execute in ${worlds[0] ? `${worlds[0].namespace || "wulons"}:${worlds[0].name}` : "<namespace>:<world>"} run tp @s ~ ~ ~\`
`
  fs.writeFileSync(path.join(outputDir, "README.txt"), content, "utf-8")
}