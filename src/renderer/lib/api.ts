import type {
  AppConfig,
  ClientScan,
  DirEntry,
  FrpProfile,
  JavaInfo,
  Instance,
  McVersion,
  ModMeta,
  NetDoctor,
  PreflightResult,
  ServerType,
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
  net: {
    probe: (opts: { host: string; port: number; timeoutMs?: number }) => Promise<{ ok: boolean; ms: number }>;
    ping: (opts: { host: string; port: number; timeoutMs?: number }) => Promise<{
      ok: boolean;
      online: boolean;
      ms?: number;
      players?: { online: number; max: number };
      version?: string;
      motd?: string;
      error?: string;
    }>;
    /** 网络体检：网卡 / 公网 IP / NAT / UPnP（只探测，不改路由器） */
    doctor: () => Promise<NetDoctor>;
    /** 显式开/撤一条 TCP 端口映射（需要路由器支持 UPnP） */
    upnpMap: (opts: { port: number; lanIp?: string }) => Promise<{
      ok: boolean;
      externalIp?: string;
      externalPort?: number;
      error?: string;
    }>;
    upnpUnmap: (opts: { port: number }) => Promise<{ ok: boolean; error?: string }>;
  };
  ai: {
    exportBundle: (opts: {
      outFile: string;
      instanceId: string;
      logs: string[];
      symptom?: { title: string; detail: string };
    }) => Promise<{ ok: boolean; file?: string; size?: number; logs?: number; error?: string }>;
    docsPath: () => Promise<string>;
  };
  app: {
    info: () => Promise<{
      version: string;
      isPackaged: boolean;
      appData: string;
      /** 玩家的 .minecraft（%APPDATA%\.minecraft），与 appData 不是上下级 */
      minecraftDir?: string;
      documents: string;
      userName: string;
      platform: string;
      /** 物理内存 GB；agent 侧可能拿不到 */
      totalMemGb?: number | null;
      electron: string;
      node: string;
    }>;
    openPath: (path: string) => Promise<void>;
    openExternal: (url: string) => Promise<void>;
    pickJava: () => Promise<string | null>;
    detectJava: () => Promise<JavaInfo[]>;
    detectLaunchers: () => Promise<{ name: string; path: string }[]>;
    aiDocs: () => Promise<string>;
    lanAddress: () => Promise<{ ip: string }>;
    /** 开机自启（网页版由 agent 写 HKCU Run，桌面版由 Electron 托管） */
    autostart: () => Promise<{ enabled: boolean; command: string; exe: string }>;
    setAutostart: (enabled: boolean) => Promise<{ enabled: boolean; command: string; exe: string }>;
    /** 轻量更新：只换应用层 asar，运行时变了才提示下完整包 */
    updateCheck: () => Promise<{
      current: string;
      latest: string;
      available: boolean;
      notes: string;
      size: number;
      runtimeOk: boolean;
    }>;
    updateDownload: () => Promise<{ version: string; size: number }>;
    updateApply: () => Promise<{ ok: boolean }>;
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
    /** 本机磁盘根目录（网页版选目录时需要；桌面版也用同一份契约） */
    drives: () => Promise<{ path: string; name: string }[]>;
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
    resolveModrinth: (list: { id: string; file: string; version: string }[]) => Promise<
      { file: string; p: string; v: string; n?: string; matched?: string }[]
    >;
  };
  backup: {
    list: (serverDir: string) => Promise<{ name: string; path: string; size: number; mtime: number }[]>;
    create: (serverDir: string) => Promise<{ ok: boolean; name?: string; size?: number; error?: string }>;
    restore: (serverDir: string, name: string) => Promise<{ ok: boolean; parked?: string; error?: string }>;
    remove: (serverDir: string, name: string) => Promise<{ ok: boolean; error?: string }>;
    snapshot: (serverDir: string) => Promise<{ ok: boolean; name?: string; files?: number; bytesTotal?: number; bytesNew?: number; error?: string }>;
    snapshots: (serverDir: string) => Promise<
      { name: string; at: number; files: number; bytesTotal: number; bytesNew: number; stored: number }[]
    >;
    restoreSnapshot: (serverDir: string, name: string) => Promise<{ ok: boolean; restored?: number; parked?: string; error?: string }>;
  };
  versions: {
    minecraft: () => Promise<McVersion[]>;
    /** 每个版本的 Mod/插件数量（网络失败为 null，界面隐藏数字） */
    ecosystem: (list: string[]) => Promise<Record<string, { mods: number | null; plugins: number | null }>>;
    fabricLoaders: (mc: string) => Promise<string[]>;
    /** 某个核心在某个 MC 版本下的构建列表（Paper/Purpur 的 build、Fabric 的 loader） */
    serverBuilds: (serverType: ServerType, mc: string) => Promise<string[]>;
    /** 猜目录里装的是哪种核心（导入既有服务器） */
    detectServer: (dir: string) => Promise<{
      serverType: ServerType;
      mc?: string;
      build?: string;
      loaderVersion?: string;
      source: string;
      confidence: "high" | "medium" | "guess";
    } | null>;
    install: (opts: {
      dir: string;
      mc: string;
      /** v28：权威字段 */
      serverType?: ServerType;
      /** @deprecated 旧名字 */
      loader?: ServerType;
      loaderVersion?: string;
      /** Paper/Purpur 的构建号、Fabric 的 loader 版本、Forge/NeoForge 的 loader 版本 */
      build?: string;
      /** Forge/NeoForge 的安装器需要知道用哪个 java 去跑 */
      javaPath?: string;
    }) => Promise<{ ok: boolean; error?: string; build?: string; loaderVersion?: string }>;
    onProgress: (cb: (p: { stage: string; percent: number; detail?: string }) => void) => () => void;
  };
  modrinth: {
    search: (q: string, opts?: {
      mcVersion?: string;
      loader?: string;
      /** Modrinth 的 project_type：模组服查 mod，插件服查 plugin */
      projectType?: "mod" | "plugin" | "datapack";
      /** 分类 facet（同一个数组内是 OR） */
      categories?: string[];
      /** 环境：客户端需要 / 服务端需要 / 双端都要 */
      environment?: "client" | "server" | "both";
      limit?: number;
      offset?: number;
      sort?: string;
    }) => Promise<{
      hits: {
        id: string;
        slug: string;
        title: string;
        description: string;
        iconUrl?: string;
        downloads: number;
        follows?: number;
        author?: string;
        categories: string[];
        gameVersions?: string[];
        clientSide?: string;
        serverSide?: string;
        license?: string;
        dateModified?: string;
        projectType?: string;
      }[];
      total: number;
    }>;
    project: (projectId: string) => Promise<{
      id: string;
      slug: string;
      title: string;
      description: string;
      body: string;
      categories: string[];
      additionalCategories: string[];
      clientSide?: string;
      serverSide?: string;
      downloads: number;
      followers: number;
      iconUrl?: string;
      gallery: string[];
      published?: string;
      updated?: string;
      license?: { id?: string; name?: string; url?: string };
      sourceUrl?: string;
      issuesUrl?: string;
      wikiUrl?: string;
      discordUrl?: string;
      projectType: string;
      loaders: string[];
      gameVersions: string[];
    }>;
    /** 中文简介（MCIM 机翻）；没有译文时返回 null，界面回退英文 */
    translate: (projectId: string) => Promise<{ translated: string; original: string; at?: string; engine: string } | null>;
    versions: (projectId: string, opts?: { mcVersion?: string; loader?: string }) => Promise<{
      id: string; name: string; versionNumber: string; gameVersions: string[]; loaders: string[]; datePublished: string;
      files: { url: string; filename: string; size: number; primary: boolean }[];
    }[]>;
    install: (opts: { dir: string; fileUrl: string; fileName: string; kind?: "mod" | "plugin" }) => Promise<{ ok: boolean; path?: string; error?: string }>;
  };
  translate: {
    /** 任意文本机翻（MyMemory 为主，Google 兜底） */
    text: (text: string, opts?: { from?: string; to?: string }) => Promise<{ text: string; engine: string; truncated?: boolean; cached?: boolean }>;
  };
  client: {
    scan: (dir: string) => Promise<ClientScan | { ok: false; error: string }>;
    prepare: (opts: { dir: string; mods: { p: string; v: string; n?: string }[] }) => Promise<{
      ok: boolean;
      dir?: string;
      modsDir?: string;
      error?: string;
      results?: { ok: boolean; name: string; file?: string; skipped?: boolean; error?: string }[];
    }>;
    addServer: (opts: { mcDir: string; name: string; ip: string }) => Promise<{ ok: boolean; file?: string; count?: number; error?: string }>;
    launch: (opts: { command: string[]; cwd?: string }) => Promise<{ ok: boolean; pid?: number | null; error?: string }>;
    exportMrpack: (opts: { outFile: string; room: unknown }) => Promise<{ ok: boolean; file?: string; size?: number; mods?: number; error?: string }>;
    onProgress: (cb: (p: { stage: string; percent: number; detail?: string }) => void) => () => void;
  };
  frp: {
    start: (profile: FrpProfile) => Promise<{ ok: boolean; error?: string }>;
    stop: () => Promise<void>;
    status: () => Promise<{ running: boolean; address?: string; error?: string }>;
    onLog: (cb: (line: string) => void) => () => void;
    onStatus: (cb: (s: { running: boolean; address?: string; error?: string }) => void) => () => void;
  };
  proc: {
    /** 跑一个子进程并等它结束；只回尾部输出（Forge/NeoForge 安装器要用） */
    run: (opts: { command: string[]; cwd?: string; timeoutMs?: number }) => Promise<{
      code: number | null;
      stdoutTail: string;
      stderrTail: string;
      timedOut: boolean;
    }>;
  };
}

declare global {
  interface Window {
    mcss: McssApi;
  }
}

export {};
