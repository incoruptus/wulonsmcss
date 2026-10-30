import { create } from "zustand";
import type { AppConfig, AppMode, ClientProfile, Instance, SavedServer, ServerType } from "@/lib/types";
import { uid } from "@/lib/utils";
import { CONFIG_VERSION, normalizeConfig } from "@/lib/config-model";
import { detectShell } from "@/lib/shell";

/** 默认模式：网页=玩家（"打开网页就能玩"），桌面=服主（开服器） */
function defaultMode(): AppMode {
  return detectShell() === "web" ? "player" : "host";
}

const EMPTY: AppConfig = normalizeConfig(null, { defaultMode: defaultMode() }).cfg;

interface ConfigState {
  loaded: boolean;
  cfg: AppConfig;
  load: () => Promise<void>;
  patch: (patch: Partial<AppConfig>) => Promise<AppConfig>;
  setMode: (mode: AppMode) => Promise<void>;
  setActiveInstance: (id: string | null) => Promise<void>;
  addInstance: (inst: Instance) => Promise<void>;
  updateInstance: (id: string, patch: Partial<Instance>) => Promise<void>;
  removeInstance: (id: string) => Promise<void>;
  saveServer: (server: Omit<SavedServer, "id"> & { id?: string }) => Promise<void>;
  removeSavedServer: (id: string) => Promise<void>;
  upsertClientProfile: (profile: Omit<ClientProfile, "updatedAt">) => Promise<void>;
}

export const useConfig = create<ConfigState>((set, get) => ({
  loaded: false,
  cfg: EMPTY,

  async load() {
    try {
      const raw = await window.mcss.config.read();
      const { cfg, changed } = normalizeConfig(raw, { defaultMode: defaultMode() });
      set({ cfg, loaded: true });
      applyAppearance(cfg);
      // 迁移过的配置立刻落盘一次，别每次启动都重算
      if (changed) {
        try {
          const saved = await window.mcss.config.write(cfg);
          set({ cfg: normalizeConfig(saved, { defaultMode: defaultMode() }).cfg });
        } catch (e) {
          /* 只读环境（安装目录）下不阻断使用 */
        }
      }
    } catch (e) {
      set({ loaded: true });
    }
  },

  async setMode(mode) {
    await get().patch({ mode, modeAsked: true });
  },

  async patch(patch) {
    // 乐观更新：先改本地，再落盘
    const optimistic = { ...get().cfg, ...patch };
    set({ cfg: optimistic });
    applyAppearance(optimistic);
    try {
      const saved = await window.mcss.config.write(patch);
      set({ cfg: normalizeConfig(saved, { defaultMode: defaultMode() }).cfg });
      return saved;
    } catch (e) {
      return optimistic;
    }
  },

  async setActiveInstance(id) {
    await get().patch({ activeInstanceId: id });
  },

  async addInstance(inst) {
    const cfg = get().cfg;
    await get().patch({
      instances: [...cfg.instances, inst],
      activeInstanceId: inst.id,
    });
  },

  async updateInstance(id, patch) {
    const cfg = get().cfg;
    const instances = cfg.instances.map((i) => (i.id === id ? { ...i, ...patch, updatedAt: Date.now() } : i));
    await get().patch({ instances });
  },

  async removeInstance(id) {
    const cfg = get().cfg;
    const instances = cfg.instances.filter((i) => i.id !== id);
    const activeInstanceId = cfg.activeInstanceId === id ? (instances[0]?.id ?? null) : cfg.activeInstanceId;
    await get().patch({ instances, activeInstanceId });
  },

  async saveServer(server) {
    const cfg = get().cfg;
    const id = server.id || `s-${uid()}`;
    const existing = cfg.savedServers.find((s) => s.id === id);
    const next: SavedServer = { ...existing, ...server, id, lastJoinedAt: Date.now() };
    const list = existing ? cfg.savedServers.map((s) => (s.id === id ? next : s)) : [...cfg.savedServers, next];
    await get().patch({ savedServers: list });
  },

  async removeSavedServer(id) {
    await get().patch({ savedServers: get().cfg.savedServers.filter((s) => s.id !== id) });
  },

  async upsertClientProfile(profile) {
    const cfg = get().cfg;
    const next: ClientProfile = { ...profile, updatedAt: Date.now() };
    const exists = cfg.clientProfiles.some((p) => p.id === next.id);
    await get().patch({
      clientProfiles: exists ? cfg.clientProfiles.map((p) => (p.id === next.id ? next : p)) : [...cfg.clientProfiles, next],
    });
  },
}));

/** 实例工厂：默认值集中在一处，向导与「新建」共用 */
export function makeInstance(partial: Partial<Instance> & { name: string; dir: string }): Instance {
  const now = Date.now();
  const serverType: ServerType = partial.serverType ?? (partial.loader as ServerType) ?? "fabric";
  return {
    id: uid(),
    mcVersion: "26.1",
    javaPath: "",
    memoryMin: 2,
    memoryMax: 4,
    jvmArgs: "",
    port: 25565,
    createdAt: now,
    updatedAt: now,
    ...partial,
    // 核心类型是权威字段，loader 只是它的别名（两种写法永远一致）
    serverType,
    loader: serverType,
  };
}

export const CONFIG_SCHEMA = CONFIG_VERSION;

/**
 * 主题 → <html> 上的 class
 * 强调色已经砍掉：工业软件不需要给每个用户配一套品牌色，
 * 配色只保留 Geist 的蓝/灰语义。旧配置里的 accent 字段继续容忍（不读）。
 */
export function applyAppearance(cfg: Pick<AppConfig, "theme">) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true;
  const dark = cfg.theme === "dark" || (cfg.theme === "system" && prefersDark);
  root.classList.toggle("dark", dark);
  // 记住上次的外观：启动时在配置读回来之前就先按它画，
  // 避免"先闪一下白 / 出错页变成亮色"这类跳变（main.tsx 会读这个值）
  try {
    localStorage.setItem("mcss.dark", dark ? "1" : "0");
  } catch (e) {}
}
