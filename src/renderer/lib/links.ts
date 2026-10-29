/**
 * 对外链接（集中一处，别散在各个组件里）
 * ------------------------------------------------------------
 * 「访问官网 → 下载助手 → 即用」是产品的头号卖点，
 * 但之前那个按钮指向 https://github.com/ —— 占位符，等于把卖点断在半路。
 *
 * 11/1 建仓库后只需要改 REPO 一处；或者构建时用 VITE_AGENT_DOWNLOAD_URL 覆盖。
 * 资源名刻意用**不带版本号**的稳定名，否则每次发版网页链接都会失效。
 */

/** TODO(11/1)：仓库建好后改成真实仓库，例如 "wulons/mcss" */
export const REPO = "";

const STABLE_ASSET = "mcss-agent-win64.zip";

export function agentDownloadUrl(): string {
  // 构建时可用 VITE_AGENT_DOWNLOAD_URL 覆盖（没装 vite/client 的类型，这里显式取）
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  const override = env?.VITE_AGENT_DOWNLOAD_URL || "";
  if (override) return override;
  if (!REPO) return "";
  return `https://github.com/${REPO}/releases/latest/download/${STABLE_ASSET}`;
}

/** 地址还没配好（页面要如实提示，而不是打开一个不相关页面） */
export function agentDownloadReady(): boolean {
  return agentDownloadUrl().length > 0;
}
