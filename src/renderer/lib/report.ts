/**
 * 渲染层错误上报
 * ------------------------------------------------------------
 * 主进程在 `console-message` 上挂了钩子，所以只要用 console.error 打出来，
 * 就会落到 `%APPDATA%\wulons-mcss\renderer.log`。
 * 用户说"黑屏了"的时候，我们至少能拿到一行原因，而不是靠猜。
 */
export function reportError(scope: string, err: unknown): void {
  const detail = err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : String(err);
  try {
    console.error(`[mcss:${scope}] ${detail}`);
  } catch {
    /* 控制台都没了就算了 */
  }
}

/** 安装全局兜底：未捕获异常 / 未处理的 Promise 拒绝 */
export function installGlobalErrorHandlers(): void {
  if (typeof window === "undefined") return;
  window.addEventListener("error", (e) => {
    reportError("window.onerror", e.error ?? e.message);
  });
  window.addEventListener("unhandledrejection", (e) => {
    reportError("unhandledrejection", (e as PromiseRejectionEvent).reason);
  });
}
