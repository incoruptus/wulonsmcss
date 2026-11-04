/**
 * 卡顿识别
 * ------------------------------------------------------------
 * Fabric / 原版在 tick 落后时会打：
 *   [Server thread/WARN]: Can't keep up! Is the server overloaded? Running 3034ms or 60 ticks behind
 * 这是**唯一不需要插件**就能拿到的真实卡顿信号，比 F3 里看更可靠。
 */

import { tGlobal } from "../i18n/core";

export interface LagEvent {
  /** 本地时间戳（毫秒） */
  at: number;
  /** 落后多少毫秒 */
  behindMs: number;
  /** 落后多少 tick（20 tick = 1 秒） */
  ticks?: number;
  /** 原始日志行 */
  message: string;
}

const PRIMARY = /Can't keep up!.*?Running\s+(\d+)\s*ms(?:\s+or\s+(\d+)\s+ticks?)?/i;
const FALLBACK = /Can't keep up!.*?skipping\s+(\d+)\s+tick/i;

export function parseLag(line: string): LagEvent | null {
  const m = PRIMARY.exec(line);
  if (m) {
    return {
      at: Date.now(),
      behindMs: Number(m[1]),
      ticks: m[2] ? Number(m[2]) : undefined,
      message: line.trim(),
    };
  }
  const f = FALLBACK.exec(line);
  if (f) {
    const ticks = Number(f[1]);
    return { at: Date.now(), behindMs: ticks * 50, ticks, message: line.trim() };
  }
  return null;
}

/** 把毫秒说成人话 */
export function describeLag(ms: number): string {
  if (ms < 1000) return tGlobal("lag.ms", "{n} 毫秒", { n: ms });
  return tGlobal("lag.sec", "{n} 秒", { n: (ms / 1000).toFixed(1) });
}
