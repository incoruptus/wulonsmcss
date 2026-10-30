import type { McVersion, ServerType } from "./types";
import { serverTypeLabel } from "./config-model";

/**
 * 开服向导的「人话层」
 * ------------------------------------------------------------
 * 用户不需要先懂 Paper/Fabric/Forge，只需要回答「你想怎么玩」。
 * 这里把意图、版本、核心、客户端代价翻译成一句话，UI 只负责展示。
 */

export type ServerIntent = "vanilla" | "plugins" | "mods";

export interface IntentOption {
  id: ServerIntent;
  title: string;
  subtitle: string;
  points: string[];
}

export const INTENTS: IntentOption[] = [
  {
    id: "vanilla",
    title: "和朋友玩原版",
    subtitle: "最省事：不用装任何东西",
    points: ["原版生存 / 创造", "朋友用原版客户端就能进", "以后想加插件也不用重开"],
  },
  {
    id: "plugins",
    title: "加插件，玩法更多",
    subtitle: "传送、地皮、经济、权限",
    points: ["插件装在服务器上", "朋友仍然什么都不用装", "资源库里点一下就能装"],
  },
  {
    id: "mods",
    title: "加模组，改游戏内容",
    subtitle: "新物品、机械、魔法、整合包",
    points: ["朋友也要装同样的模组", "需要 Fabric（NeoForge 暂不支持新建）", "版本要选模组多的"],
  },
];

export interface CoreMeta {
  type: ServerType;
  label: string;
  /** 一句话定位，避免“水桶系”这种黑话 */
  tagline: string;
  /** 朋友需要准备什么 */
  client: string;
  /** 代价/注意 */
  caveat: string;
  /** 适合的意图 */
  intents: ServerIntent[];
  /** 是否允许新建；未标记 = 支持。已有实例仍可导入/启动 */
  supported?: boolean;
}

export const CORES: CoreMeta[] = [
  {
    type: "paper",
    label: "Paper",
    tagline: "优化过的原版服务端，能装插件，性能更好",
    client: "原版客户端，不用装东西",
    caveat: "红石/刷怪等细节和纯原版略有差异；介意就选 Vanilla",
    intents: ["vanilla", "plugins"],
  },
  {
    type: "purpur",
    label: "Purpur",
    tagline: "Paper 的增强版，多出几百个玩法开关",
    client: "原版客户端，不用装东西",
    caveat: "同样会改一些原版细节；适合想折腾玩法的服主",
    intents: ["plugins"],
  },
  {
    type: "fabric",
    label: "Fabric",
    tagline: "轻量模组平台，优化模组和小地图多",
    client: "要装 Fabric + 同样的模组",
    caveat: "多数模组还需要先装 Fabric API",
    intents: ["mods"],
  },
  {
    type: "neoforge",
    label: "NeoForge",
    tagline: "大型整合包/科技魔法模组常用",
    client: "要装 NeoForge + 同样的模组",
    caveat: "新建暂不支持（安装器还不稳定）；已有 NeoForge 服务器可从「全部实例 → 导入」继续管理",
    intents: ["mods"],
    supported: false,
  },
  {
    type: "forge",
    label: "Forge",
    tagline: "老整合包（1.12–1.19）常用",
    client: "要装 Forge + 同样的模组",
    caveat: "新版本不建议从 Forge 起步；启动也偏慢",
    intents: ["mods"],
  },
  {
    type: "vanilla",
    label: "Vanilla（纯原版）",
    tagline: "Mojang 官方服务端，一点不改",
    client: "原版客户端，不用装东西",
    caveat: "不能装插件或模组；性能不如 Paper",
    intents: ["vanilla"],
  },
];

export function coreMeta(type: string): CoreMeta | undefined {
  return CORES.find((c) => c.type === type);
}

export interface VersionPreset {
  id: string;
  tag: string;
  why: string;
  intents: ServerIntent[];
}

