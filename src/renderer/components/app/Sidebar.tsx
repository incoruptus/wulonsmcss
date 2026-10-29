import { useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Boxes,
  Check,
  ChevronsUpDown,
  FolderInput,
  Gamepad2,
  Globe2,
  LayoutDashboard,
  Link2,
  PackageSearch,
  Play,
  Plus,
  Server,
  Settings as SettingsIcon,
  Square,
} from "lucide-react";
import { useConfig } from "@/stores/config";
import { useServer } from "@/stores/server";
import { cx } from "@/lib/utils";
import { serverTypeLabel, serverTypeOf } from "@/lib/config-model";
import { SegmentedControl } from "@/components/ui/misc";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/overlay";
import { CreateInstanceDialog } from "@/components/instance/CreateInstanceDialog";
import { ImportInstanceDialog } from "@/components/instance/ImportInstanceDialog";

/** 服主模式：导航全是「当前实例的某个面」+ 三个全局入口 */
const HOST_NAV = [
  { to: "/", label: "总览", icon: LayoutDashboard, end: true },
  { to: "/instances", label: "全部实例", icon: Boxes, end: false },
  { to: "/library", label: "资源库", icon: PackageSearch, end: false },
  { to: "/network", label: "联机", icon: Link2, end: false },
  { to: "/settings", label: "设置", icon: SettingsIcon, end: false },
];

/** 玩家模式：只有四件事 —— 去玩、我去过哪、我自己的客户端、设置 */
const PLAYER_NAV = [
  { to: "/", label: "加入游戏", icon: Gamepad2, end: true },
  { to: "/mine", label: "我的服务器", icon: Globe2, end: false },
  { to: "/client", label: "我的客户端", icon: Server, end: false },
  { to: "/settings", label: "设置", icon: SettingsIcon, end: false },
];

const navItemClass = (isActive: boolean) =>
  cx(
    "flex h-8 items-center gap-2.5 rounded-md px-2.5 t-label-13 transition-colors",
    isActive ? "bg-gray-100 text-gray-1000" : "text-gray-900 hover:bg-gray-100 hover:text-gray-1000",
  );

export function Sidebar() {
  const instances = useConfig((s) => s.cfg.instances);
  const activeId = useConfig((s) => s.cfg.activeInstanceId);
  const setActive = useConfig((s) => s.setActiveInstance);
  const mode = useConfig((s) => s.cfg.mode);
  const setMode = useConfig((s) => s.setMode);
  const status = useServer((s) => s.status);
  const navigate = useNavigate();
  const location = useLocation();
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);

  const host = mode === "host";
  const nav = host ? HOST_NAV : PLAYER_NAV;
  const active = instances.find((i) => i.id === activeId) ?? instances[0] ?? null;
  const running = status === "running" || status === "starting";

  async function switchMode(next: "host" | "player") {
    if (next === mode) return;
    await setMode(next);
    // 两个模式的首页不是同一个页面：切完必须回到首页，否则会停在一个"新导航里没有的页面"
    navigate("/");
  }

  return (
    <nav className="flex w-[220px] shrink-0 flex-col border-r border-gray-300 bg-background-100">
      {host ? (
        <div className="p-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors hover:bg-gray-100">
                <span
                  className={cx(
                    "grid size-7 shrink-0 place-items-center rounded-md text-[11px] font-semibold",
                    running ? "bg-green-800/15 text-green-900" : "bg-gray-200 text-gray-900",
                  )}
                >
                  {running ? <Play className="size-3.5" /> : (active?.name.slice(0, 1).toUpperCase() ?? <Server className="size-3.5" />)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="t-label-13 block truncate font-medium text-gray-1000">{active?.name ?? "还没有服务器"}</span>
                  <span className="t-label-12 block truncate text-gray-700">
                    {active ? `${active.mcVersion} · ${serverTypeLabel(serverTypeOf(active))}` : "点这里新建一个"}
                  </span>
                </span>
                <ChevronsUpDown className="size-3.5 shrink-0 text-gray-700" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56">
              <DropdownMenuLabel>切换实例</DropdownMenuLabel>
              {instances.map((inst) => (
                <DropdownMenuItem
                  key={inst.id}
                  onSelect={() => {
                    void setActive(inst.id);
                    navigate(`/instances/${inst.id}`);
                  }}
                >
                  <span className="min-w-0 flex-1 truncate">{inst.name}</span>
                  <span className="t-label-12 shrink-0 text-gray-700">
                    {inst.mcVersion} · {serverTypeLabel(serverTypeOf(inst))}
                  </span>
                  {inst.id === active?.id ? <Check className="size-3.5 shrink-0" /> : null}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setCreating(true)}>
                <Plus className="size-3.5" /> 新建服务器
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setImporting(true)}>
                <FolderInput className="size-3.5" /> 导入现有服务器
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => navigate("/instances")}>
                <Boxes className="size-3.5" /> 全部实例
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : null}

      <div className="flex flex-col gap-0.5 px-2 pb-2">
        {nav.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => navItemClass(isActive)}>
            <Icon className="size-4 shrink-0" />
            {label}
          </NavLink>
        ))}
      </div>

      {!host && instances.length > 0 ? (
        <div className="mx-2 mt-1 rounded-lg bg-background-200 px-2.5 py-2">
          <div className="t-label-12 text-gray-700">你自己也有服？</div>
          <button onClick={() => void switchMode("host")} className="t-label-12 mt-0.5 text-blue-900 hover:underline">
            切到服主模式看看 →
          </button>
        </div>
      ) : null}

      <div className="min-h-0 flex-1" />

      <div className="space-y-2 border-t border-gray-300 p-2">
        <SegmentedControl<"host" | "player">
          grow
          size="sm"
          value={mode}
          onValueChange={(v) => void switchMode(v)}
          options={[
            { value: "host", label: "开服", title: "服主模式：管理我这台服务器" },
            { value: "player", label: "来玩", title: "玩家模式：加入朋友的服务器" },
          ]}
        />
        <div className="flex items-center justify-between px-1">
          <span className="t-label-12 text-gray-700">v27 · 重构版</span>
          {running ? (
            <span className="inline-flex items-center gap-1 t-label-12 text-green-900">
              <Square className="size-2.5 fill-current" /> 运行中
            </span>
          ) : null}
        </div>
      </div>

      <CreateInstanceDialog open={creating} onOpenChange={setCreating} />
      <ImportInstanceDialog open={importing} onOpenChange={setImporting} />
    </nav>
  );
}
