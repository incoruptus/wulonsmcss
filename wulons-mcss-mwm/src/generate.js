// 维度 JSON 生成器
// 根据世界配置生成 dimension JSON

import { TYPE_MAP } from "./templates/dimension_types.js"

export function buildDimension(world) {
  const type = world.type || "overworld"
  const template = TYPE_MAP[type]
  if (!template) throw new Error(`未知的世界类型: ${type}`)

  const namespace = world.namespace || "wulons"
  const name = world.name || "custom"

  const dimension = {
    type: `${namespace}:${name}`,
    generator: buildGenerator(world, template)
  }

  return dimension
}

function buildGenerator(world, template) {
  const generator = {
    type: template.generator
  }

  if (template.generator === "minecraft:noise") {
    generator.settings = world.noise_settings || template.preset
    generator.biome_source = buildBiomeSource(world, template)
  } else if (template.generator === "minecraft:flat") {
    generator.settings = {
      layers: buildFlatLayers(world),
      biome: world.biome || world.single_biome || "minecraft:plains",
      structure_overrides: world.structures !== false ? ["minecraft:strongholds", "minecraft:villages"] : []
    }
  }

  return generator
}

function buildBiomeSource(world, template) {
  // 显式 biome 列表 → 支持模组生物群系
  if (world.biomes && world.biomes.length > 0) {
    return {
      type: "minecraft:multi_noise",
      biomes: distributeBiomes(world.biomes)
    }
  }

  // 单生物群系 → fixed 模式
  if (world.single_biome) {
    return {
      type: "minecraft:fixed",
      biome: world.single_biome
    }
  }

  // 默认：使用 preset（仅原版群系）
  return {
    type: "minecraft:multi_noise",
    preset: world.biome_preset || template.preset
  }
}

// 将 biome 列表均匀分布到 6 维噪声空间中
// 温度/湿度 为主要轴，其他参数取默认值
function distributeBiomes(biomes) {
  const count = biomes.length
  return biomes.map((biome, i) => {
    const t = count > 1 ? i / (count - 1) : 0.5
    // 沿温度轴均匀分布，湿度取互补值产生交错
    return {
      biome: biome,
      parameters: {
        temperature: round2(t),
        humidity: round2(1 - t),
        continentalness: 0.0,
        erosion: 0.0,
        depth: 0.0,
        weirdness: 0.0,
        offset: 0.0
      }
    }
  })
}

function round2(n) { return Math.round(n * 100) / 100 }

function buildFlatLayers(world) {
  if (world.layers && world.layers.length > 0) {
    return world.layers
  }
  if (world.type === "void") {
    return [{ block: "minecraft:bedrock", height: 1 }]
  }
  return [
    { block: "minecraft:bedrock", height: 1 },
    { block: "minecraft:dirt", height: 3 },
    { block: "minecraft:grass_block", height: 1 }
  ]
}