const PRESET_DEFS: Omit<VersionPreset, "java">[] = [
  {
    id: "26.3",
    tag: "最新",
    why: "2026 年 9 月的最新正式版；新内容多，Mod/插件还在跟进",
    intents: ["vanilla", "plugins"],
  },
  {
    id: "26.1.2",
    tag: "新版本里最稳",
    why: "26.1 系列的热修版，Mod/插件比 26.3 多",
    intents: ["plugins"],
  },
  {
    id: "1.21.11",
    tag: "兼容性最好",
    why: "最后一个旧编号版本；Mod 和插件都多，只要 Java 21",
    intents: ["vanilla", "mods"],
  },
  {
    id: "1.21.1",
    tag: "老 Mod 最多",
    why: "大型整合包大多还停在这里；Java 21",
    intents: ["mods"],
  },
];

export function buildVersionPresets(releases: McVersion[]): VersionPreset[] {
  const ids = new Set(releases.map((r) => r.id));
  const latest = releases.find((r) => r.type === "release")?.id;
  const defs = [...PRESET_DEFS];
  if (latest && !defs.some((d) => d.id === latest)) {
    defs.unshift({ id: latest, tag: "最新", why: "当前最新的正式版", intents: ["vanilla", "plugins"] });
  }
  return defs.filter((d) => ids.has(d.id));
}

/** 推荐哪个版本：原版/插件选最新，模组选 1.21.11 */
export function recommendedVersion(intent: ServerIntent, presets: VersionPreset[]): string {
  if (!presets.length) return "";
  if (intent === "mods") {
    return presets.find((p) => p.id === "1.21.11")?.id ?? presets.find((p) => p.id === "1.21.1")?.id ?? presets[0].id;
  }
  return presets.find((p) => p.tag === "最新")?.id ?? presets[0].id;
}

/** 意图 + 版本 → 默认核心 */
export function recommendedCore(intent: ServerIntent, mcVersion: string): ServerType {
  if (intent === "mods") return "fabric";
  return "paper";
}

export function clientRequirementText(type: ServerType): string {
  if (type === "paper" || type === "purpur" || type === "vanilla") {
    return "朋友用原版客户端就能进，不用装东西";
  }
  return "朋友也要装同样的模组平台和模组";
}

export function serverLabel(type: ServerType): string {
  return type === "vanilla" ? "原版" : serverTypeLabel(type);
}

/**
 * 给 ConfigTab / 联机 / EULA 这类技术页面复用的人话词典。
 * 只解释「这个词是什么、改了会怎样」，不写教程。
 */
export const TERMS = {
  java: {
    label: "Java",
    detail: "运行 Minecraft 服务端的引擎。装过 Minecraft 的电脑通常已经有；没有就装 Java 21/25。",
  },
  core: {
    label: "服务端核心",
    detail: "决定这个服能装插件还是模组。Paper 能装插件；Fabric/Forge 能装模组；NeoForge 暂只支持导入已有服务器；Vanilla 两个都不能。",
  },
  eula: {
    label: "Minecraft 使用条款（EULA）",
    detail: "Mojang 对服务端的许可，免费，同意一次即可。不同意服务器不会启动。",
  },
  port: {
    label: "端口",
    detail: "朋友连进来用的门牌号，默认 25565。改了之后旧邀请会失效，要重新发。",
  },
  onlineMode: {
    label: "只允许正版账号进入",
    detail: "打开时，没买 Minecraft 的客户端会被拒绝；关闭后任何人都能进，用户名也可能被冒用。",
  },
  mod: {
    label: "模组（Mod）",
    detail: "改游戏内容的插件式扩展，装在服务端和每个玩家的客户端里；版本/加载器必须一致。",
  },
  plugin: {
    label: "插件",
    detail: "只装在服务端，给游戏加命令、地皮、经济等；玩家客户端不用装任何东西。",
  },
  datapack: {
    label: "数据包",
    detail: "原版自带的内容扩展，放在 world/datapacks；不改变客户端，但功能比模组少。",
  },
} as const;
