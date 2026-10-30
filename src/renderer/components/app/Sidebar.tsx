import { useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Boxes,
  Check,
  ChevronsUpDown,
  FolderInput,
  Gamepad2,
  LayoutDashboard,
  Map,
  Monitor,
  Network,
  Plus,
  Plug,
  Puzzle,
  Server,
  Settings as SettingsIcon,
  SlidersHorizontal,
  Square,
  Terminal,
  Users,
} from "lucide-react";
import { useConfig } from "@/stores/config";
import { useServer } from "@/stores/server";
import { cx } from "@/lib/utils";
import { contentKindOf, serverTypeLabel, serverTypeOf } from "@/lib/config-model";
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

const navItemClass = (isActive: boolean) =>
  cx(
    "group flex h-8 items-center gap-2.5 rounded-md px-2.5 t-label-13 transition-colors",
    isActive ? "bg-gray-100 font-medium text-gray-1000" : "text-gray-900 hover:bg-gray-100 hover:text-gray-1000",
  );

const bottomItemClass = (isActive: boolean) =>
  cx(
    "flex h-7 items-center gap-2 rounded-md px-2 t-label-13 transition-colors",
    isActive ? "bg-gray-100 text-gray-1000" : "text-gray-800 hover:bg-gray-100 hover:text-gray-1000",
  );

/** 服主模式：导航项全是「当前实例的某个面」 */
function hostNav(instanceId: string | null, contentLabel: string, contentIcon: typeof Puzzle) {
  const at = (tab: string) => (instanceId ? `/instances/${instanceId}/${tab}` : "/instances");
  return [
    { to: "/", label: "总览", icon: LayoutDashboard, end: true, count: false },
    { to: at("console"), label: "控制台", icon: Terminal, end: false, count: false },
    { to: at("config"), label: "配置", icon: SlidersHorizontal, end: false, count: false },
    { to: at("content"), label: contentLabel, icon: contentIcon, end: false, count: true },
    { to: at("worlds"), label: "世界", icon: Map, end: false, count: false },
    { to: at("players"), label: "玩家", icon: Users, end: false, count: false },
    { to: "/network", label: "联机", icon: Network, end: false, count: false },
  ];
}

