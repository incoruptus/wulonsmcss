import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import "./styles/globals.css";
import { agentBaseUrl, agentToken, detectShell } from "./lib/shell";
import { createHttpClient } from "./lib/httpClient";

// 双外壳：Electron 由 preload 注入 window.mcss；Web 版接本机 agent
const shell = detectShell();
if (shell === "web" && !(window as unknown as { mcss?: unknown }).mcss) {
  (window as unknown as { mcss: unknown }).mcss = createHttpClient(agentBaseUrl(), agentToken());
}
(window as unknown as { __MCSS_SHELL: string }).__MCSS_SHELL = shell;

// Sora：拉丁字形随包（OFL）；中文由 globals.css 里的系统黑体链兜底
import "@fontsource/sora/400.css";
import "@fontsource/sora/500.css";
import "@fontsource/sora/600.css";
import "@fontsource/sora/700.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>,
);
