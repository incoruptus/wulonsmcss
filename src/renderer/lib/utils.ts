import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { tGlobal } from "../i18n/core";

export function cx(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function nonEmpty(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

/** 目录名安全化：去掉 Windows 非法字符 */
export function safeName(s: string, fallback = "instance"): string {
  const cleaned = s.trim().replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, "-").slice(0, 48);
  return cleaned || fallback;
}

export function formatDate(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function formatDateTime(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${formatDate(ts)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return tGlobal("utils.ago.justNow", "刚刚");
  if (min < 60) return tGlobal("utils.ago.minutes", "{n} 分钟前", { n: min });
  const hr = Math.floor(min / 60);
  if (hr < 24) return tGlobal("utils.ago.hours", "{n} 小时前", { n: hr });
  const day = Math.floor(hr / 24);
  if (day < 30) return tGlobal("utils.ago.days", "{n} 天前", { n: day });
  return formatDate(ts);
}

export function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/** 当前语言标记：大数单位这类格式没法只靠 fallback 表达，用词典里的标记判断 */
function localeTag(): "zh-CN" | "en-US" {
  return tGlobal("utils.localeTag", "zh-CN") === "en-US" ? "en-US" : "zh-CN";
}

/** 下载量这类大数：中文 12.3 万 / 1.2 亿，英文 12K / 120M，列表里比原始数字好读 */
export function formatCount(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (localeTag() === "en-US") {
    return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
  }
  if (n >= 1e8) return tGlobal("utils.count.yi", "{n} 亿", { n: (n / 1e8).toFixed(n >= 1e9 ? 0 : 1) });
  if (n >= 1e4) return tGlobal("utils.count.wan", "{n} 万", { n: (n / 1e4).toFixed(n >= 1e5 ? 0 : 1) });
  return Math.round(n).toLocaleString("zh-CN");
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, wait = 300) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const wrapped = (...args: A) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, wait);
  };
  wrapped.flush = (...args: A) => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    fn(...args);
  };
  wrapped.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  return wrapped;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function deepClone<T>(v: T): T {
  if (typeof structuredClone === "function") return structuredClone(v);
  return JSON.parse(JSON.stringify(v)) as T;
}
