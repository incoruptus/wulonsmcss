import { NavLink } from "react-router-dom";
import { Gamepad2, LayoutDashboard, PackageSearch, Server, Settings, Terminal, UserRound } from "lucide-react";
import { useConfig } from "@/stores/config";
import { cx } from "@/lib/utils";

/**
 * 手机上的底部导航。
 * 桌面侧栏在 <md 隐藏后，至少保留四个最常用的面；
 * 邀请链接（/join）不显示，朋友点开就是完整的一页。
 */
export function MobileNav() {
  const activeId = useConfig((s) => s.cfg.activeInstanceId);
  const mode = useConfig((s) => s.cfg.mode);
  const base = activeId ? `/instances/${activeId}` : "/instances";
  const items =
    mode === "player"
      ? [
          { to: "/join", label: "加入", icon: Gamepad2, end: true },
          { to: "/mine", label: "服务器", icon: Server, end: false },
          { to: "/client", label: "客户端", icon: UserRound, end: false },
          { to: "/settings", label: "设置", icon: Settings, end: false },
        ]
      : [
          { to: "/", label: "总览", icon: LayoutDashboard, end: true },
          { to: `${base}/console`, label: "控制台", icon: Terminal, end: false },
          { to: `${base}/content`, label: "内容", icon: PackageSearch, end: false },
          { to: "/instances", label: "服务器", icon: Server, end: false },
          { to: "/settings", label: "设置", icon: Settings, end: false },
        ];

  return (
    <nav
      aria-label="手机导航"
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-gray-300 bg-background-100/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cx(
                "flex min-w-0 flex-1 flex-col items-center gap-0.5 py-2 t-label-12",
                isActive ? "text-gray-1000" : "text-gray-700",
              )
            }
          >
            <Icon className="size-[18px]" />
            <span className="truncate">{item.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}
