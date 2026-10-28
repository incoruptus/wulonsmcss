/** 应用级共享类型（渲染进程 ↔ 主进程的数据形状） */

import type { RemoteCatalog, SyncConfig } from "./sync/types";

export type { SyncConfig } from "./sync/types";

export type Loader = "fabric" | "vanilla";

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
