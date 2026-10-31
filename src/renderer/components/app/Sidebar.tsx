import { useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Boxes, Check, ChevronsUpDown, FolderInput, Gamepad2, LayoutDashboard, Map, Monitor,
  Network, Plus, Plug, Puzzle, Server, Settings as SettingsIcon, SlidersHorizontal,
  Terminal, Users,
} from "lucide-react";
import { useConfig } from "@/stores/config";
import { useServer } from "@/stores/server";
import { cx } from "@/lib/utils";
import { contentKindOf, serverTypeLabel, serverTypeOf } from "@/lib/config-model";
import { SegmentedControl } from "@/components/ui/misc";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/overlay";
import { CreateInstanceDialog } from "@/components/instance/CreateInstanceDialog";
import { ImportInstanceDialog } from "@/components/instance/ImportInstanceDialog";

const navItemClass = (isActive: boolean) =>
  cx(
    "group relative flex h-10 items-center gap-3 rounded-lg px-3 t-label-13 transition-colors duration-150",
    isActive ? "bg-tea-100 font-medium text-tea-700" : "text-gray-800 hover:bg-gray-100 hover:text-gray-1000",
  );

const bottomItemClass = (isActive: boolean) =>
  cx(
    "flex h-9 items-center gap-2.5 rounded-lg px-2.5 t-label-13 transition-colors",
    isActive ? "bg-gray-100 font-medium text-gray-1000" : "text-gray-800 hover:bg-gray-100 hover:text-gray-1000",
  );

