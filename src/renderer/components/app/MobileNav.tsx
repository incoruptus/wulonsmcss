import { NavLink, useLocation } from "react-router-dom";
import { Gamepad2, LayoutDashboard, PackageSearch, Server, Settings, Terminal, UserRound } from "lucide-react";
import { useConfig } from "@/stores/config";
import { cx } from "@/lib/utils";

export function MobileNav() {
  const activeId = useConfig((s) => s.cfg.activeInstanceId);
  const mode = useConfig((s) => s.cfg.mode);
  const location = useLocation();
  const base = activeId ? `/instances/${activeId}` : "/instances";
  const items =
    mode === "player"
      ? [
          { to: "/", label: "加入", icon: Gamepad2, end: true },
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
      aria-label="主导航"
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-gray-300 bg-background-100/95 px-1 pb-[max(4px,env(safe-area-inset-bottom))] pt-1 backdrop-blur-xl md:hidden"
    >
      {items.map((item) => {
        const Icon = item.icon;
        const overviewHere = item.to === "/" && location.pathname === `/instances/${activeId ?? ""}`;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cx(
                "relative flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[11px] leading-4 transition-colors",
                isActive || overviewHere ? "bg-brand-100 font-medium text-brand-700" : "text-gray-700 active:bg-gray-100",
              )
            }
          >
            <Icon className="size-[19px]" strokeWidth={1.8} />
            <span className="max-w-full truncate">{item.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}
