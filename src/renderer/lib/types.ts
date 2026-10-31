/** 应用级共享类型（渲染进程 ↔ 主进程的数据形状） */

import type { RemoteCatalog, SyncConfig } from "./sync/types";

export type { SyncConfig } from "./sync/types";

/** 服务端核心：决定内容目录（plugins/mod）、启动方式、玩家要不要装东西 */
export type ServerType = "vanilla" | "fabric" | "forge" | "neoforge" | "paper" | "purpur";

/** @deprecated 旧名字，等价于 ServerType；新代码直接用 ServerType */
export type Loader = ServerType;

/** 这个核心能装什么 —— 资源库、内容页都按它分流 */
export type ContentKind = "none" | "datapack" | "plugin" | "mod";

/** 使用模式：决定首页与导航，不决定能力 */
export type AppMode = "host" | "player";

export type ClientLoader = "vanilla" | "fabric" | "forge" | "neoforge" | "quilt";

export interface ClientVersion {
  /** versions/ 下的目录名 */
  id: string;
  name: string;
  mcVersion: string;
  loader: ClientLoader;
  loaderVersion: string;
  lastUsed: number;
  mtime: number;
  path: string;
}

export interface ClientScan {
  dir: string;
  versions: ClientVersion[];
  recommended: ClientVersion | null;
  mods: ModMeta[];
}

/** 玩家自己的客户端配置（可以和服主装得不一样） */
export interface ClientProfile {
  id: string;
  name: string;
  /** 客户端目录，默认 .minecraft */
  dir: string;
  mcVersion: string;
  loader: ClientLoader;
  loaderVersion?: string;
  /** 玩家自选、服主没装的 Mod（音效包、小地图、光影前置…） */
  extraMods: { file: string; name?: string }[];
  updatedAt: number;
}

/** 玩家收藏/去过 的服务器（不做内容市场，只存"我的"） */
export interface SavedServer {
  id: string;
  name: string;
  address: string;
  port?: number;
  mcVersion?: string;
  loader?: string;
  /** 从哪个房间码来的 */
  fromRoom?: string;
  note?: string;
  lastJoinedAt?: number;
}


export interface InstanceSchedule {
  /** 每日重启时间 HH:MM（空 = 不重启） */
  restartAt?: string;
  /** 定时公告间隔（分钟） */
  broadcastEvery?: number;
  broadcastText?: string;
  /** 定时备份间隔（分钟） */
  backupEvery?: number;
}

export interface Instance {
  id: string;
  /** 显示名 */
  name: string;
  /** 服务器根目录（含 server.properties / mods / world） */
  dir: string;
  /** Minecraft 版本号，如 26.1 */
  mcVersion: string;
  /** 服务端核心。v28 起是权威字段 */
  serverType?: ServerType;
  /** @deprecated v27 字段，迁移后由 serverType 推导，仅为兼容保留 */
  loader: Loader;
  /** Fabric/NeoForge/Forge 的 loader 版本；vanilla/paper/purpur 为空 */
  loaderVersion?: string;
  /** Paper/Purpur 的构建号（build 74 之类） */
  buildNumber?: number;
  javaPath: string;
  /** 初始堆 / 最大堆（GB） */
  memoryMin: number;
  memoryMax: number;
  jvmArgs: string;
  port: number;
  createdAt: number;
  updatedAt: number;
  lastStartedAt?: number;
  icon?: string;
  /** 从其他设备同步过来、尚未绑定本机目录 */
  importedFrom?: string;
  /** 定时任务 */
  schedule?: InstanceSchedule;
}

export interface QuickAction {
  id: string;
  name: string;
  icon: string;
  /** path = 打开目录；section = 跳转页面 */
  type?: "path" | "section";
  path?: string;
  section?: string;
  page?: string;
  isDefault?: boolean;
}

export type ThemeMode = "light" | "dark" | "system";
/** 茶色主题：只换品牌色与中性色的“茶底”，不换语义 */
export type PaletteId = "green" | "white" | "red" | "yellow" | "puer";
export type ConsoleViewMode = "code" | "bubble";

