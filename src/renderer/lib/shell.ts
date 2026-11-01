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
  // SSR / 单测环境没有 window：按桌面处理，避免把渲染回归测试误判成网页版
  if (typeof window === "undefined") return "electron";
  // 启动时已经判定过一次并记在 window 上：之后 window.mcss 可能被 httpClient 填充，
  // 再靠「有没有 mcss」判断就会误判成 electron
  const stored = (window as unknown as { __MCSS_SHELL?: string }).__MCSS_SHELL;
  if (stored === "web" || stored === "electron") return stored;
  if ((window as unknown as { mcss?: unknown }).mcss) return "electron";
  return "web";
}

/**
 * 只信任本机地址。
 * 之前 `?agent=http://attacker.tld` 会被存进 localStorage，随后每个请求都把
 * x-mcss-token 发给攻击者——这是配对令牌外泄链的入口。agent 永远只该在本机。
 */
export function isLoopbackUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    return host === "127.0.0.1" || host === "localhost" || host === "::1";
  } catch {
    return false;
  }
}

function normalizeAgentBase(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (!isLoopbackUrl(raw)) return null;
    return u.origin;
  } catch {
    return null;
  }
}

/** agent 地址：允许 ?agent=http://127.0.0.1:1234 覆盖（调试多个实例时用），但只接受本机 */
export function agentBaseUrl(): string {
  try {
    const url = new URL(window.location.href);
    const custom = url.searchParams.get("agent");
    if (custom) {
      const safe = normalizeAgentBase(custom);
      if (safe) {
        localStorage.setItem("mcss.agent.base", safe);
        return safe;
      }
      // 非本机地址：不保存、不使用，清掉以前可能存下的坏值
      localStorage.removeItem("mcss.agent.base");
      return AGENT_DEFAULT;
    }
    const stored = localStorage.getItem("mcss.agent.base") || "";
    const safe = stored ? normalizeAgentBase(stored) : null;
    if (stored && !safe) localStorage.removeItem("mcss.agent.base");
    return safe || AGENT_DEFAULT;
  } catch {
    return AGENT_DEFAULT;
  }
}

/** 从地址里取出配对令牌，并返回抹掉令牌后的地址（纯函数，便于单测） */
export function extractAgentToken(href: string): { token: string; cleaned: string } | null {
  try {
    const url = new URL(href);
    const hashRaw = url.hash.replace(/^#/, "");
    const hashQuery = hashRaw.includes("?") ? hashRaw.slice(hashRaw.indexOf("?") + 1) : "";
    const hashParams = new URLSearchParams(hashQuery);
    const token =
      url.searchParams.get("t") ||
      url.searchParams.get("token") ||
      hashParams.get("t") ||
      hashParams.get("token");
    if (!token) return null;
    url.searchParams.delete("t");
    url.searchParams.delete("token");
    if (hashQuery) {
      const [route, query = ""] = hashRaw.split("?");
      const rest = new URLSearchParams(query);
      rest.delete("t");
      rest.delete("token");
      const nextQuery = rest.toString();
      url.hash = `#${route}${nextQuery ? `?${nextQuery}` : ""}`;
    }
    return { token, cleaned: url.toString() };
  } catch {
    return null;
  }
}

/** 配对令牌：深链带进来一次，之后存在本地 */
export function agentToken(): string {
  try {
    const parsed = extractAgentToken(window.location.href);
    if (!parsed) return readAgentToken();
    localStorage.setItem(TOKEN_KEY, parsed.token);
    // 取完就从地址栏抹掉，避免被截图/复制带出去
    window.history.replaceState(null, "", parsed.cleaned);
    return parsed.token;
  } catch {
    return "";
  }
}

/** 配对接口拿到的新令牌写回本地；不写进 URL */
export function storeAgentToken(token: string): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* 隐私模式下 localStorage 可能不可写，忽略 */
  }
}

export function readAgentToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

export function isDesktopVisual(): boolean {
  return detectShell() === "electron";
}
