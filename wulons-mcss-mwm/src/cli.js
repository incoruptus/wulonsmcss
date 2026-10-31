// MWM CLI 入口
// 用法: node src/cli.js <config.json> [output-dir]
//
// config.json 字段说明:
//   namespace     - 命名空间（默认: "wulons"）
//   worlds[]      - 世界列表
//     name        - 世界英文名（用于命名空间 ID）
//     label       - 显示名称
//     type        - overworld | nether | the_end | superflat | void
//     description - pack.mcmeta 描述
//     seed        - 可选种子
//     structures  - 是否生成结构（默认: true，仅 superflat/void）
//     // 生物群系配置（三选一）
//     biome_preset - 原版群系预设（如 "minecraft:overworld")
//     biomes[]    - 显式群系列表（支持模组群系，如 "biomesoplenty:rainforest"）
//     single_biome - 单一群系（如 "biomesoplenty:rainforest"）

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { buildPackMeta } from "./templates/pack_mcmeta.js"
import { buildDimension } from "./generate.js"
import { TYPE_MAP } from "./templates/dimension_types.js"
import { ensureDir, writeJson, writeReadme } from "./utils/io.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const configPath = process.argv[2]
const outputBase = process.argv[3] || path.join(__dirname, "..", "output")

if (!configPath) {
  console.error("用法: node src/cli.js <config.json> [output-dir]")
  console.error("示例: node src/cli.js worlds.json")
  process.exit(1)
}

// 读取配置（去掉 Windows 记事本可能写入的 BOM）
let config
try {
  config = JSON.parse(fs.readFileSync(configPath, "utf-8").replace(/^\uFEFF/, ""))
} catch (e) {
  console.error(`无法读取配置文件: ${e.message}`)
  process.exit(1)
}

const namespace = config.namespace || "wulons"
const worlds = config.worlds || []

if (worlds.length === 0) {
  console.error("配置文件中没有定义任何世界")
  process.exit(1)
}

console.log(`\n  MWM · 多世界数据包生成器  v26.1.0\n`)
console.log(`  命名空间: ${namespace}`)
console.log(`  世界数量: ${worlds.length}\n`)

// 为每个世界生成独立的数据包
for (const world of worlds) {
  const name = world.name
  const label = world.label || name
  const type = world.type || "overworld"
  const template = TYPE_MAP[type]
  const packName = `mwm-${namespace}-${name}`

  console.log(`  ── ${label} (${namespace}:${name}) [${type}]`)

  const packDir = path.join(outputBase, packName)
  const dataDir = path.join(packDir, "data", namespace)
  const dimensionDir = path.join(dataDir, "dimension")
  const dimensionTypeDir = path.join(dataDir, "dimension_type")

  ensureDir(dimensionDir)
  ensureDir(dimensionTypeDir)

  // pack.mcmeta
  writeJson(path.join(packDir, "pack.mcmeta"), buildPackMeta(label, world.description))

  // dimension_type JSON
  writeJson(path.join(dimensionTypeDir, `${name}.json`), template.type)

  // dimension JSON
  const dimension = buildDimension({ ...world, namespace })
  writeJson(path.join(dimensionDir, `${name}.json`), dimension)

  console.log(`  ✓ 已生成 → ${packName}`)
}

// 生成总数据包（包含所有世界）
const megaPackName = `mwm-${namespace}-all`
const megaPackDir = path.join(outputBase, megaPackName)
console.log(`\n  ── 生成合并包: ${megaPackName}`)

for (const world of worlds) {
  const name = world.name
  const type = world.type || "overworld"
  const template = TYPE_MAP[type]

  const megaDataDir = path.join(megaPackDir, "data", namespace)
  const megaDimDir = path.join(megaDataDir, "dimension")
  const megaTypeDir = path.join(megaDataDir, "dimension_type")

  ensureDir(megaDimDir)
  ensureDir(megaTypeDir)

  writeJson(path.join(megaTypeDir, `${name}.json`), template.type)
  writeJson(path.join(megaDimDir, `${name}.json`), buildDimension({ ...world, namespace }))
}

writeJson(path.join(megaPackDir, "pack.mcmeta"), buildPackMeta("全部世界", "Wulon's MCSS 多世界管理数据包"))
writeReadme(megaPackDir, worlds)

console.log(`  ✓ 已生成 → ${megaPackName}`)
console.log(`\n  输出目录: ${path.resolve(outputBase)}\n`)