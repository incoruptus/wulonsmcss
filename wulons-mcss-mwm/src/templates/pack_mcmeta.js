// pack.mcmeta 生成器
// Minecraft 26.1 数据包格式：data_major = 101（见版本 jar 里的 version.json）

export function buildPackMeta(worldName, description) {
  return {
    pack: {
      // 旧字段仍被兼容，给不认识 min/max_format 的工具用
      pack_format: 101,
      min_format: [101, 1],
      max_format: 101,
      description: description || `Wulon's MCSS Multi-World — ${worldName}`
    }
  }
}
