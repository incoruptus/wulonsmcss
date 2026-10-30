import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { TitleBar } from "@/components/app/TitleBar";
import { Sidebar } from "@/components/app/Sidebar";
import { WebAgentBanner } from "@/components/app/WebAgentBanner";
import { FirstRunWizard } from "@/components/app/FirstRunWizard";
import Overview from "@/pages/Overview";
import Instances from "@/pages/Instances";
import InstanceDetail from "@/pages/InstanceDetail";
import Network from "@/pages/Network";
import Join from "@/pages/Join";
import MyServers from "@/pages/MyServers";
import Client from "@/pages/Client";
import Settings from "@/pages/Settings";
import { ModePicker } from "@/components/app/ModePicker";
import { useConfig } from "@/stores/config";
import { useServer } from "@/stores/server";
import { buildDeps, runSync } from "@/lib/sync/engine";
import { detectShell } from "@/lib/shell";

export default function App() {
  const load = useConfig((s) => s.load);
  const loaded = useConfig((s) => s.loaded);
  const patch = useConfig((s) => s.patch);
  const setupComplete = useConfig((s) => s.cfg.setupComplete);
  const mode = useConfig((s) => s.cfg.mode);
  const modeAsked = useConfig((s) => s.cfg.modeAsked);
  const bind = useServer((s) => s.bind);
  const theme = useConfig((s) => s.cfg.theme);

  useEffect(() => {
    void load();
    bind();
  }, [load, bind]);

  // 自动同步：启动时静默跑一轮（失败只记录状态，不打扰用户）
  useEffect(() => {
    if (!loaded) return;
    const sync = useConfig.getState().cfg.sync;
    if (!sync?.enabled || !sync.token || !sync.pairCode) return;
    const timer = setTimeout(() => {
      void runSync(buildDeps({ getConfig: () => useConfig.getState().cfg, patch: useConfig.getState().patch })).catch(
        () => {},
      );
    }, 1500);
    return () => clearTimeout(timer);
  }, [loaded]);

  // 跟随系统主题
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      document.documentElement.classList.toggle("dark", mq.matches);
    };
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);

  if (!loaded) {
    return (
      <div className="grid h-dvh place-items-center bg-background-200 text-gray-800">
        <div className="t-label-13">正在加载…</div>
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background-200 text-gray-1000">
      <TitleBar />
      <WebAgentBanner />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-y-auto scroll-thin">
          <Routes>
            {/* 两个模式各自的首页：服主=实例仪表盘，玩家=加入游戏 */}
            <Route path="/" element={mode === "player" ? <Join /> : <Overview />} />
            <Route path="/instances" element={<Instances />} />
            <Route path="/instances/:id" element={<InstanceDetail />} />
            <Route path="/instances/:id/:tab" element={<InstanceDetail />} />
            {/* 旧链接兜底：资源库现在是「这个实例的内容页 → 资源库」 */}
            <Route path="/library" element={<LibraryRedirect />} />
            <Route path="/network" element={<Network />} />
            <Route path="/mine" element={<MyServers />} />
            <Route path="/client" element={<Client />} />
            <Route path="/join" element={<Join />} />
            <Route path="/join/:code" element={<Join />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
      <Toaster
        position="bottom-right"
        theme={theme === "light" ? "light" : "dark"}
        toastOptions={{ style: { fontFamily: "inherit" } }}
      />
      {/* 第一次打开问一次「你是来开服的，还是来玩的」。之后随时能在侧栏切。 */}
      <ModePicker open={!modeAsked} />
      {mode === "host" ? <FirstRunWizard open={!setupComplete && modeAsked} onDone={() => patch({ setupComplete: true })} /> : null}
    </div>
  );
}

/** 老书签 / 老版本里点过的「资源库」：落到当前实例的内容页 */
function LibraryRedirect() {
  const activeId = useConfig((s) => s.cfg.activeInstanceId);
  const firstId = useConfig((s) => s.cfg.instances[0]?.id);
  const id = activeId ?? firstId;
  if (!id) return <Navigate to="/instances" replace />;
  return <Navigate to={`/instances/${id}/content?view=browse`} replace />;
}
