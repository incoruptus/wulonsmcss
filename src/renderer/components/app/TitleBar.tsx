import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Minus, Square, X, Copy, Users } from "lucide-react";
import { useConfig } from "@/stores/config";
import { useServer } from "@/stores/server";
import { Badge } from "@/components/ui/misc";
import { cx } from "@/lib/utils";
import { isDesktopVisual } from "@/lib/shell";

const TITLES: Record<string, string> = {
  "/": "概览",
  "/instances": "实例",
  "/library": "资源库",
  "/network": "联机",
  "/join": "加入房间",
  "/mine": "我的服务器",
  "/settings": "设置",
};

/** 玩家模式里 "/" 不是"概览"，是"加入游戏" */
const PLAYER_TITLES: Record<string, string> = {
  "/": "加入游戏",
  "/mine": "我的服务器",
  "/client": "我的客户端",
  "/join": "加入游戏",
  "/settings": "设置",
};

export function TitleBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [maximized, setMaximized] = useState(false);
  const instances = useConfig((s) => s.cfg.instances);
  const activeId = useConfig((s) => s.cfg.activeInstanceId);
  const mode = useConfig((s) => s.cfg.mode);
  const status = useServer((s) => s.status);

  const active = instances.find((i) => i.id === activeId);
  const table = mode === "player" ? PLAYER_TITLES : TITLES;
  const section =
    table[location.pathname] ??
    (location.pathname.startsWith("/instances/")
      ? active?.name ?? "实例"
      : location.pathname.startsWith("/join/")
        ? "加入房间"
        : "");

  useEffect(() => {
    window.mcss.window.isMaximized().then(setMaximized).catch(() => {});
  }, [location.pathname]);

  const statusMeta =
    status === "running"
      ? { label: "运行中", variant: "green" as const }
      : status === "starting"
        ? { label: "启动中", variant: "amber" as const }
        : status === "stopping"
          ? { label: "停止中", variant: "amber" as const }
          : { label: "已停止", variant: "gray" as const };

  return (
    <header className="drag-region flex h-10 shrink-0 items-center gap-3 border-b border-gray-300 bg-background-100 px-3">
      <div className="flex items-center gap-2">
        <span className="t-label-13 font-medium text-gray-1000">Wulon&apos;s MCSS</span>
      </div>

      <div className="flex min-w-0 items-center gap-2 text-gray-800">
        <span className="text-gray-500">/</span>
        <span className="t-label-13 truncate">{section}</span>
      </div>

      <div className="ml-auto flex items-center gap-2">
        {mode === "host" ? (
          <>
            <button
              onClick={() => navigate("/join")}
              className="no-drag inline-flex h-6 items-center gap-1 rounded-full bg-gray-100 px-2.5 t-label-12 text-gray-1000 transition-colors hover:bg-gray-200"
              title="朋友发来的房间码，粘进来就能进服"
            >
              <Users className="size-3" />
              加入房间
            </button>
            <Badge variant={statusMeta.variant} size="sm">
              {statusMeta.label}
            </Badge>
          </>
        ) : null}
        {isDesktopVisual() ? (
          <div className="no-drag flex items-center">
          <button
            className="grid size-8 place-items-center rounded-md text-gray-800 transition-colors hover:bg-gray-100 hover:text-gray-1000"
            onClick={() => window.mcss.window.minimize()}
            aria-label="最小化"
          >
            <Minus className="size-4" />
          </button>
          <button
            className="grid size-8 place-items-center rounded-md text-gray-800 transition-colors hover:bg-gray-100 hover:text-gray-1000"
            onClick={() => {
              window.mcss.window.maximize();
              setMaximized((v) => !v);
            }}
            aria-label={maximized ? "还原" : "最大化"}
          >
            {maximized ? <Copy className="size-3.5" /> : <Square className="size-3.5" />}
          </button>
          <button
            className={cx(
              "grid size-8 place-items-center rounded-md text-gray-800 transition-colors",
              "hover:bg-red-700 hover:text-white",
            )}
            onClick={() => window.mcss.window.close()}
            aria-label="关闭"
          >
            <X className="size-4" />
          </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}
