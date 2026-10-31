/**
 * 配置模型 v28 + 迁移
 * ------------------------------------------------------------
 * 为什么迁移放在渲染层而不是主进程：
 * 桌面版（electron/ipc/config.js）和网页版（agent 的 Rust 配置存储）各有一套落盘实现，
 * 如果迁移写在壳里，就要写两遍——而"两边行为一模一样"是不可妥协的点。
 * 所以壳只负责「读一份 JSON、写回一份 JSON」，语义（默认值/迁移/推导）全在这里。
 */

import type {
  AppConfig,
  AppMode,
  ClientLoader,
  ClientProfile,
  ContentKind,
  ConsoleViewMode,
  FrpProfile,
  Instance,
  PaletteId,
  QuickAction,
  SavedServer,
  ServerType,
  SyncConfig,
  ThemeMode,
} from "./types";
import { DEFAULT_PALETTE, isPaletteId } from "./themes";

export const CONFIG_VERSION = 28 as const;

/** 核心 → 能装什么 */
export function contentKindOf(t: ServerType): ContentKind {
  switch (t) {
    case "paper":
    case "purpur":
      return "plugin";
    case "fabric":
    case "forge":
    case "neoforge":
      return "mod";
    case "vanilla":
      return "datapack";
    default:
      return "none";
  }
}

/** 核心 → 玩家端要付的代价（房间码/邀请里要说人话） */
export function clientRequirementOf(t: ServerType): string {
  switch (t) {
    case "vanilla":
      return "原版客户端即可进";
    case "paper":
    case "purpur":
      return "原版客户端即可进（插件只在服务端跑）";
    case "fabric":
      return "需要 Fabric 客户端 + 同款 Mod";
    case "forge":
      return "需要 Forge 客户端 + 同款 Mod";
    case "neoforge":
      return "需要 NeoForge 客户端 + 同款 Mod";
  }
}

export function serverTypeLabel(t: ServerType): string {
  return { vanilla: "原版", fabric: "Fabric", forge: "Forge", neoforge: "NeoForge", paper: "Paper", purpur: "Purpur" }[t];
}

const SERVER_TYPES: ServerType[] = ["vanilla", "fabric", "forge", "neoforge", "paper", "purpur"];
const CLIENT_LOADERS: ClientLoader[] = ["vanilla", "fabric", "forge", "neoforge"];

function isServerType(v: unknown): v is ServerType {
  return typeof v === "string" && (SERVER_TYPES as string[]).includes(v);
}

/** 从实例上取出权威的核心类型（兼容 v27 只有 loady 字段的配置） */
export function serverTypeOf(inst: Pick<Partial<Instance>, "serverType" | "loader">): ServerType {
  if (isServerType(inst.serverType)) return inst.serverType;
  if (isServerType(inst.loader)) return inst.loader;
  return "fabric";
}

/** 实例是否已经装了可执行的服务端（用于"导入/待绑定"判断） */
export function isPortOpenPort(p: unknown): p is number {
  return typeof p === "number" && p > 0 && p < 65536;
}

/* --------------------------------- 默认值 -------------------------------- */

function emptyConfig(mode: AppMode): AppConfig {
  return {
    version: CONFIG_VERSION,
    mode,
    modeAsked: false,
    theme: "dark",
    palette: DEFAULT_PALETTE,
    accent: "#2f6feb",
    instances: [],
    activeInstanceId: null,
    clientProfiles: [],
    savedServers: [],
    consoleViewMode: "code",
    maxLogLines: 1000,
    animationsEnabled: true,
    setupComplete: false,
    quickActions: [],
    frpProfiles: [],
    sync: null,
    detectedJava: null,
  };
}

function asTheme(v: unknown): ThemeMode {
  return v === "light" ? "light" : v === "system" || v === "auto" ? "system" : "dark";
}

function asPalette(v: unknown): PaletteId {
  return isPaletteId(v) ? v : DEFAULT_PALETTE;
}

function asConsoleView(v: unknown): ConsoleViewMode {
  return v === "bubble" ? "bubble" : "code";
}

function asMode(v: unknown, fallback: AppMode): AppMode {
  return v === "host" || v === "player" ? v : fallback;
}

/* --------------------------------- 迁移 --------------------------------- */

/**
 * 把任意版本的配置读成 v28。
 * `changed` 表示"壳里的那份 JSON 需要写回一次"，调用方别再算一遍。
 */