export interface FrpProfile {
  id: string;
  name: string;
  /** frpc = 通用 frp 客户端；sakura = 樱花穿透启动器 */
  kind: "frpc" | "sakura";
  /** SakuraFrp 启动器路径 */
  exePath?: string;
  /** 服务端地址 host */
  serverAddr: string;
  serverPort: number;
  token: string;
  /** 本地端口，默认与实例端口一致 */
  localPort: number;
  /** 远端端口（tcp 类型） */
  remotePort: number;
  /** tcp | udp | http | https */
  type: "tcp" | "udp" | "http" | "https";
  /** 自定义域名（http/https） */
  customDomain?: string;
}

export interface AppConfig {
  /** 配置结构版本，用于迁移 */
  version: 28;
  /** 上次所在的模式 */
  mode: AppMode;
  /** 是否已经问过"你要开服还是玩" */
  modeAsked: boolean;
  theme: ThemeMode;
  /** 茶色主题（西湖龙井 / 白毫银针 / 祁门工夫 / 君山银针 / 云南普洱） */
  palette: PaletteId;
  /** 用户是否主动选过茶色；没选过时按默认白茶迁移，不把旧默认绿茶当成选择 */
  palettePicked: boolean;
  accent: string;
  instances: Instance[];
  activeInstanceId: string | null;
  /** 玩家侧：我的客户端 */
  clientProfiles: ClientProfile[];
  /** 玩家侧：我的服务器（收藏/历史） */
  savedServers: SavedServer[];
  consoleViewMode: ConsoleViewMode;
  maxLogLines: number;
  animationsEnabled: boolean;
  setupComplete: boolean;
  quickActions: QuickAction[];
  frpProfiles: FrpProfile[];
  sync: SyncConfig | null;
  /** 从云端拉下来的 Mod 清单（key = instanceId），供「与云端比对」 */
  remoteCatalogs?: Record<string, RemoteCatalog>;
  /** 通过资源库安装的 Mod 的 Modrinth 索引（key = jar 文件名），房间码用它来带 Mod */
  modrinthIndex?: Record<string, { p: string; v: string; n?: string }>;
  /** 上次自动检测到的 Java 路径 */
  detectedJava?: string | null;
  /** 停服后自动备份 */
  autoBackupOnStop?: boolean;
  /** 备份保留份数 */
  backupKeep?: number;
}

export interface DirEntry {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  mtime: number;
}

export interface ModMeta {
  /** jar 文件名 */
  file: string;
  path: string;
  id: string;
  name: string;
  version: string;
  description?: string;
  /** client / server / both —— fabric.mod.json 的 environment */
  environment: "client" | "server" | "*";
  /** 依赖的模组 id */
  depends?: string[];
  loaders?: string[];
  mcVersion?: string;
  size: number;
  mtime: number;
}

export interface WorldPack {
  name: string;
  description?: string;
  worlds: { id: string; type: string; generator: string }[];
}

export interface JavaInfo {
  path: string;
  version?: string;
  major?: number;
}

export interface PreflightIssue {
  id: string;
  level: "error" | "warn";
  title: string;
  detail: string;
  /** 可执行的修复动作 */
  fix?: string | null;
  samples?: string[];
}

export interface PreflightResult {
  ok: boolean;
  issues: PreflightIssue[];
  checkedAt?: number;
}

export interface McVersion {
  id: string;
  type: "release" | "snapshot" | "old_beta" | "old_alpha";
  releaseTime: string;
}

/* ---------------- 网络体检（net:doctor） ---------------- */

export interface NetInterface {
  name: string;
  address: string;
  family: "IPv4" | "IPv6";
  internal: boolean;
  /** 虚拟网卡（WSL / Hyper-V / VPN）；UI 会提示「这条不是给朋友用的」 */
  virtual: boolean;
}

export interface StunServerResult {
  host: string;
  ok: boolean;
  mapped?: string;
  ip?: string;
  port?: number;
  error?: string;
}

export interface NetDoctor {
  at: number;
  interfaces: NetInterface[];
  publicV4: string | null;
  publicV6: string | null;
  stun: {
    ok: boolean;
    mapped?: string;
    ip?: string;
    nat: "cone" | "symmetric" | "unknown";
    servers: StunServerResult[];
    error?: string;
  };
  upnp: {
    available: boolean;
    gateway?: string;
    externalIp?: string;
    serviceType?: string;
    error?: string;
  };
}
