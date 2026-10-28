// pack.mcmeta 生成器
// Minecraft 26.1 数据包格式

export function buildPackMeta(worldName, description) {
  return {
    pack: {
      pack_format: 48,
      description: description || `Wulon's MCSS Multi-World — ${worldName}`
    }
  }
}