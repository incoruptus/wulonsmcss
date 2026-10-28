import { create } from "zustand";
import type { LogEntry, ServerStatus } from "@/lib/api";
import { isStackTraceLine, parseLogLine } from "@/lib/mclog";

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
  addLog: (entry: { timestamp: string; level: string; message: string }) => void;
  clear: () => void;
  setMemory: (used: number) => void;
}

let nextId = 1;

export const useServer = create<ServerState>((set, get) => ({
  status: "stopped",
  logs: [],
  maxLogs: 2000,
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

    window.mcss.server.onStatus((s) => get().setStatus(s));

    window.mcss.server.onOutput((raw) => get().addLog(raw));

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

  addLog(raw) {
    const parsed = parseLogLine(raw.message);

    // 堆栈续行：挂到上一条错误上，不单独占一行
    if (isStackTraceLine(raw.message) && get().logs.length) {
      const logs = [...get().logs];
      const last = logs[logs.length - 1];
      logs[logs.length - 1] = { ...last, stack: `${last.stack ? `${last.stack}\n` : ""}${raw.message}` };
      set({ logs });
      return;
    }

    const entry: LogEntry = {
      id: nextId++,
      timestamp: parsed.time ?? raw.timestamp,
      level: parsed.level,
      message: parsed.message,
      time: parsed.time,
      thread: parsed.thread,
      chatFrom: parsed.chatFrom,
    };

    const logs = get().logs;
    const next = [...logs, entry];
    set({ logs: next.length > get().maxLogs ? next.slice(-get().maxLogs) : next });

    // 玩家列表兜底：聊天行 / 加入离开
    const msg = parsed.message;
    const players = get().players;
    if (parsed.chatFrom && !players.includes(parsed.chatFrom)) {
      set({ players: [...players, parsed.chatFrom] });
    }
    const join = msg.match(/(\w{1,32}) joined the game/);
    if (join && !get().players.includes(join[1])) set({ players: [...get().players, join[1]] });
    const left = msg.match(/(\w{1,32}) left the game/);
    if (left) set({ players: get().players.filter((p) => p !== left[1]) });

    // TPS（Paper/Spigot 的 tps 输出）
    const tps = msg.match(/(?:Overall )?TPS:?\s*([\d.]+)/i) ?? msg.match(/TPS from last [^:]+:\s*([\d.]+)/i);
    if (tps) set({ tps: parseFloat(tps[1]) });
  },

  clear() {
    set({ logs: [] });
  },

  setMemory(used) {
    set({ memoryUsed: used });
  },
}));
