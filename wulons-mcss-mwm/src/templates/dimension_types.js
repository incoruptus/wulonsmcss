/**
 * 维度类型模板 —— Minecraft 26.1（data pack 101）
 * 结构与原版 data/minecraft/dimension_type/*.json 对齐：
 * - 26.x 用 attributes 承载视觉/玩法开关，旧字段 ultrawarm/natural/effects 已移除
 * - 必须带 has_ender_dragon_fight，否则整个注册表加载失败（服务器直接起不来）
 */

const OVERWORLD_ATTRIBUTES = {
  "minecraft:audio/ambient_sounds": {
    mood: {
      block_search_extent: 8,
      offset: 2.0,
      sound: "minecraft:ambient.cave",
      tick_delay: 6000
    }
  },
  "minecraft:audio/background_music": {
    creative: { max_delay: 24000, min_delay: 12000, sound: "minecraft:music.creative" },
    default: { max_delay: 24000, min_delay: 12000, sound: "minecraft:music.game" }
  },
  "minecraft:gameplay/bed_rule": {
    can_set_spawn: "always",
    can_sleep: "when_dark",
    error_message: { translate: "block.minecraft.bed.no_sleep" }
  },
  "minecraft:gameplay/nether_portal_spawns_piglin": true,
  "minecraft:gameplay/respawn_anchor_works": false,
  "minecraft:visual/ambient_light_color": "#0a0a0a",
  "minecraft:visual/cloud_color": "#ccffffff",
  "minecraft:visual/cloud_height": 192.33,
  "minecraft:visual/fog_color": "#c0d8ff",
  "minecraft:visual/sky_color": "#78a7ff"
}

const NETHER_ATTRIBUTES = {
  "minecraft:gameplay/bed_rule": { can_set_spawn: "never", can_sleep: "never", explodes: true },
  "minecraft:gameplay/can_start_raid": false,
  "minecraft:gameplay/fast_lava": true,
  "minecraft:gameplay/piglins_zombify": false,
  "minecraft:gameplay/respawn_anchor_works": true,
  "minecraft:gameplay/sky_light_level": 4.0,
  "minecraft:gameplay/snow_golem_melts": true,
  "minecraft:gameplay/water_evaporates": true,
  "minecraft:visual/ambient_light_color": "#302821",
  "minecraft:visual/default_dripstone_particle": { type: "minecraft:dripping_dripstone_lava" },
  "minecraft:visual/fog_end_distance": 96.0,
  "minecraft:visual/fog_start_distance": 10.0,
  "minecraft:visual/sky_light_color": "#7a7aff",
  "minecraft:visual/sky_light_factor": 0.0
}

const END_ATTRIBUTES = {
  "minecraft:audio/ambient_sounds": {
    mood: { block_search_extent: 8, offset: 2.0, sound: "minecraft:ambient.cave", tick_delay: 6000 }
  },
  "minecraft:audio/background_music": {
    default: { max_delay: 24000, min_delay: 6000, replace_current_music: true, sound: "minecraft:music.end" }
  },
  "minecraft:gameplay/bed_rule": { can_set_spawn: "never", can_sleep: "never", explodes: true },
  "minecraft:gameplay/respawn_anchor_works": false,
  "minecraft:visual/ambient_light_color": "#3f473f",
  "minecraft:visual/fog_color": "#181318",
  "minecraft:visual/sky_color": "#000000",
  "minecraft:visual/sky_light_color": "#ac60cd",
  "minecraft:visual/sky_light_factor": 0.0
}

const clone = (v) => JSON.parse(JSON.stringify(v))

/** 主世界风格（也用于超平坦的外层设定） */
export const OVERWORLD_TYPE = {
  ambient_light: 0.0,
  attributes: clone(OVERWORLD_ATTRIBUTES),
  coordinate_scale: 1.0,
  default_clock: "minecraft:overworld",
  has_ceiling: false,
  has_ender_dragon_fight: false,
  has_skylight: true,
  height: 384,
  infiniburn: "#minecraft:infiniburn_overworld",
  logical_height: 384,
  min_y: -64,
  monster_spawn_block_light_limit: 0,
  monster_spawn_light_level: { type: "minecraft:uniform", max_inclusive: 7, min_inclusive: 0 },
  timelines: "#minecraft:in_overworld"
}

export const NETHER_TYPE = {
  ambient_light: 0.1,
  attributes: clone(NETHER_ATTRIBUTES),
  cardinal_light: "nether",
  coordinate_scale: 8.0,
  has_ceiling: true,
  has_ender_dragon_fight: false,
  has_fixed_time: true,
  has_skylight: false,
  height: 256,
  infiniburn: "#minecraft:infiniburn_nether",
  logical_height: 128,
  min_y: 0,
  monster_spawn_block_light_limit: 15,
  monster_spawn_light_level: 7,
  skybox: "none",
  timelines: "#minecraft:in_nether"
}

export const END_TYPE = {
  ambient_light: 0.25,
  attributes: clone(END_ATTRIBUTES),
  coordinate_scale: 1.0,
  default_clock: "minecraft:the_end",
  has_ceiling: false,
  has_ender_dragon_fight: true,
  has_fixed_time: true,
  has_skylight: true,
  height: 256,
  infiniburn: "#minecraft:infiniburn_end",
  logical_height: 256,
  min_y: 0,
  monster_spawn_block_light_limit: 0,
  monster_spawn_light_level: 15,
  skybox: "end",
  timelines: "#minecraft:in_end"
}

export const SUPERFLAT_TYPE = clone(OVERWORLD_TYPE)

export const VOID_TYPE = {
  ...clone(OVERWORLD_TYPE),
  // 虚空世界：不刷怪、无云
  attributes: {
    ...clone(OVERWORLD_ATTRIBUTES),
    "minecraft:visual/cloud_height": 0.0
  },
  monster_spawn_light_level: 0
}

/** 世界类型 → 模板 */
export const TYPE_MAP = {
  overworld: { type: OVERWORLD_TYPE, preset: "minecraft:overworld", generator: "minecraft:noise" },
  nether: { type: NETHER_TYPE, preset: "minecraft:nether", generator: "minecraft:noise" },
  the_end: { type: END_TYPE, preset: "minecraft:end", generator: "minecraft:noise" },
  superflat: { type: SUPERFLAT_TYPE, preset: "minecraft:overworld", generator: "minecraft:flat" },
  void: { type: VOID_TYPE, preset: "minecraft:overworld", generator: "minecraft:flat" }
}

/** 从已有的 dimension JSON 推断该用哪个模板（修复旧数据包时用） */
export function inferTypeFromDimension(dimension) {
  const gen = dimension?.generator ?? {}
  const settings = typeof gen.settings === "string" ? gen.settings : ""
  // 原版 noise settings 的 id 是 minecraft:end（不是 the_end），两种写法都认
  if (settings === "minecraft:end" || /(^|[:_])the_end$/.test(settings) || /[:_]end$/.test(settings)) return "the_end"
  if (settings.includes("nether")) return "nether"
  if (gen.type === "minecraft:flat") {
    const layers = gen.settings?.layers
    if (Array.isArray(layers) && layers.length <= 1) return "void"
    return "superflat"
  }
  return "overworld"
}
