import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import "./styles/globals.css";
import { agentBaseUrl, agentToken, detectShell } from "./lib/shell";
import { createHttpClient } from "./lib/httpClient";
import { ErrorBoundary } from "./components/app/ErrorBoundary";
import { installGlobalErrorHandlers } from "./lib/report";

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
  document.documentElement.dataset.palette = localStorage.getItem("mcss.palette") || "green";
} catch {
  document.documentElement.classList.add("dark");
  document.documentElement.dataset.palette = "green";
}

// Sora：拉丁字形随包（OFL）；中文由 globals.css 里的系统黑体链兜底
import "@fontsource/sora/400.css";
import "@fontsource/sora/500.css";
import "@fontsource/sora/600.css";
import "@fontsource/sora/700.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <HashRouter>
        <App />
      </HashRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);
