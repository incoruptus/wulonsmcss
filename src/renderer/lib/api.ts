import type {
  AppConfig,
  DirEntry,
  FrpProfile,
  JavaInfo,
  Instance,
  McVersion,
  ModMeta,
  PreflightResult,
  WorldPack,
} from "./types";

export interface ServerOutput {
  timestamp: string;
  /** 主进程只发 INFO/ERROR；渲染层解析后可能出现 WARN/CHAT */
  level: "INFO" | "WARN" | "ERROR" | "CHAT";
  message: string;
}

export type ServerStatus = "stopped" | "starting" | "running" | "stopping";

export interface LogEntry extends ServerOutput {
  id: number;
  stack?: string;
  /** 服务端自己的时间戳 HH:mm:ss */
  time?: string;
  /** 线程名（Server thread / Async Chat Thread …） */
  thread?: string;
  /** 聊天发言人 */
  chatFrom?: string;
  _expanded?: boolean;
}

export interface McssApi {
  window: {
    minimize: () => void;
    maximize: () => void;
    close: () => void;
    isMaximized: () => Promise<boolean>;
  };
  env: {
    appData: string;
    userName: string;
    platform: string;
  };
  app: {
    info: () => Promise<{
      version: string;
      isPackaged: boolean;
      appData: string;
      userName: string;
      platform: string;
      electron: string;
      node: string;
    }>;
    openPath: (path: string) => Promise<void>;
    openExternal: (url: string) => Promise<void>;
    pickJava: () => Promise<string | null>;
    detectJava: () => Promise<JavaInfo[]>;
    detectLaunchers: () => Promise<{ name: string; path: string }[]>;
    lanAddress: () => Promise<{ ip: string }>;
    installJava: () => Promise<{ ok: boolean; path?: string; error?: string }>;
  };
  config: {
    read: () => Promise<AppConfig>;
    write: (patch: Partial<AppConfig>) => Promise<AppConfig>;
    reset: () => Promise<void>;
  };
  dialog: {
    openFile: (filters?: { name: string; extensions: string[] }[]) => Promise<string | null>;
    openDirectory: () => Promise<string | null>;
    saveFile: (opts?: { defaultPath?: string; filters?: { name: string; extensions: string[] }[] }) => Promise<string | null>;
  };
  fs: {
    read: (path: string) => Promise<string>;
    write: (path: string, content: string) => Promise<void>;
    list: (dir: string) => Promise<DirEntry[]>;
    exists: (path: string) => Promise<boolean>;
    mkdir: (path: string) => Promise<void>;
    remove: (path: string) => Promise<void>;
    copy: (src: string, dest: string) => Promise<string>;
  };
  server: {
    preflight: (instanceId: string) => Promise<PreflightResult>;
    start: (instanceId: string) => Promise<{ ok: boolean; error?: string }>;
    stop: () => Promise<void>;
    command: (cmd: string) => Promise<boolean>;
    status: () => Promise<ServerStatus>;
    memory: () => Promise<number>;
    pid: () => Promise<number | null>;
    onOutput: (cb: (entry: ServerOutput) => void) => () => void;
    onStatus: (cb: (status: ServerStatus) => void) => () => void;
  };
  props: {
    read: (path: string) => Promise<Record<string, string>>;
    write: (path: string, props: Record<string, string>) => Promise<void>;
  };
  mods: {
    scan: (dir: string) => Promise<ModMeta[]>;
    meta: (jarPath: string) => Promise<ModMeta | null>;
    disable: (jarPath: string) => Promise<boolean>;
    enable: (jarPath: string) => Promise<boolean>;
  };
  worlds: {
    scan: (serverDir: string) => Promise<WorldPack[]>;
    create: (serverDir: string, cfg: { name: string; label?: string; type: string; description?: string; namespace?: string }) => Promise<{ success: boolean; error?: string }>;
    remove: (serverDir: string, packName: string) => Promise<{ success: boolean; error?: string }>;
    repair: (serverDir: string) => Promise<{ success: boolean; error?: string; fixed?: string[] }>;
    reload: () => Promise<{ success: boolean }>;
  };
  versions: {
    minecraft: () => Promise<McVersion[]>;
    fabricLoaders: (mc: string) => Promise<string[]>;
    install: (opts: { dir: string; mc: string; loader: "fabric" | "vanilla"; loaderVersion?: string }) => Promise<{ ok: boolean; error?: string }>;
    onProgress: (cb: (p: { stage: string; percent: number; detail?: string }) => void) => () => void;
  };
  modrinth: {
    search: (q: string, opts?: { mcVersion?: string; loader?: string; limit?: number; offset?: number; sort?: string }) => Promise<{
      hits: { id: string; slug: string; title: string; description: string; iconUrl?: string; downloads: number; author?: string; categories: string[] }[];
      total: number;
    }>;
    versions: (projectId: string, opts?: { mcVersion?: string; loader?: string }) => Promise<{
      id: string; name: string; versionNumber: string; gameVersions: string[]; loaders: string[]; datePublished: string;
      files: { url: string; filename: string; size: number; primary: boolean }[];
    }[]>;
    install: (opts: { dir: string; fileUrl: string; fileName: string }) => Promise<{ ok: boolean; path?: string; error?: string }>;
  };
  client: {
    prepare: (opts: { dir: string; mods: { p: string; v: string; n?: string }[] }) => Promise<{
      ok: boolean;
      dir?: string;
      modsDir?: string;
      error?: string;
      results?: { ok: boolean; name: string; file?: string; skipped?: boolean; error?: string }[];
    }>;
    onProgress: (cb: (p: { stage: string; percent: number; detail?: string }) => void) => () => void;
  };
  frp: {
    start: (profile: FrpProfile) => Promise<{ ok: boolean; error?: string }>;
    stop: () => Promise<void>;
    status: () => Promise<{ running: boolean; address?: string; error?: string }>;
    onLog: (cb: (line: string) => void) => () => void;
    onStatus: (cb: (s: { running: boolean; address?: string; error?: string }) => void) => () => void;
  };
}

declare global {
  interface Window {
    mcss: McssApi;
  }
}

export {};
