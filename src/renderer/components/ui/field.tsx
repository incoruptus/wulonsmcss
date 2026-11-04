import { cloneElement, forwardRef, isValidElement, useId } from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import * as SliderPrimitive from "@radix-ui/react-slider";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check, Loader2 } from "lucide-react";
import { useI18n } from "@/i18n";
import { cx } from "@/lib/utils";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cx(
          "h-10 w-full rounded-lg bg-background-100 px-3 text-sm text-gray-1000 shadow-geist-border transition-[box-shadow,background-color] duration-[var(--dur-micro)] ease-[var(--ease-out)]",
          "placeholder:text-gray-700 disabled:bg-gray-100 disabled:text-gray-700",
          "focus-visible:outline-none focus-visible:shadow-[0_0_0_1px_var(--ds-focus-color),0_0_0_4px_color-mix(in_srgb,var(--ds-focus-color)_18%,transparent)]",
          className,
        )}
        {...props}
      />
    );
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        className={cx(
          "w-full rounded-lg bg-background-100 px-3 py-2.5 text-sm leading-6 text-gray-1000 shadow-geist-border transition-[box-shadow,background-color] duration-[var(--dur-micro)] ease-[var(--ease-out)]",
          "placeholder:text-gray-700 disabled:bg-gray-100 disabled:text-gray-700",
          "focus-visible:outline-none focus-visible:shadow-[0_0_0_1px_var(--ds-focus-color),0_0_0_4px_color-mix(in_srgb,var(--ds-focus-color)_18%,transparent)]",
          className,
        )}
        {...props}
      />
    );
  },
);

export const Switch = forwardRef<
  React.ComponentRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(function Switch({ className, ...props }, ref) {
  return (
    <SwitchPrimitive.Root
      ref={ref}
      className={cx(
        "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full bg-gray-400 transition-colors duration-[var(--dur-micro)] ease-[var(--ease-out)]",
        "data-[state=checked]:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block size-4 translate-x-[2px] rounded-full bg-white shadow-geist-xs transition-transform duration-[var(--dur-micro)] ease-[var(--ease-out)] data-[state=checked]:translate-x-[18px] data-[state=checked]:bg-[var(--ds-switch-thumb-on)]" />
    </SwitchPrimitive.Root>
  );
});

export const Checkbox = forwardRef<
  React.ComponentRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(function Checkbox({ className, ...props }, ref) {
  return (
    <CheckboxPrimitive.Root
      ref={ref}
      className={cx(
        "flex size-[18px] shrink-0 items-center justify-center rounded-[5px] bg-background-100 shadow-geist-border transition-colors duration-[var(--dur-micro)]",
        "data-[state=checked]:bg-brand-600 data-[state=checked]:text-brand-ink",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator>
        <Check className="size-3" strokeWidth={3} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
});

export const Slider = forwardRef<
  React.ComponentRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> & { ariaLabel?: string }
>(function Slider({ className, ariaLabel, ...props }, ref) {
  return (
    <SliderPrimitive.Root
      ref={ref}
      className={cx("relative flex h-6 w-full touch-none select-none items-center", className)}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-gray-300">
        <SliderPrimitive.Range className="absolute h-full bg-brand-600" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        aria-label={ariaLabel}
        className="block size-4 rounded-full bg-background-100 shadow-geist-border outline-none transition-transform hover:scale-110 focus-visible:shadow-[0_0_0_2px_var(--ds-background-100),0_0_0_4px_var(--ds-focus-color)]"
      />
    </SliderPrimitive.Root>
  );
});

export function Field({
  label,
  hint,
  htmlFor,
  children,
  className,
  inline,
}: {
  label?: string;
  hint?: string;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
  inline?: boolean;
}) {
  const autoId = useId();
  const id = htmlFor ?? autoId;
  const canReceiveId =
    isValidElement(children) &&
    (typeof children.type !== "string" || ["input", "textarea", "select"].includes(children.type));
  const control =
    canReceiveId && !(children.props as { id?: string }).id
      ? cloneElement(children as React.ReactElement<{ id?: string }>, { id })
      : children;

  if (inline) {
    return (
      <div className={cx("flex items-center justify-between gap-4", className)}>
        <div className="min-w-0">
          <label htmlFor={id} className="t-label-14 block text-gray-1000">{label}</label>
          {hint ? <p className="t-copy-13 mt-1 text-pretty text-gray-800">{hint}</p> : null}
        </div>
        <div className="shrink-0" id={`${id}-ctl`}>{control}</div>
      </div>
    );
  }
  return (
    <div className={cx("space-y-2", className)}>
      {label ? <label htmlFor={id} className="t-label-13 block font-medium text-gray-900">{label}</label> : null}
      {control}
      {hint ? <p className="t-copy-13 text-pretty text-gray-800">{hint}</p> : null}
    </div>
  );
}

export function SwitchRow({
  label,
  hint,
  checked,
  onCheckedChange,
  disabled,
  ariaLabel,
  loading,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
  ariaLabel?: string;
  loading?: boolean;
}) {
  const id = useId();
  const { t } = useI18n();
  return (
    <div className="flex min-h-10 items-center justify-between gap-4 py-1">
      <div className="min-w-0">
        <label htmlFor={id} className="t-label-14 block cursor-pointer text-gray-1000">{label}</label>
        {hint ? <p className="t-copy-13 mt-0.5 text-pretty text-gray-800">{hint}</p> : null}
      </div>
      {loading ? (
        <span className="grid h-6 w-10 place-items-center" aria-busy="true" aria-label={t("settings.syncing", "正在同步到云端")}>
          <Loader2 className="size-4 animate-spin text-gray-800" />
        </span>
      ) : (
        <Switch
          id={id}
          checked={checked}
          onCheckedChange={onCheckedChange}
          disabled={disabled}
          aria-label={ariaLabel ?? (label || undefined)}
        />
      )}
    </div>
  );
}
