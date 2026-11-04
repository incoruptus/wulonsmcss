import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Minus, Square, X, Copy, Users, Leaf } from "lucide-react";
import { useConfig } from "@/stores/config";
import { useServer } from "@/stores/server";
import { Badge } from "@/components/ui/misc";
import { cx } from "@/lib/utils";
import { isDesktopVisual } from "@/lib/shell";
import { useI18n } from "@/i18n";

export function TitleBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [maximized, setMaximized] = useState(false);
  const instances = useConfig((s) => s.cfg.instances);
  const activeId = useConfig((s) => s.cfg.activeInstanceId);
  const mode = useConfig((s) => s.cfg.mode);
  const status = useServer((s) => s.status);
  const { t } = useI18n();
  const active = instances.find((i) => i.id === activeId);
  const titles: Record<string, string> = {
    "/": t("titlebar.page.overview", "总览"),
    "/instances": t("titlebar.page.instances", "全部服务器"),
    "/network": t("titlebar.page.network", "联机"),
    "/join": t("titlebar.page.join", "加入游戏"),
    "/mine": t("titlebar.page.mine", "我的服务器"),
    "/settings": t("titlebar.page.settings", "设置"),
  };
  const instanceTabs: Record<string, string> = {
    overview: t("titlebar.tab.overview", "总览"),
    console: t("titlebar.tab.console", "控制台"),
    config: t("titlebar.tab.config", "配置"),
    content: t("titlebar.tab.content", "内容"),
    worlds: t("titlebar.tab.worlds", "世界"),
    players: t("titlebar.tab.players", "玩家"),
  };
  const playerTitles: Record<string, string> = {
    "/": t("titlebar.page.join", "加入游戏"),
    "/mine": t("titlebar.page.mine", "我的服务器"),
    "/client": t("titlebar.page.client", "我的客户端"),
    "/join": t("titlebar.page.join", "加入游戏"),
    "/settings": t("titlebar.page.settings", "设置"),
  };
  const table = mode === "player" ? playerTitles : titles;
  const instanceMatch = location.pathname.match(/^\/instances\/([^/]+)(?:\/([a-z]+))?/);
  const section = instanceMatch
    ? `${active?.name ?? t("titlebar.instanceFallback", "服务器")} / ${instanceTabs[instanceMatch[2] ?? "overview"] ?? t("titlebar.tab.overview", "总览")}`
    : (table[location.pathname] ?? (location.pathname.startsWith("/join/") ? t("titlebar.page.join", "加入游戏") : ""));

  useEffect(() => {
    window.mcss.window.isMaximized().then(setMaximized).catch(() => {});
  }, [location.pathname]);

  const statusMeta =
    status === "running"
      ? { label: t("titlebar.status.running", "运行中"), variant: "green" as const }
      : status === "starting"
        ? { label: t("titlebar.status.starting", "启动中"), variant: "amber" as const }
        : status === "stopping"
          ? { label: t("titlebar.status.stopping", "停止中"), variant: "amber" as const }
          : { label: t("titlebar.status.stopped", "已停止"), variant: "gray" as const };

  return (
    <header className="drag-region flex h-12 shrink-0 items-center gap-3 border-b border-gray-300 bg-background-100 px-3">
      <div className="flex shrink-0 items-center gap-2.5 md:w-[216px]">
        <span className="brand-mark size-7 rounded-lg" aria-hidden="true">
          <Leaf className="size-4" strokeWidth={2.2} />
        </span>
        <span className="min-w-0 leading-none">
          <span className="block text-[13px] font-semibold tracking-[-0.02em] text-gray-1000">{t("titlebar.brand", "开服茶")}</span>
          <span className="mt-1 block text-[9px] font-medium tracking-[0.08em] text-gray-700">WULON&apos;S MCSS</span>
        </span>
      </div>

      <div className="hidden min-w-0 items-center gap-2 text-gray-800 sm:flex">
        <span className="text-gray-500">/</span>
        <span className="t-label-13 truncate">{section}</span>
      </div>

      <div className="ml-auto flex items-center gap-2">
        {mode === "host" ? (
          <>
            <button
              onClick={() => navigate("/join")}
              className="no-drag hidden h-7 items-center gap-1.5 rounded-full bg-gray-100 px-3 t-label-12 text-gray-900 transition-colors hover:bg-gray-200 hover:text-gray-1000 sm:inline-flex"
              title={t("titlebar.join.tip", "粘贴朋友发来的链接或房间码")}
            >
              <Users className="size-3.5" />
              {t("titlebar.join", "加入游戏")}
            </button>
            <Badge variant={statusMeta.variant} size="sm" className="hidden sm:inline-flex">
              <span className="status-dot" />
              {statusMeta.label}
            </Badge>
          </>
        ) : null}
        {isDesktopVisual() ? (
          <div className="no-drag flex items-center">
            <button
              className="grid size-8 place-items-center rounded-lg text-gray-800 transition-colors hover:bg-gray-100 hover:text-gray-1000"
              onClick={() => window.mcss.window.minimize()}
              aria-label={t("titlebar.window.minimize", "最小化")}
            >
              <Minus className="size-4" />
            </button>
            <button
              className="grid size-8 place-items-center rounded-lg text-gray-800 transition-colors hover:bg-gray-100 hover:text-gray-1000"
              onClick={() => {
                window.mcss.window.maximize();
                setMaximized((v) => !v);
              }}
              aria-label={maximized ? t("titlebar.window.restore", "还原") : t("titlebar.window.maximize", "最大化")}
            >
              {maximized ? <Copy className="size-3.5" /> : <Square className="size-3.5" />}
            </button>
            <button
              className={cx("grid size-8 place-items-center rounded-lg text-gray-800 transition-colors", "hover:bg-red-700 hover:text-white")}
              onClick={() => window.mcss.window.close()}
              aria-label={t("titlebar.window.close", "关闭")}
            >
              <X className="size-4" />
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}
