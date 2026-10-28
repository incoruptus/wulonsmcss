import { create } from "zustand";
import type { LogEntry, ServerStatus } from "@/lib/api";

interface ServerState {
  status: ServerStatus;
  logs: LogEntry[];
  maxLogs: number;
  tps: number;
  players: string[];
  startedAt: number | null;
  memoryUsed: number;
  memoryMax: number;
  bound: boolean;
  bind: () => void;
  setStatus: (s: ServerStatus) => void;
  addLog: (entry: Omit<LogEntry, "id">) => void;
  clear: () => void;
  setMemory: (used: number) => void;
}

let nextId = 1;

export const useServer = create<ServerState>((set, get) => ({
  status: "stopped",
  logs: [],
  maxLogs: 1000,
  tps: 20,
  players: [],
  startedAt: null,
  memoryUsed: 0,
  memoryMax: 4 * 1024 * 1024 * 1024,
  bound: false,

  /** 只绑定一次（StrictMode 双挂载也安全） */
  bind() {
    if (get().bound) return;
    set({ bound: true });

    window.mcss.server.onStatus((s) => {
      get().setStatus(s);
    });

    window.mcss.server.onOutput((entry) => {
      get().addLog(entry);
      const msg = entry.message;
      const join = msg.match(/(\w+) joined the game/);
      if (join && !get().players.includes(join[1])) set({ players: [...get().players, join[1]] });
      const left = msg.match(/(\w+) left the game/);
      if (left) set({ players: get().players.filter((p) => p !== left[1]) });
      const tps = msg.match(/Overall TPS: ([\d.]+)/);
      if (tps) set({ tps: parseFloat(tps[1]) });
    });

    window.mcss.server.status().then((s) => get().setStatus(s)).catch(() => {});
  },

  setStatus(s) {
    const prev = get().status;
    if (prev === s) return;
    set({
      status: s,
      startedAt: s === "running" ? Date.now() : s === "stopped" ? null : get().startedAt,
      players: s === "stopped" ? [] : get().players,
    });
  },

  addLog(entry) {
    const logs = get().logs;
    const next = [...logs, { ...entry, id: nextId++ }];
    set({ logs: next.length > get().maxLogs ? next.slice(-get().maxLogs) : next });
  },

  clear() {
    set({ logs: [] });
  },

  setMemory(used) {
    set({ memoryUsed: used });
  },
}));
