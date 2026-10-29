/** 同步数据形状（MCSS v1） */

import type { FrpProfile, QuickAction, ServerType } from "../types";

export const SYNC_FORMAT = "wulons-mcss-sync" as const;
export const SYNC_FORMAT_VERSION = 1 as const;

/** 参与同步的实例字段：绝对路径与 Java 路径是设备本地的，不上传 */
export interface SyncInstance {
  id: string;
  name: string;
  mcVersion: string;
  /** v28：服务端核心（同步给另一台设备，用来判断"能不能互相接手"） */
  serverType?: ServerType;
  /** @deprecated 与 serverType 同义，老设备仍读它 */
  loader: "fabric" | "vanilla";
  loaderVersion?: string;
  port: number;
  memoryMin: number;
  memoryMax: number;
  updatedAt: number;
  /** 服务端 Mod 清单（用于跨端比对，不是安装指令） */
  mods: SyncMod[];
}

export interface SyncMod {
  id: string;
  name: string;
  version: string;
  environment: "client" | "server" | "*";
  file: string;
}

export interface SyncSettings {
  consoleViewMode: "code" | "bubble";
  maxLogLines: number;
  animationsEnabled: boolean;
}

export interface SyncTombstone {
  kind: "instance";
  id: string;
  deletedAt: number;
}

export interface SyncPayloadV1 {
  format: typeof SYNC_FORMAT;
  version: typeof SYNC_FORMAT_VERSION;
  deviceId: string;
  createdAt: number;
  instances: SyncInstance[];
  tombstones: SyncTombstone[];
  settings: SyncSettings;
  quickActions: QuickAction[];
  frpProfiles: FrpProfile[];
}

export interface SyncEnvelopeV1 {
  format: typeof SYNC_FORMAT;
  version: typeof SYNC_FORMAT_VERSION;
  packId: string;
  deviceId: string;
  pairId: string;
  createdAt: number;
  crypto:
    | { alg: "none" }
    | { alg: "AES-GCM"; iv: string; kdf: "PBKDF2-SHA256"; iter: number; gz: boolean };
  payload: string;
  checksum: string;
}

/** 上次合并后的指纹基线：用于判断「谁改过」 */
export interface SyncBase {
  /** instanceId -> updatedAt */
  instances: Record<string, number>;
  /** 上一次远端内容的指纹，用来跳过无变化的推送 */
  remoteHash: string | null;
}

export interface SyncConfig {
  enabled: boolean;
  autoSync: boolean;
  /** GitHub Token（fine-grained 或 classic，仅需 gist 权限） */
  token: string;
  gistId: string | null;
  pairCode: string;
  /** 本机设备 id（首次生成，用于识别推送来源） */
  deviceId: string;
  lastPushHash?: string | null;
  lastSyncAt?: number | null;
  lastError?: string | null;
  failStreak?: number;
  backoffUntil?: number | null;
  excludeGistIds?: string[];
  base?: SyncBase | null;
  /** 本机记录的删除墓碑 */
  tombstones?: SyncTombstone[];
}

/** 云端拉下来的 Mod 清单（供「与云端比对」使用） */
export interface RemoteCatalog {
  instanceId: string;
  updatedAt: number;
  fetchedAt: number;
  mods: SyncMod[];
  deviceId: string;
}
