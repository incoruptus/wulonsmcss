/** 应用级共享类型（渲染进程 ↔ 主进程的数据形状） */

export type Loader = "fabric" | "vanilla";

export interface Instance {
  id: string;
  /** 显示名 */
  name: string;
  /** 服务器根目录（含 server.properties / mods / world） */
  dir: string;
  /** Minecraft 版本号，如 26.1 */
  mcVersion: string;
  loader: Loader;
  /** Fabric Loader 版本；vanilla 为空 */
  loaderVersion?: string;
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
export type ConsoleViewMode = "code" | "bubble";

export interface FrpProfile {
  id: string;
  name: string;
  /** 服务端地址 host:port */
  serverAddr: string;
  serverPort: number;
  token: string;
  /** 本地端口，默认与实例端口一致 */
  localPort: number;
  /** 远端端口（frp tcp 类型） */
  remotePort: number;
  /** tcp | udp | http | https */
  type: "tcp" | "udp" | "http" | "https";
  /** 自定义域名（http/https） */
  customDomain?: string;
}

export interface SyncConfig {
  enabled: boolean;
  token: string;
  gistId: string | null;
  pairCode: string;
  lastPushHash?: string | null;
  failStreak?: number;
  backoffUntil?: number | null;
  excludeGistIds?: string[];
  autoSync?: boolean;
  lastSyncAt?: number | null;
}

export interface AppConfig {
  /** 配置结构版本，用于迁移 */
  version: 27;
  theme: ThemeMode;
  accent: string;
  instances: Instance[];
  activeInstanceId: string | null;
  consoleViewMode: ConsoleViewMode;
  maxLogLines: number;
  animationsEnabled: boolean;
  setupComplete: boolean;
  quickActions: QuickAction[];
  frpProfiles: FrpProfile[];
  sync: SyncConfig | null;
  /** 上次自动检测到的 Java 路径 */
  detectedJava?: string | null;
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

export interface McVersion {
  id: string;
  type: "release" | "snapshot" | "old_beta" | "old_alpha";
  releaseTime: string;
}
