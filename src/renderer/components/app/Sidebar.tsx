import { NavLink, useLocation } from "react-router-dom";
import { LayoutDashboard, Boxes, Settings as SettingsIcon, Plus, Play, PackageSearch, Link2 } from "lucide-react";
import { useConfig } from "@/stores/config";
import { useServer } from "@/stores/server";
import { cx } from "@/lib/utils";
import { Badge } from "@/components/ui/misc";
import { useState } from "react";
import { CreateInstanceDialog } from "@/components/instance/CreateInstanceDialog";

const NAV = [
  { to: "/", label: "概览", icon: LayoutDashboard, end: true },
  { to: "/instances", label: "实例", icon: Boxes, end: false },
  { to: "/library", label: "资源库", icon: PackageSearch, end: false },
  { to: "/network", label: "联机", icon: Link2, end: false },
  { to: "/settings", label: "设置", icon: SettingsIcon, end: false },
];

export function Sidebar() {
  const instances = useConfig((s) => s.cfg.instances);
  const activeId = useConfig((s) => s.cfg.activeInstanceId);
  const status = useServer((s) => s.status);
  const location = useLocation();
  const [creating, setCreating] = useState(false);

  return (
    <nav className="flex w-[220px] shrink-0 flex-col border-r border-gray-300 bg-background-100">
      <div className="flex flex-col gap-0.5 p-2">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cx(
                "flex h-8 items-center gap-2.5 rounded-md px-2.5 t-label-13 transition-colors",
                isActive ? "bg-gray-100 text-gray-1000" : "text-gray-900 hover:bg-gray-100 hover:text-gray-1000",
              )
            }
          >
            <Icon className="size-4 shrink-0" />
            {label}
          </NavLink>
        ))}
      </div>

      <div className="mt-2 flex items-center justify-between px-3.5 pb-1.5">
        <span className="t-label-12 font-medium uppercase tracking-wide text-gray-700">服务器实例</span>
        <button
          className="grid size-5 place-items-center rounded text-gray-700 transition-colors hover:bg-gray-100 hover:text-gray-1000"
          onClick={() => setCreating(true)}
          aria-label="新建实例"
          title="新建实例"
        >
          <Plus className="size-3.5" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-2 scroll-thin">
        {instances.length === 0 ? (
          <button
            onClick={() => setCreating(true)}
            className="mt-1 rounded-lg border border-dashed border-gray-400 p-3 text-left transition-colors hover:border-gray-600 hover:bg-gray-100"
          >
            <div className="t-label-13 font-medium text-gray-1000">还没有服务器</div>
            <div className="t-label-12 mt-0.5 text-gray-800">点这里新建一个，或按向导来</div>
          </button>
        ) : null}

        {instances.map((inst) => {
          const isActive = location.pathname === `/instances/${inst.id}`;
          const running = isActive && (status === "running" || status === "starting");
          return (
            <NavLink
              key={inst.id}
              to={`/instances/${inst.id}`}
              className={cx(
                "group flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors",
                isActive ? "bg-gray-100" : "hover:bg-gray-100",
              )}
            >
              <span
                className={cx(
                  "grid size-6 shrink-0 place-items-center rounded text-[10px] font-semibold",
                  running ? "bg-green-800/15 text-green-900" : "bg-gray-200 text-gray-900",
                )}
              >
                {running ? <Play className="size-3" /> : inst.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="t-label-13 block truncate text-gray-1000">{inst.name}</span>
                <span className="t-label-12 block truncate text-gray-700">
                  {inst.mcVersion} · {inst.loader}
                </span>
              </span>
              {inst.id === activeId && running ? <Badge variant="green" size="sm">在线</Badge> : null}
            </NavLink>
          );
        })}
      </div>

      <div className="border-t border-gray-300 p-2">
        <div className="t-label-12 px-1.5 text-gray-700">v27 · 重构版</div>
      </div>

      <CreateInstanceDialog open={creating} onOpenChange={setCreating} />
    </nav>
  );
}
