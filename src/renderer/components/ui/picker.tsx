import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { cx } from "@/lib/utils";

export interface PickerOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface PickerProps {
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
  options: PickerOption[];
  className?: string;
  size?: "sm" | "md";
  placeholder?: string;
  disabled?: boolean;
  "aria-label"?: string;
}

export function Picker({
  id,
  value,
  onValueChange,
  options,
  className,
  size = "md",
  placeholder = "请选择",
  disabled,
  ...rest
}: PickerProps) {
  const current = options.find((option) => option.value === value);
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectPrimitive.Trigger
        id={id}
        aria-label={rest["aria-label"]}
        className={cx(
          "flex w-full items-center gap-2 rounded-lg bg-background-100 text-left text-gray-1000 shadow-geist-border transition-[background-color,box-shadow] duration-150",
          "hover:bg-gray-100/60 focus-visible:outline-none focus-visible:shadow-[0_0_0_1px_var(--ds-focus-color),0_0_0_4px_color-mix(in_srgb,var(--ds-focus-color)_18%,transparent)]",
          "data-[state=open]:bg-gray-100 disabled:bg-gray-100 disabled:text-gray-700",
          size === "sm" ? "h-8 px-2.5 t-label-12" : "h-10 px-3 text-sm",
          className,
        )}
      >
        <SelectPrimitive.Value placeholder={<span className="truncate text-gray-700">{placeholder}</span>} className="min-w-0 flex-1 truncate">
          <span className="truncate">{current?.label ?? placeholder}</span>
        </SelectPrimitive.Value>
        <SelectPrimitive.Icon className="ml-auto shrink-0"><ChevronDown className="size-3.5 text-gray-700" /></SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>

      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={5}
          className="z-[80] max-h-[min(320px,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] origin-[var(--radix-select-content-transform-origin)] overflow-hidden rounded-xl bg-background-100 p-1.5 shadow-geist-menu"
        >
          <SelectPrimitive.Viewport className="max-h-[300px] overflow-y-auto scroll-thin">
            {options.map((option) => (
              <SelectPrimitive.Item
                key={option.value}
                value={option.value}
                disabled={option.disabled}
                className={cx(
                  "relative flex min-h-9 cursor-default select-none items-center gap-2 rounded-lg py-2 pl-2.5 pr-8 text-[13px] outline-none",
                  "data-[highlighted]:bg-gray-100 data-[disabled]:pointer-events-none data-[disabled]:opacity-45",
                )}
              >
                <SelectPrimitive.ItemText><span className="block min-w-0 flex-1 truncate">{option.label}</span></SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator className="absolute right-2.5"><Check className="size-3.5 text-tea-600" /></SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
