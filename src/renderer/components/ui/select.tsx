import { forwardRef } from "react";
import { ChevronDown } from "lucide-react";
import { cx } from "@/lib/utils";

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options: { value: string; label: string; disabled?: boolean }[];
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
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-gray-700" />
    </div>
  );
});
