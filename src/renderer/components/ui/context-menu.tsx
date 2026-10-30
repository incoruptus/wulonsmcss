import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { LucideIcon } from "lucide-react";
import { cx } from "@/lib/utils";
import { isDesktopVisual } from "@/lib/shell";

export interface ContextMenuItem {
  label: string;
  icon?: LucideIcon;
  shortcut?: string;
  onSelect?: () => void;
  disabled?: boolean;
  danger?: boolean;
  separator?: boolean;
}

/**
 * 右键菜单
 * ------------------------------------------------------------
 * 浏览器默认菜单在 Electron 里全是浏览器功能，跟日志/Mod 列表没关系。
 * 这里自己做一套：Esc / 点外面 / 滚动都会关，靠近屏幕边缘会翻边。
 */
export function ContextMenu({
  items,
  children,
  className,
}: {
  items: ContextMenuItem[];
  children: React.ReactNode;
  className?: string;
}) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  /**
   * 网页版不接管右键：浏览器自己的菜单（复制/搜索/翻译/阅读模式）比我们做的全，
   * 而且用户可能装了划词工具。只有桌面版需要补这套菜单。
   */
  const desktop = isDesktopVisual();

  function open(e: React.MouseEvent) {
    e.preventDefault();
    const menuW = 216;
    const estimatedH = Math.min(320, items.length * 30 + 8);
    const x = Math.min(e.clientX, window.innerWidth - menuW - 8);
    const y = Math.min(e.clientY, window.innerHeight - estimatedH - 8);
    setPos({ x: Math.max(8, x), y: Math.max(8, y) });
  }

  useEffect(() => {
    if (!pos) return;
    const close = () => setPos(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", close);
    window.addEventListener("resize", close);
    document.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", close);
      window.removeEventListener("resize", close);
      document.removeEventListener("scroll", close, true);
    };
  }, [pos]);

  // 渲染后按实际高度再校一次，避免贴底被切
  useLayoutEffect(() => {
    if (!pos || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    if (rect.bottom > window.innerHeight - 8 || rect.right > window.innerWidth - 8) {
      setPos({
        x: Math.min(pos.x, window.innerWidth - rect.width - 8),
        y: Math.min(pos.y, window.innerHeight - rect.height - 8),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos?.x, pos?.y]);

  const visible = items.filter((it) => !it.disabled || it.separator);
  if (!visible.length) return <div className={className}>{children}</div>;

  return (
    <div className={className} onContextMenu={desktop ? open : undefined}>
      {children}
      {desktop && pos && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={ref}
              role="menu"
              style={{ left: pos.x, top: pos.y }}
              className="fixed z-[100] w-[216px] rounded-lg bg-background-100 p-1 shadow-geist-menu"
            >
              {items.map((item, i) =>
                item.separator ? (
                  <div key={`sep-${i}`} className="mx-1 my-1 h-px bg-gray-300" />
                ) : (
                  <button
                    key={`${item.label}-${i}`}
                    role="menuitem"
                    disabled={item.disabled}
                    onClick={() => {
                      setPos(null);
                      item.onSelect?.();
                    }}
                    className={cx(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors",
                      item.danger
                        ? "text-red-900 hover:bg-red-700/10"
                        : "text-gray-1000 hover:bg-gray-100",
                      "disabled:pointer-events-none disabled:opacity-40",
                    )}
                  >
                    {item.icon ? <item.icon className="size-3.5 shrink-0" /> : null}
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.shortcut ? <span className="t-label-12 shrink-0 text-gray-700">{item.shortcut}</span> : null}
                  </button>
                ),
              )}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

/** 当前选中的文本（没有就返回空串） */
export function selectedText(): string {
  if (typeof window === "undefined") return "";
  return window.getSelection()?.toString().trim() ?? "";
}
