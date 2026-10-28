import { useEffect } from "react";
import { Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { TitleBar } from "@/components/app/TitleBar";
import { Sidebar } from "@/components/app/Sidebar";
import Overview from "@/pages/Overview";
import Instances from "@/pages/Instances";
import InstanceDetail from "@/pages/InstanceDetail";
import Settings from "@/pages/Settings";
import { useConfig } from "@/stores/config";
import { useServer } from "@/stores/server";

export default function App() {
  const load = useConfig((s) => s.load);
  const loaded = useConfig((s) => s.loaded);
  const bind = useServer((s) => s.bind);
  const theme = useConfig((s) => s.cfg.theme);

  useEffect(() => {
    void load();
    bind();
  }, [load, bind]);

  // 跟随系统主题
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const cfg = useConfig.getState().cfg;
      document.documentElement.classList.toggle("dark", mq.matches);
      if (cfg.accent) document.documentElement.style.setProperty("--ui-accent-hex", cfg.accent);
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
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-y-auto scroll-thin">
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/instances" element={<Instances />} />
            <Route path="/instances/:id" element={<InstanceDetail />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
      <Toaster
        position="bottom-right"
        theme={theme === "light" ? "light" : "dark"}
        toastOptions={{ style: { fontFamily: "inherit" } }}
      />
    </div>
  );
}
