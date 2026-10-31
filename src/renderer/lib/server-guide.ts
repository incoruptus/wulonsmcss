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
    title: "原版联机生存",
    subtitle: "开箱即用，客户端无需额外配置",
    points: ["原版生存 / 创造", "玩家使用原版客户端即可直接进入", "后续如需添加插件可直接安装，无需重建服务器"],
  },
  {
    id: "plugins",
    title: "支持安装插件，拓展丰富玩法",
    subtitle: "传送、地皮、经济、权限",
    points: ["插件仅需安装在服务端", "玩家客户端无需安装任何额外内容", "可在内置资源库中一键搜索安装"],
  },
  {
    id: "mods",
    title: "支持安装模组，自定义游戏内容",
    subtitle: "新物品、机械、魔法、整合包",
    points: ["玩家客户端也需安装相同的模组", "推荐使用 Fabric（NeoForge 暂仅支持导入现有服务器）", "建议优先选择模组生态成熟的游戏版本"],
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
    tagline: "兼顾性能优化与原版体验的服务端核心，支持安装插件",
    client: "支持原版客户端直连，无需安装额外内容",
    caveat: "Paper 对高频红石与刷怪机制做了性能优化，若需严格保持原版特性，建议选择 Vanilla 纯原版",
    intents: ["vanilla", "plugins"],
  },
  {
    type: "purpur",
    label: "Purpur",
    tagline: "基于 Paper 扩展的服务端核心，提供丰富的玩法与特性自定义配置",
    client: "支持原版客户端直连，无需安装额外内容",
    caveat: "在 Paper 基础上提供更多底层机制微调，适合需要深度定制玩法的服主",
    intents: ["plugins"],
  },
  {
    type: "fabric",
    label: "Fabric",
    tagline: "轻量高效的模组加载器，拥有丰富的性能优化与辅助类模组",
    client: "客户端需安装 Fabric 加载器与对应模组",
    caveat: "大多数 Fabric 模组需配合前置模组 Fabric API 运行",
    intents: ["mods"],
  },
  {
    type: "neoforge",
    label: "NeoForge",
    tagline: "广泛用于大型整合包及科技、魔法类模组",
    client: "客户端需安装 NeoForge 加载器与对应模组",
    caveat: "暂不支持直接新建 NeoForge 服务端；如有现成的 NeoForge 服务器，可通过「全部服务器 → 导入现有服务器」接入管理",
    intents: ["mods"],
    supported: false,
  },
  {
    type: "forge",
    label: "Forge",
    tagline: "经典版本整合包（1.12–1.19）的主流选择",
    client: "客户端需安装 Forge 加载器与对应模组",
    caveat: "高版本模组已逐步迁移至 NeoForge 与 Fabric，且 Forge 启动耗时相对较长",
    intents: ["mods"],
  },
  {
    type: "vanilla",
    label: "Vanilla（纯原版）",
    tagline: "Mojang 官方原版服务端，保持原汁原味的游戏机制",
    client: "支持原版客户端直连，无需安装额外内容",
    caveat: "不支持安装插件或模组，综合性能低于 Paper 核心",
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
    why: "2026 年 9 月发布的最新正式版，包含最新游戏特性，部分模组与插件仍在适配中",
    intents: ["vanilla", "plugins"],
  },
  {
    id: "26.1.2",
    tag: "当前高版本中生态最稳定的选择",
    why: "26.1 系列稳定修复版，目前已适配的模组与插件数量多于 26.3",
    intents: ["plugins"],
  },
  {
    id: "1.21.11",
    tag: "生态成熟，模组与插件兼容性最佳",
    why: "旧版本号体系的最后一个大版本，模组与插件生态丰富，使用 Java 21 即可运行",
    intents: ["vanilla", "mods"],
  },
  {
    id: "1.21.1",
    tag: "兼容经典模组最多",
    why: "目前主流大型整合包集中于该版本，需使用 Java 21 运行",
    intents: ["mods"],
  },
];

export function buildVersionPresets(releases: McVersion[]): VersionPreset[] {
  const ids = new Set(releases.map((r) => r.id));
  const latest = releases.find((r) => r.type === "release")?.id;
  const defs = [...PRESET_DEFS];
  if (latest && !defs.some((d) => d.id === latest)) {
    defs.unshift({ id: latest, tag: "最新", why: "当前最新发布的正式版本", intents: ["vanilla", "plugins"] });
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
    return "玩家使用原版客户端即可进入，无需安装额外内容";
  }
  return "玩家客户端需安装相同的加载器与模组";
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
    detail: "运行 Minecraft 服务端所需的 Java 环境。若电脑已安装过 Minecraft 客户端，通常可自动检测到；如未安装，可一键下载 Java 21 或 25。",
  },
  core: {
    label: "服务端核心",
    detail: "服务端核心决定了服务器可扩展的内容类型：Paper 与 Purpur 支持安装插件，Fabric 与 Forge 支持安装模组（NeoForge 暂仅支持导入现有服务器），Vanilla 纯原版则不支持扩展。",
  },
  eula: {
    label: "Minecraft 使用条款（EULA）",
    detail: "运行服务端需同意 Mojang 最终用户许可协议（EULA），首次启动前确认一次即可。",
  },
  port: {
    label: "端口",
    detail: "玩家连接服务器所使用的端口号，默认为 25565。修改端口后，此前生成的邀请链接与房间码将失效，需重新生成。",
  },
  onlineMode: {
    label: "仅允许正版 Minecraft 账号进入服务器",
    detail: "开启后仅允许正版账号登录；关闭后允许离线客户端进入，但存在同名账号被他人冒用的风险。",
  },
  mod: {
    label: "模组（Mod）",
    detail: "用于深度扩展游戏内容，需在服务端与所有玩家客户端同时安装，且游戏版本、加载器及模组列表须保持一致。",
  },
  plugin: {
    label: "插件",
    detail: "插件仅安装在服务端，可实现领地保护、传送、经济等功能，玩家使用原版客户端即可直接进入。",
  },
  datapack: {
    label: "数据包",
    detail: "原版内置的扩展机制，存放于 world/datapacks 目录；无需客户端安装，适合轻量玩法扩展。",
  },
} as const;
