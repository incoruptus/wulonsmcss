// 维度类型模板 — 用于自定义维度的类型定义
// 每个维度需要一个 dimension_type 和一个 dimension JSON

export const OVERWORLD_TYPE = {
  ultrawarm: false,
  natural: true,
  coordinate_scale: 1.0,
  has_skylight: true,
  has_ceiling: false,
  ambient_light: 0.0,
  fixed_time: false,
  monster_spawn_light_level: 7,
  monster_spawn_block_light_limit: 0,
  piglin_safe: false,
  bed_works: true,
  respawn_anchor_works: false,
  has_raids: true,
  logical_height: 384,
  min_y: -64,
  height: 384,
  infiniburn: "#minecraft:infiniburn_overworld",
  effects: "minecraft:overworld"
}

export const NETHER_TYPE = {
  ultrawarm: true,
  natural: false,
  coordinate_scale: 8.0,
  has_skylight: false,
  has_ceiling: true,
  ambient_light: 0.1,
  fixed_time: 18000,
  monster_spawn_light_level: 7,
  monster_spawn_block_light_limit: 0,
  piglin_safe: true,
  bed_works: false,
  respawn_anchor_works: true,
  has_raids: false,
  logical_height: 128,
  min_y: 0,
  height: 256,
  infiniburn: "#minecraft:infiniburn_nether",
  effects: "minecraft:the_nether"
}

export const END_TYPE = {
  ultrawarm: false,
  natural: false,
  coordinate_scale: 1.0,
  has_skylight: false,
  has_ceiling: false,
  ambient_light: 0.0,
  fixed_time: 6000,
  monster_spawn_light_level: 7,
  monster_spawn_block_light_limit: 0,
  piglin_safe: false,
  bed_works: false,
  respawn_anchor_works: false,
  has_raids: false,
  logical_height: 256,
  min_y: 0,
  height: 256,
  infiniburn: "#minecraft:infiniburn_end",
  effects: "minecraft:the_end"
}

export const SUPERFLAT_TYPE = {
  ultrawarm: false,
  natural: true,
  coordinate_scale: 1.0,
  has_skylight: true,
  has_ceiling: false,
  ambient_light: 0.0,
  fixed_time: false,
  monster_spawn_light_level: 7,
  monster_spawn_block_light_limit: 0,
  piglin_safe: false,
  bed_works: true,
  respawn_anchor_works: false,
  has_raids: true,
  logical_height: 384,
  min_y: -64,
  height: 384,
  infiniburn: "#minecraft:infiniburn_overworld",
  effects: "minecraft:overworld"
}

export const VOID_TYPE = {
  ultrawarm: false,
  natural: false,
  coordinate_scale: 1.0,
  has_skylight: true,
  has_ceiling: false,
  ambient_light: 0.0,
  fixed_time: 6000,
  monster_spawn_light_level: 0,
  monster_spawn_block_light_limit: 0,
  piglin_safe: false,
  bed_works: false,
  respawn_anchor_works: false,
  has_raids: false,
  logical_height: 256,
  min_y: 0,
  height: 256,
  infiniburn: "#minecraft:infiniburn_overworld",
  effects: "minecraft:overworld"
}

// 世界类型 → 维度类型模板映射
export const TYPE_MAP = {
  overworld: { type: OVERWORLD_TYPE, preset: "minecraft:overworld", generator: "minecraft:noise" },
  nether: { type: NETHER_TYPE, preset: "minecraft:nether", generator: "minecraft:noise" },
  the_end: { type: END_TYPE, preset: "minecraft:end", generator: "minecraft:noise" },
  superflat: { type: SUPERFLAT_TYPE, preset: "minecraft:overworld", generator: "minecraft:flat" },
  void: { type: VOID_TYPE, preset: "minecraft:overworld", generator: "minecraft:flat" }
}