/** 玩家模式：只有三件事 —— 去玩、我去过哪、我自己的客户端 */
const PLAYER_NAV = [
  { to: "/", label: "加入游戏", icon: Gamepad2, end: true, count: false },
  { to: "/mine", label: "我的服务器", icon: Server, end: false, count: false },
  { to: "/client", label: "我的客户端", icon: Monitor, end: false, count: false },
];

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
  const [version, setVersion] = useState("");
  const [contentCount, setContentCount] = useState<number | null>(null);

  // 版本号别写死：以前这里固定是 "v27"，而配置是 v28、包是 27.1.0，三处互相矛盾
  useEffect(() => {
    void window.mcss.app
      .info()
      .then((info) => setVersion(info.version))
      .catch(() => {});
  }, []);

  const host = mode === "host";
  const active = instances.find((i) => i.id === activeId) ?? instances[0] ?? null;
  const running = status === "running" || status === "starting";
  const kind = active ? contentKindOf(serverTypeOf(active)) : "mod";
  const contentLabel = kind === "plugin" ? "插件" : kind === "datapack" ? "数据包" : "模组";
  const ContentIcon = kind === "plugin" ? Plug : Puzzle;
  const nav = host ? hostNav(active?.id ?? null, contentLabel, ContentIcon) : PLAYER_NAV;

  // 内容数量：侧栏上直接能看见「装了 25 个」，不用点进去数
  useEffect(() => {
    if (!host || !active) {
      setContentCount(null);
      return;
    }
    const sub = kind === "plugin" ? "plugins" : kind === "datapack" ? "datapacks" : "mods";
    let alive = true;
    void window.mcss.fs
      .list(`${active.dir}\\${sub}`)
      .then((list) => {
        if (!alive) return;
        setContentCount(list.filter((e) => !e.isDir && /\.jar(\.disabled)?$/i.test(e.name)).length);
      })
      .catch(() => alive && setContentCount(null));
    return () => {
      alive = false;
    };
  }, [host, active?.dir, kind, location.pathname]);

  async function switchMode(next: "host" | "player") {
    if (next === mode) return;
    await setMode(next);
    // 两个模式的首页不是同一个页面：切完必须回到首页，否则会停在一个"新导航里没有的页面"
    navigate("/");
  }

  /** 切实例时停在同一层，不把人踢回首页：正在看控制台就继续看控制台 */
  async function switchInstance(id: string) {
    await setActive(id);
    const m = location.pathname.match(/^\/instances\/[^/]+\/([a-z]+)/);
    if (m) navigate(`/instances/${id}/${m[1]}${location.search}`);
    else if (/^\/instances\/[^/]+\/?$/.test(location.pathname)) navigate(`/instances/${id}`);
  }

  return (
    <nav className="flex w-[228px] shrink-0 flex-col border-r border-gray-300 bg-background-100">
      <div className="px-3 pb-1 pt-3 t-label-12 text-gray-700">{host ? "服务器" : "玩家"}</div>

      <div className="flex flex-col gap-0.5 px-2">
        {nav.map(({ to, label, icon: Icon, end, count }) => (
          <NavLink
            key={to + label}
            to={to}
            end={end}
            className={({ isActive }) => {
              // 「总览」有两处入口：/（首页仪表盘）和 /instances/:id（从全部实例点进来）
              const overviewHere =
                label === "总览" &&
                (location.pathname === "/" || location.pathname === `/instances/${active?.id ?? ""}`);
              return navItemClass(overviewHere || isActive);
            }}
          >
            <Icon className="size-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{label}</span>
            {count && contentCount !== null ? (
              <span className="t-label-12 tabular-nums text-gray-700 group-hover:text-gray-900">{contentCount}</span>
            ) : null}
          </NavLink>
        ))}
      </div>

      {!host && instances.length > 0 ? (
        <div className="mx-2 mt-2 rounded-lg bg-background-200 px-2.5 py-2">
          <div className="t-label-12 text-gray-700">你自己也有服？</div>
          <button onClick={() => void switchMode("host")} className="t-label-12 mt-0.5 text-blue-900 hover:underline">
            切到服主模式看看 →
          </button>
        </div>
      ) : null}

      <div className="min-h-0 flex-1" />

      <div className="space-y-2 border-t border-gray-300 p-2">
        {host ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-gray-100">
                <span
                  className={cx(
                    "grid size-7 shrink-0 place-items-center rounded-md text-[11px] font-semibold",
                    running ? "bg-green-800/15 text-green-900" : "bg-gray-200 text-gray-900",
                  )}
                >
                  {running ? <Square className="size-3 fill-current" /> : (active?.name.slice(0, 1).toUpperCase() ?? <Server className="size-3.5" />)}
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
            <DropdownMenuContent className="w-64" align="start">
              <DropdownMenuLabel>切换实例</DropdownMenuLabel>
              {instances.length === 0 ? <div className="px-2.5 pb-1 t-label-12 text-gray-700">还没有实例</div> : null}
              {instances.map((inst) => (
                <DropdownMenuItem
                  key={inst.id}
                  onSelect={() => {
                    void switchInstance(inst.id);
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
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}

        <div className="flex flex-col gap-0.5">
          {host ? (
            <NavLink to="/instances" end title="一个实例 = 一台服务器" className={({ isActive }) => bottomItemClass(isActive)}>
              <Boxes className="size-3.5 shrink-0" />
              全部实例
              <span className="ml-auto t-label-12 tabular-nums text-gray-700">{instances.length}</span>
            </NavLink>
          ) : null}
          <NavLink to="/settings" className={({ isActive }) => bottomItemClass(isActive)}>
            <SettingsIcon className="size-3.5 shrink-0" />
            设置
          </NavLink>
        </div>

        <div className="flex items-center justify-between px-1">
          <span className="t-label-12 text-gray-700">v{version || "—"} · 重构版</span>
          {running ? (
            <span className="inline-flex items-center gap-1 t-label-12 text-green-900">
              <Square className="size-2.5 fill-current" /> 运行中
            </span>
          ) : null}
        </div>

        <SegmentedControl<"host" | "player">
          grow
          size="sm"
          value={mode}
          onValueChange={(v) => void switchMode(v)}
          options={[
            { value: "host", label: "开服", title: "服主模式：管理这台服务器" },
            { value: "player", label: "来玩", title: "玩家模式：加入朋友的服务器" },
          ]}
        />
      </div>

      <CreateInstanceDialog open={creating} onOpenChange={setCreating} />
      <ImportInstanceDialog open={importing} onOpenChange={setImporting} />
    </nav>
  );
}
