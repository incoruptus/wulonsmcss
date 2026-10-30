/**
 * Modrinth 的标签中文化
 * ------------------------------------------------------------
 * Modrinth 的 categories 是 slug（optimization / library…），
 * 直接显示英文对中文玩家没意义。这里维护一份稳定、可扩展的对照。
 */

export const CATEGORY_ZH: Record<string, string> = {
  adventure: "冒险",
  decoration: "装饰",
  economy: "经济",
  equipment: "装备",
  food: "食物",
  "game-mechanics": "机制",
  library: "支持库",
  magic: "魔法",
  management: "管理",
  minigame: "小游戏",
  mobs: "生物",
  optimization: "优化",
  social: "社交",
  storage: "存储",
  technology: "科技",
  transportation: "交通",
  utility: "实用",
  worldgen: "世界生成",
  cursed: "整活",
  combat: "战斗",
  building: "建筑",
  challenging: "硬核",
  quests: "任务",
  multiplayer: "多人",
  lightweight: "轻量",
  "kitchen-sink": "大杂烩",
  fantasy: "幻想",
  realistic: "写实",
  themed: "主题",
  tweaks: "微调",
  vanilla: "原版",
  "vanilla-like": "原版风",
};

/** 筛选栏里展示的顺序：先常用，再长尾 */
export const CATEGORY_ORDER = [
  "optimization",
  "library",
  "utility",
  "adventure",
  "equipment",
  "technology",
  "magic",
  "worldgen",
  "decoration",
  "storage",
  "transportation",
  "food",
  "mobs",
  "game-mechanics",
  "management",
  "minigame",
  "economy",
  "social",
  "cursed",
];

export const LOADER_ZH: Record<string, string> = {
  fabric: "Fabric",
  forge: "Forge",
  neoforge: "NeoForge",
  quilt: "Quilt",
  paper: "Paper",
  purpur: "Purpur",
  spigot: "Spigot",
  bukkit: "Bukkit",
  folia: "Folia",
  sponge: "Sponge",
  velocity: "Velocity",
  bungeecord: "BungeeCord",
  waterfall: "Waterfall",
  datapack: "数据包",
  minecraft: "原版",
};

export function categoryLabel(slug: string): string {
  return CATEGORY_ZH[slug] ?? slug;
}

export function loaderLabel(slug: string): string {
  return LOADER_ZH[slug] ?? slug;
}

/** 环境标签：server_side / client_side 都是 required|optional|unsupported */
export function environmentOf(hit: { clientSide?: string; serverSide?: string }): "client" | "server" | "both" | "unknown" {
  const client = hit.clientSide && hit.clientSide !== "unsupported";
  const server = hit.serverSide && hit.serverSide !== "unsupported";
  if (client && server) return "both";
  if (client) return "client";
  if (server) return "server";
  return "unknown";
}

export const ENVIRONMENT_LABEL: Record<string, string> = {
  both: "双端",
  client: "客户端",
  server: "服务端",
  unknown: "未知",
};

export const SORT_OPTIONS = [
  { value: "relevance", label: "相关度" },
  { value: "downloads", label: "下载量" },
  { value: "follows", label: "关注数" },
  { value: "newest", label: "最新发布" },
  { value: "updated", label: "最近更新" },
];

export const ENVIRONMENT_OPTIONS = [
  { value: "any", label: "不限" },
  { value: "both", label: "双端" },
  { value: "client", label: "客户端" },
  { value: "server", label: "服务端" },
] as const;
