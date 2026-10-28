/**
 * 运行形态探测
 * ------------------------------------------------------------
 * electron：页面跑在 Electron 里，`window.mcss` 由 preload 注入
 * web：页面是静态站点，能力来自本机 agent（127.0.0.1）
 *
 * 两种形态共用同一套 `window.mcss` 契约 —— agent 侧实现同名的 channel，
 * 所以 UI 层完全不需要区分（只有窗口按钮这类纯桌面 UI 要按 shell 隐藏）。
 */

export type ShellKind = "electron" | "web";

const AGENT_DEFAULT = "http://127.0.0.1:28471";
const TOKEN_KEY = "mcss.agent.token";

export function detectShell(): ShellKind {
  if (typeof window !== "undefined" && (window as unknown as { mcss?: unknown }).mcss) return "electron";
  return "web";
}

/** agent 地址：允许 ?agent=http://127.0.0.1:1234 覆盖（调试多个实例时用） */
export function agentBaseUrl(): string {
  try {
    const url = new URL(window.location.href);
    const custom = url.searchParams.get("agent");
    if (custom) {
      localStorage.setItem("mcss.agent.base", custom);
      return custom.replace(/\/$/, "");
    }
    return (localStorage.getItem("mcss.agent.base") || AGENT_DEFAULT).replace(/\/$/, "");
  } catch {
    return AGENT_DEFAULT;
  }
}

/** 配对令牌：深链带进来一次，之后存在本地 */
export function agentToken(): string {
  try {
    const url = new URL(window.location.href);
    const t = url.searchParams.get("t") || url.searchParams.get("token");
    if (t) {
      localStorage.setItem(TOKEN_KEY, t);
      // 取完就从地址栏抹掉，避免被截图/复制带出去
      url.searchParams.delete("t");
      url.searchParams.delete("token");
      window.history.replaceState(null, "", url.toString());
      return t;
    }
    return localStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

export function isDesktopVisual(): boolean {
  return detectShell() === "electron";
}
