import { forwardRef } from "react";
import { ChevronDown } from "lucide-react";
import { cx } from "@/lib/utils";

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options: { value: string; label: string; disabled?: boolean }[];
}

/**
 * 兜底：把选项字段压成文本。
 * 后端形状和类型契约不一致时（真实发生过：fabric-loaders 吐对象），
 * 直接渲染对象会让 React 抛 #31 并卸载整棵组件树——用户看到的是纯黑窗口。
 * 这里退化成字符串 + 告警：难看，但能继续用。
 */
function toText(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v == null) return "";
  console.warn("[mcss] Select 选项不是文本，已降级显示：", v);
  return String((v as { version?: unknown }).version ?? (v as { value?: unknown }).value ?? JSON.stringify(v));
}

/** 原生 select 的 Geist 皮肤（够用且零依赖） */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, options, ...props },
  ref,
) {
  return (
    <div className={cx("relative", className)}>
      <select
        ref={ref}
        className={cx(
          "h-9 w-full appearance-none rounded-md bg-background-100 pl-3 pr-8 text-sm text-gray-1000 shadow-geist-border",
          "focus-visible:outline-none focus-visible:shadow-[0_0_0_1px_var(--ds-focus-color),0_0_0_4px_color-mix(in_srgb,var(--ds-focus-color)_18%,transparent)]",
          "disabled:bg-gray-100 disabled:text-gray-700",
        )}
        {...props}
      >
        {options.map((o, i) => {
          const value = toText(o?.value);
          return (
            <option key={`${value}-${i}`} value={value} disabled={o?.disabled}>
              {toText(o?.label)}
            </option>
          );
        })}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-gray-700" />
    </div>
  );
});
