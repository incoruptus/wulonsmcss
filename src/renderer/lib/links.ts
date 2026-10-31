/**
 * 对外链接（集中一处，别散在各个组件里）
 * ------------------------------------------------------------
 * 「访问官网 → 下载助手 → 即用」是产品的头号卖点，
 * 但之前那个按钮指向 https://github.com/ —— 占位符，等于把卖点断在半路。
 *
 * 11/1 建仓库后只需要改 REPO 一处；或者构建时用 VITE_AGENT_DOWNLOAD_URL 覆盖。
 * 资源名刻意用**不带版本号**的稳定名，否则每次发版网页链接都会失效。
 */

const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;

/** 仓库建好后填这里，或构建时用 VITE_REPO 覆盖；例如 "wulons/mcss" */
export const REPO = env?.VITE_REPO || "";

/** 作者主页；建好后填这里，或构建时用 VITE_AUTHOR_URL 覆盖 */
export const AUTHOR_URL = env?.VITE_AUTHOR_URL || "";

export function projectUrl(): string {
  return REPO ? `https://github.com/${REPO}` : "";
}

export function authorUrl(): string {
  return AUTHOR_URL;
}

const STABLE_ASSET = "mcss-agent-setup.exe";

export function agentDownloadUrl(): string {
  // 构建时可用 VITE_AGENT_DOWNLOAD_URL 覆盖
  const override = env?.VITE_AGENT_DOWNLOAD_URL || "";
  if (override) return override;
  if (!REPO) return "";
  return `https://github.com/${REPO}/releases/latest/download/${STABLE_ASSET}`;
}

/** 地址还没配好（页面要如实提示，而不是打开一个不相关页面） */
export function agentDownloadReady(): boolean {
  return agentDownloadUrl().length > 0;
}

/**
 * 当前网页版的公开地址（用来拼「一键进服」链接）。
 * - 网页版：就是浏览器地址栏的 origin + 部署子路径（Hash 路由下可直接用）
 * - 桌面版：没有网页地址，返回 null；这时不要伪造一条 404 链接，改发房间码
 * - 构建时可用 VITE_PUBLIC_URL 覆盖（例如 https://mcss.example.com）
 */
export function publicWebOrigin(): string | null {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  const override = env?.VITE_PUBLIC_URL || "";
  if (override) return override.replace(/\/+$/, "");
  if (typeof window === "undefined") return null;
  if (!/^https?:$/.test(window.location.protocol)) return null;
  const path = window.location.pathname.replace(/index\.html$/i, "").replace(/\/+$/, "");
  return `${window.location.origin}${path}`;
}