export function normalizeConfig(
  raw: unknown,
  opts: { defaultMode: AppMode; now?: number },
): { cfg: AppConfig; changed: boolean } {
  const now = opts.now ?? Date.now();
  const base = emptyConfig(opts.defaultMode);
  if (!raw || typeof raw !== "object") return { cfg: base, changed: true };

  const r = raw as Record<string, unknown>;
  let changed = false;

  if (r.version !== CONFIG_VERSION) changed = true;

  const instancesRaw = Array.isArray(r.instances) ? (r.instances as Partial<Instance>[]) : [];
  const instances: Instance[] = instancesRaw
    .filter((i) => i && typeof i.dir === "string")
    .map((i) => {
      const serverType = serverTypeOf(i);
      if (i.serverType !== serverType) changed = true;
      return {
        id: String(i.id || `i-${now}-${Math.random().toString(36).slice(2, 8)}`),
        name: String(i.name || "我的服务器"),
        dir: String(i.dir),
        mcVersion: String(i.mcVersion || "26.1"),
        serverType,
        // 兼容字段：与 serverType 始终一致，不再各说各话
        loader: serverType,
        loaderVersion: i.loaderVersion,
        buildNumber: typeof i.buildNumber === "number" ? i.buildNumber : undefined,
        javaPath: String(i.javaPath || ""),
        memoryMin: Number(i.memoryMin) || 2,
        memoryMax: Number(i.memoryMax) || 4,
        jvmArgs: String(i.jvmArgs || ""),
        port: isPortOpenPort(Number(i.port)) ? Number(i.port) : 25565,
        createdAt: Number(i.createdAt) || now,
        updatedAt: Number(i.updatedAt) || now,
        lastStartedAt: typeof i.lastStartedAt === "number" ? i.lastStartedAt : undefined,
        icon: typeof i.icon === "string" ? i.icon : undefined,
        importedFrom: typeof i.importedFrom === "string" ? i.importedFrom : undefined,
        schedule: i.schedule,
      };
    });

  const activeId =
    typeof r.activeInstanceId === "string" && instances.some((i) => i.id === r.activeInstanceId)
      ? r.activeInstanceId
      : (instances[0]?.id ?? null);

  const clientProfilesRaw = Array.isArray(r.clientProfiles) ? (r.clientProfiles as Partial<ClientProfile>[]) : [];
  if (!Array.isArray(r.clientProfiles)) changed = true;
  const clientProfiles: ClientProfile[] = clientProfilesRaw
    .filter((p) => p && typeof p.dir === "string")
    .map((p) => ({
      id: String(p.id || `c-${now}-${Math.random().toString(36).slice(2, 8)}`),
      name: String(p.name || "我的客户端"),
      dir: String(p.dir),
      mcVersion: String(p.mcVersion || ""),
      loader: (CLIENT_LOADERS as string[]).includes(String(p.loader)) ? (p.loader as ClientLoader) : "vanilla",
      loaderVersion: p.loaderVersion,
      extraMods: Array.isArray(p.extraMods) ? p.extraMods.filter((m) => m && typeof m.file === "string") : [],
      updatedAt: Number(p.updatedAt) || now,
    }));

  const savedRaw = Array.isArray(r.savedServers) ? (r.savedServers as Partial<SavedServer>[]) : [];
  if (!Array.isArray(r.savedServers)) changed = true;
  const savedServers: SavedServer[] = savedRaw
    .filter((s) => s && typeof s.address === "string" && s.address.trim())
    .map((s) => ({
      id: String(s.id || `s-${now}-${Math.random().toString(36).slice(2, 8)}`),
      name: String(s.name || s.address),
      address: String(s.address),
      port: typeof s.port === "number" ? s.port : undefined,
      mcVersion: s.mcVersion,
      loader: s.loader,
      fromRoom: s.fromRoom,
      note: s.note,
      lastJoinedAt: typeof s.lastJoinedAt === "number" ? s.lastJoinedAt : undefined,
    }));

  const mode = asMode(r.mode, opts.defaultMode);
  if (r.mode !== mode) changed = true;

  const palette = asPalette(r.palette);
  if (r.palette !== palette) changed = true;

  const cfg: AppConfig = {
    ...base,
    version: CONFIG_VERSION,
    mode,
    // 只有"用户真的选过"才算问过。v27 及更早根本没有 mode 字段，
    // 迁移时写进去的 mode 是默认值，不能当成用户的选择。
    modeAsked: r.modeAsked === true,
    theme: asTheme(r.theme),
    palette,
    accent: typeof r.accent === "string" ? r.accent : base.accent,
    instances,
    activeInstanceId: activeId,
    clientProfiles,
    savedServers,
    consoleViewMode: asConsoleView(r.consoleViewMode),
    maxLogLines: Number(r.maxLogLines) || 1000,
    animationsEnabled: r.animationsEnabled !== false,
    setupComplete: Boolean(r.setupComplete) || instances.length > 0,
    quickActions: Array.isArray(r.quickActions) ? (r.quickActions as QuickAction[]) : [],
    frpProfiles: Array.isArray(r.frpProfiles) ? (r.frpProfiles as FrpProfile[]) : [],
    sync: (r.sync as SyncConfig | null) ?? null,
    remoteCatalogs: (r.remoteCatalogs as AppConfig["remoteCatalogs"]) ?? undefined,
    modrinthIndex: (r.modrinthIndex as AppConfig["modrinthIndex"]) ?? undefined,
    detectedJava: typeof r.detectedJava === "string" ? r.detectedJava : null,
    autoBackupOnStop: r.autoBackupOnStop === true,
    backupKeep: Number(r.backupKeep) || undefined,
  };

  return { cfg, changed };
}
