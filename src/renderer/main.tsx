import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { toast } from "sonner";
import App from "./App";
import "./styles/globals.css";
import { agentBaseUrl, agentToken, detectShell } from "./lib/shell";
import { createHttpClient } from "./lib/httpClient";
import { ErrorBoundary } from "./components/app/ErrorBoundary";
import { installGlobalErrorHandlers } from "./lib/report";
import { I18nProvider } from "./i18n";

const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
const BUILD_ID = env?.VITE_BUILD_ID || "";

// 双外壳：Electron 由 preload 注入 window.mcss；Web 版接本机 agent
const shell = detectShell();
if (shell === "web" && !(window as unknown as { mcss?: unknown }).mcss) {
  (window as unknown as { mcss: unknown }).mcss = createHttpClient(agentBaseUrl(), agentToken());
}
(window as unknown as { __MCSS_SHELL: string }).__MCSS_SHELL = shell;

// 任何未捕获的错误都要留痕（写进 renderer.log），不能再让用户对着黑屏猜
installGlobalErrorHandlers();

// 首帧主题：按上次记住的外观画（配置还没读回来，默认深色 + 绿茶，与窗口底色一致）
try {
  const saved = localStorage.getItem("mcss.dark");
  document.documentElement.classList.toggle("dark", saved ? saved === "1" : true);
  document.documentElement.dataset.palette = localStorage.getItem("mcss.palette") || "white";
} catch {
  document.documentElement.classList.add("dark");
  document.documentElement.dataset.palette = "white";
}

// 字体统一在 globals.css 的 @font-face 里声明：Sora VF / MiSans VF / Geist Mono VF。

/**
 * 页面开着的时候部署了新版本：提示刷新。
 * GitHub Pages 的 index.html 有缓存，光靠浏览器自己不会换掉已经跑起来的旧包。
 */
function watchForUpdates() {
  if (shell !== "web" || !BUILD_ID) return;
  let announced = false;

  const check = async () => {
    try {
      const res = await fetch(`./version.json?ts=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { buildId?: string };
      if (!data.buildId || data.buildId === BUILD_ID || announced) return;
      announced = true;
      toast.info("页面有新版本", {
        description: "刷新后使用最新版本。",
        duration: Infinity,
        action: { label: "刷新", onClick: () => window.location.reload() },
      });
    } catch {
      /* 版本文件拿不到就安静，不影响主流程 */
    }
  };

  window.setTimeout(() => void check(), 2500);
  window.setInterval(() => void check(), 60000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void check();
  });
  window.addEventListener("pageshow", (event) => {
    if ((event as PageTransitionEvent).persisted) void check();
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <I18nProvider>
      <ErrorBoundary>
        <HashRouter>
          <App />
        </HashRouter>
      </ErrorBoundary>
    </I18nProvider>
  </React.StrictMode>,
);

watchForUpdates();
