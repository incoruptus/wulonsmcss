import { Fragment } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group";
import { cx } from "@/lib/utils";

export const badgeVariants = cva(
  "inline-flex select-none items-center gap-1.5 whitespace-nowrap rounded-full font-medium",
  {
    variants: {
      variant: {
        gray: "bg-gray-100 text-gray-900 shadow-[inset_0_0_0_1px_var(--ds-gray-a200)]",
        blue: "bg-blue-100 text-blue-900",
        green: "bg-green-800/10 text-green-900",
        amber: "bg-amber-700/12 text-amber-900",
        red: "bg-red-700/10 text-red-900",
        violet: "bg-purple-700/10 text-purple-700",
        teal: "bg-teal-700/10 text-teal-700",
        solid: "bg-gray-1000 text-background-100",
        accent: "bg-brand-100 text-brand-700 shadow-[inset_0_0_0_1px_var(--ds-brand-200)]",
      },
      size: {
        sm: "min-h-5 px-2 py-0.5 text-[11px]",
        md: "min-h-6 px-2.5 py-0.5 text-[12px]",
        lg: "min-h-8 px-3 py-1 text-[13px]",
      },
    },
    defaultVariants: { variant: "gray", size: "md" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, size, ...props }: BadgeProps) {
  return <span className={cx(badgeVariants({ variant, size }), className)} {...props} />;
}

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("rounded-xl bg-background-100 p-5 shadow-geist-border", className)} {...props}>
      {children}
    </div>
  );
}

export function CardTitle({
  children,
  desc,
  right,
  className,
}: {
  children: React.ReactNode;
  desc?: string;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex flex-wrap items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <h3 className="t-h-16 text-gray-1000">{children}</h3>
        {desc ? <p className="t-copy-13 mt-1 text-pretty text-gray-800">{desc}</p> : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}

export function SegmentedControl<T extends string>({
  value,
  onValueChange,
  options,
  size = "md",
  grow,
  className,
  disabled,
}: {
  value: T;
  onValueChange: (v: T) => void;
  options: { value: T; label: React.ReactNode; title?: string }[];
  size?: "sm" | "md";
  grow?: boolean;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <ToggleGroupPrimitive.Root
      type="single"
      value={value}
      disabled={disabled}
      onValueChange={(v) => v && onValueChange(v as T)}
      className={cx(
        "inline-flex items-center gap-1 rounded-lg bg-gray-100 p-1",
        grow && "flex w-full",
        disabled && "pointer-events-none opacity-60",
        className,
      )}
    >
      {options.map((opt) => (
        <ToggleGroupPrimitive.Item
          key={opt.value}
          value={opt.value}
          title={opt.title}
          className={cx(
            "inline-flex items-center justify-center gap-1.5 rounded-md text-gray-800 transition-[background-color,color,box-shadow] duration-150",
            size === "sm" ? "h-7 px-2.5 text-[12px]" : "h-8 px-3 text-[13px]",
            grow && "min-w-0 flex-1",
            "hover:text-gray-1000 data-[state=on]:bg-background-100 data-[state=on]:font-medium data-[state=on]:text-gray-1000 data-[state=on]:shadow-geist-xs",
          )}
        >
          {opt.label}
        </ToggleGroupPrimitive.Item>
      ))}
    </ToggleGroupPrimitive.Root>
  );
}

export function EmptyState({
  icon,
  title,
  desc,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  desc?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex flex-col items-center justify-center gap-4 px-6 py-16 text-center", className)}>
      {icon ? <div className="brand-mark grid size-12 place-items-center rounded-2xl">{icon}</div> : null}
      <div>
        <div className="t-h-16 text-balance text-gray-1000">{title}</div>
        {desc ? <p className="t-copy-13 mx-auto mt-2 max-w-[46ch] text-pretty text-gray-800">{desc}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx("size-4 animate-spin text-gray-800", className)} aria-label="加载中" />;
}

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cx(
        "inline-flex h-[22px] min-w-[22px] select-none items-center justify-center rounded-md border border-gray-400/80 bg-gray-100 px-1.5",
        "font-mono text-[11px] leading-none text-gray-900 shadow-[inset_0_-1.5px_0_var(--ds-gray-a300)]",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

export function KbdGroup({ keys, className, separator = "" }: { keys: string[]; className?: string; separator?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1", className)}>
      {keys.map((k, i) => (
        <Fragment key={k}>
          {i > 0 && separator ? <span className="text-[11px] text-gray-700">{separator}</span> : null}
          <Kbd>{k}</Kbd>
        </Fragment>
      ))}
    </span>
  );
}

export function Divider({ className }: { className?: string }) {
  return <div className={cx("h-px w-full bg-gray-300", className)} />;
}