function hostNav(instanceId: string | null, contentLabel: string, contentIcon: typeof Puzzle) {
  const at = (tab: string) => (instanceId ? `/instances/${instanceId}/${tab}` : "/instances");
  return [
    { to: "/", label: "总览", icon: LayoutDashboard, end: true, count: false },
    { to: at("console"), label: "控制台", icon: Terminal, end: false, count: false },
    { to: at("config"), label: "配置", icon: SlidersHorizontal, end: false, count: false },
    { to: at("content"), label: contentLabel, icon: contentIcon, end: false, count: true },
    { to: at("worlds"), label: "世界与备份", icon: Map, end: false, count: false },
    { to: at("players"), label: "玩家", icon: Users, end: false, count: false },
    { to: "/network", label: "联机", icon: Network, end: false, count: false },
  ];
}

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

  useEffect(() => {
    void window.mcss.app.info().then((info) => setVersion(info.version)).catch(() => {});
  }, []);

  const host = mode === "host";
  const active = instances.find((i) => i.id === activeId) ?? instances[0] ?? null;
  const running = status === "running" || status === "starting";
  const kind = active ? contentKindOf(serverTypeOf(active)) : "mod";
  const contentLabel = kind === "plugin" ? "插件" : kind === "datapack" ? "数据包" : "模组";
  const ContentIcon = kind === "plugin" ? Plug : Puzzle;
  const nav = host ? hostNav(active?.id ?? null, contentLabel, ContentIcon) : PLAYER_NAV;

  useEffect(() => {
    if (!host || !active) {
      setContentCount(null);
      return;
    }
    const sub = kind === "plugin" ? "plugins" : kind === "datapack" ? "datapacks" : "mods";
    let alive = true;
    void window.mcss.fs.list(`${active.dir}\\${sub}`)
      .then((list) => {
        if (alive) setContentCount(list.filter((e) => !e.isDir && /\.jar(\.disabled)?$/i.test(e.name)).length);
      })
      .catch(() => alive && setContentCount(null));
    return () => { alive = false; };
  }, [host, active?.dir, kind, location.pathname]);

  async function switchMode(next: "host" | "player") {
    if (next === mode) return;
    await setMode(next);
    navigate("/");
  }

  async function switchInstance(id: string) {
    await setActive(id);
    const m = location.pathname.match(/^\/instances\/[^/]+\/([a-z]+)/);
    if (m) navigate(`/instances/${id}/${m[1]}${location.search}`);
    else if (/^\/instances\/[^/]+\/?$/.test(location.pathname)) navigate(`/instances/${id}`);
  }

  return (
    <nav aria-label="主导航" className="flex w-60 shrink-0 flex-col bg-background-100">
      <div className="px-5 pb-2 pt-5 text-[11px] font-medium tracking-[0.06em] text-gray-700">
        {host ? "服务器管理" : "玩家中心"}
      </div>

      <div className="flex flex-col gap-1 px-3">
        {nav.map(({ to, label, icon: Icon, end, count }) => (
          <NavLink
            key={to + label}
            to={to}
            end={end}
            className={({ isActive }) => {
              const overviewHere = label === "总览" &&
                (location.pathname === "/" || location.pathname === `/instances/${active?.id ?? ""}`);
              return navItemClass(overviewHere || isActive);
            }}
          >
            <Icon className="size-[17px] shrink-0" strokeWidth={1.9} />
            <span className="min-w-0 flex-1 truncate">{label}</span>
            {count && contentCount !== null ? (
              <span className="rounded-md bg-background-100/70 px-1.5 py-0.5 text-[11px] tabular-nums text-gray-700">{contentCount}</span>
            ) : null}
          </NavLink>
        ))}
      </div>

      {!host && instances.length > 0 ? (
        <div className="mx-3 mt-4 rounded-xl bg-tea-100 p-3.5">
          <div className="t-label-13 font-medium text-tea-700">自己也有服务器？</div>
          <p className="mt-1 text-[12px] leading-[18px] text-gray-800">切到服主模式，接着管理原来的配置。</p>
          <button onClick={() => void switchMode("host")} className="mt-2 text-[12px] font-medium text-tea-700 hover:underline">
            切换到服主模式
          </button>
        </div>
      ) : null}

      <div className="min-h-4 flex-1" />

      <div className="space-y-3 border-t border-gray-300 p-3">
        {host ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex w-full items-center gap-3 rounded-xl border border-gray-300 bg-background-200 p-2.5 text-left transition-colors hover:bg-gray-100">
                <span className={cx("grid size-9 shrink-0 place-items-center rounded-lg text-[12px] font-semibold", running ? "bg-tea-200 text-tea-700" : "bg-gray-200 text-gray-900")}>
                  {active?.name.slice(0, 1).toUpperCase() ?? <Server className="size-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="t-label-13 block truncate font-medium text-gray-1000">{active?.name ?? "还没有服务器"}</span>
                  <span className="mt-0.5 block truncate text-[11px] leading-4 text-gray-700">
                    {active ? `${active.mcVersion} · ${serverTypeLabel(serverTypeOf(active))}` : "点这里新建一个"}
                  </span>
                </span>
                <ChevronsUpDown className="size-3.5 shrink-0 text-gray-700" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-72" align="start">
              <DropdownMenuLabel>切换服务器</DropdownMenuLabel>
              {instances.length === 0 ? <div className="px-2.5 pb-1 t-label-12 text-gray-700">还没有服务器</div> : null}
              {instances.map((inst) => (
                <DropdownMenuItem key={inst.id} onSelect={() => void switchInstance(inst.id)}>
                  <span className="min-w-0 flex-1 truncate">{inst.name}</span>
                  <span className="t-label-12 shrink-0 text-gray-700">{inst.mcVersion} · {serverTypeLabel(serverTypeOf(inst))}</span>
                  {inst.id === active?.id ? <Check className="size-3.5 shrink-0" /> : null}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setCreating(true)}><Plus className="size-4" />新建服务器</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setImporting(true)}><FolderInput className="size-4" />导入现有服务器</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}

        <div className="flex flex-col gap-0.5">
          {host ? (
            <NavLink to="/instances" end title="查看和管理所有服务器" className={({ isActive }) => bottomItemClass(isActive)}>
              <Boxes className="size-4 shrink-0" />全部服务器
              <span className="ml-auto t-label-12 tabular-nums text-gray-700">{instances.length}</span>
            </NavLink>
          ) : null}
          <NavLink to="/settings" className={({ isActive }) => bottomItemClass(isActive)}>
            <SettingsIcon className="size-4 shrink-0" />设置
          </NavLink>
        </div>

        <SegmentedControl<"host" | "player">
          grow
          size="sm"
          value={mode}
          onValueChange={(v) => void switchMode(v)}
          options={[
            { value: "host", label: "开服", title: "管理自己的服务器" },
            { value: "player", label: "进服", title: "加入朋友的服务器" },
          ]}
        />
        <div className="flex items-center justify-between px-1 text-[11px] leading-4 text-gray-700">
          <span>开服茶 v{version || "—"}</span>
          {running ? <span className="inline-flex items-center gap-1.5 text-green-900"><span className="status-dot" />运行中</span> : null}
        </div>
      </div>

      <CreateInstanceDialog open={creating} onOpenChange={setCreating} />
      <ImportInstanceDialog open={importing} onOpenChange={setImporting} />
    </nav>
  );
}
