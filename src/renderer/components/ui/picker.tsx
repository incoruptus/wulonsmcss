import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { cx } from "@/lib/utils";

export interface PickerOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface PickerProps {
  value: string;
  onValueChange: (value: string) => void;
  options: PickerOption[];
  className?: string;
  /** sm = 工具栏里的紧凑高度 */
  size?: "sm" | "md";
  placeholder?: string;
  disabled?: boolean;
  "aria-label"?: string;
}

/**
 * 下拉选择
 * ------------------------------------------------------------
 * 不用原生 <select>：原生弹层由系统画，和 Geist 这套完全不搭，
 * 而且没法放两行信息 / 复选。这里用 Radix 的行为 + 自己的皮肤。
 */
export function Picker({
  value,
  onValueChange,
  options,
  className,
  size = "md",
  placeholder = "请选择",
  disabled,
  ...rest
}: PickerProps) {
  const current = options.find((o) => o.value === value);
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectPrimitive.Trigger
        aria-label={rest["aria-label"]}
        className={cx(
          "flex w-full items-center gap-2 rounded-md bg-background-100 text-left text-gray-1000 shadow-geist-border transition-colors",
          "hover:bg-gray-100/60 focus-visible:outline-none focus-visible:shadow-[0_0_0_1px_var(--ds-focus-color),0_0_0_4px_color-mix(in_srgb,var(--ds-focus-color)_18%,transparent)]",
          "data-[state=open]:bg-gray-100 disabled:bg-gray-100 disabled:text-gray-700",
          size === "sm" ? "h-7 px-2 t-label-12" : "h-9 px-3 text-sm",
          className,
        )}
      >
        <SelectPrimitive.Value
          placeholder={<span className="truncate text-gray-700">{placeholder}</span>}
          className="min-w-0 flex-1 truncate"
        >
          <span className="truncate">{current?.label ?? placeholder}</span>
        </SelectPrimitive.Value>
        <SelectPrimitive.Icon className="ml-auto shrink-0">
          <ChevronDown className="size-3.5 text-gray-700" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>

      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          className="z-[80] max-h-[min(320px,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg bg-background-100 p-1 shadow-geist-menu"
        >
          <SelectPrimitive.Viewport className="max-h-[300px] overflow-y-auto scroll-thin">
            {options.map((o) => (
              <SelectPrimitive.Item
                key={o.value}
                value={o.value}
                disabled={o.disabled}
                className={cx(
                  "relative flex cursor-default select-none items-center gap-2 rounded-md py-1.5 pl-2 pr-7 text-[13px] outline-none",
                  "data-[highlighted]:bg-gray-100 data-[disabled]:pointer-events-none data-[disabled]:opacity-45",
                )}
              >
                <SelectPrimitive.ItemText>
                  <span className="block min-w-0 flex-1 truncate">{o.label}</span>
                </SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator className="absolute right-2">
                  <Check className="size-3.5 text-gray-1000" />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
