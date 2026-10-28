import { create } from "zustand";
import type { AppConfig, Instance } from "@/lib/types";
import { uid } from "@/lib/utils";

const EMPTY: AppConfig = {
  version: 27,
  theme: "dark",
  accent: "#2f6feb",
  instances: [],
  activeInstanceId: null,
  consoleViewMode: "code",
  maxLogLines: 1000,
  animationsEnabled: true,
  setupComplete: false,
  quickActions: [],
  frpProfiles: [],
  sync: null,
  detectedJava: null,
};

interface ConfigState {
  loaded: boolean;
  cfg: AppConfig;
  load: () => Promise<void>;
  patch: (patch: Partial<AppConfig>) => Promise<AppConfig>;
  setActiveInstance: (id: string | null) => Promise<void>;
  addInstance: (inst: Instance) => Promise<void>;
  updateInstance: (id: string, patch: Partial<Instance>) => Promise<void>;
  removeInstance: (id: string) => Promise<void>;
}

export const useConfig = create<ConfigState>((set, get) => ({
  loaded: false,
  cfg: EMPTY,

  async load() {
    try {
      const cfg = await window.mcss.config.read();
      set({ cfg, loaded: true });
      applyAppearance(cfg);
    } catch (e) {
      set({ loaded: true });
    }
  },

  async patch(patch) {
    // 乐观更新：先改本地，再落盘
    const optimistic = { ...get().cfg, ...patch };
    set({ cfg: optimistic });
    applyAppearance(optimistic);
    try {
      const saved = await window.mcss.config.write(patch);
      set({ cfg: saved });
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
}));

/** 实例工厂：默认值集中在一处，向导与「新建」共用 */
export function makeInstance(partial: Partial<Instance> & { name: string; dir: string }): Instance {
  const now = Date.now();
  return {
    id: uid(),
    mcVersion: "26.1",
    loader: "fabric",
    javaPath: "",
    memoryMin: 2,
    memoryMax: 4,
    jvmArgs: "",
    port: 25565,
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

/** 主题 / 强调色 → <html> 上的 class 与 CSS 变量 */
export function applyAppearance(cfg: Pick<AppConfig, "theme" | "accent">) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true;
  const dark = cfg.theme === "dark" || (cfg.theme === "system" && prefersDark);
  root.classList.toggle("dark", dark);
  if (cfg.accent) {
    root.setAttribute("data-accent", "custom");
    root.style.setProperty("--ui-accent-hex", cfg.accent);
  }
}
