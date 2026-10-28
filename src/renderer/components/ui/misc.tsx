import { Fragment } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group";
import { cx } from "@/lib/utils";

/* ---------------- Badge ---------------- */

export const badgeVariants = cva(
  "inline-flex select-none items-center gap-1 whitespace-nowrap rounded-full font-medium",
  {
    variants: {
      variant: {
        gray: "bg-gray-100 text-gray-1000",
        blue: "bg-blue-100 text-blue-900 dark:bg-blue-200",
        green: "bg-green-800/10 text-green-900",
        amber: "bg-amber-700/15 text-amber-900",
        red: "bg-red-700/10 text-red-900",
        violet: "bg-purple-700/10 text-purple-700",
        teal: "bg-teal-700/10 text-teal-700",
        solid: "bg-gray-1000 text-background-100",
      },
      size: {
        sm: "h-5 px-2 text-[11px]",
        md: "h-6 px-2.5 text-[12px]",
        lg: "h-8 px-3 text-[14px]",
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

/* ---------------- Card ---------------- */

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("rounded-xl bg-background-200 p-4 shadow-geist-border", className)} {...props}>
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
    <div className={cx("flex items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <h3 className="t-h-14 text-gray-1000">{children}</h3>
        {desc ? <p className="t-label-13 mt-0.5 text-gray-800">{desc}</p> : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}

/* ---------------- SegmentedControl ---------------- */

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
        "inline-flex items-center gap-0.5 rounded-md bg-gray-100 p-0.5",
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
            "inline-flex items-center justify-center gap-1.5 rounded-[5px] text-gray-900 transition-colors",
            size === "sm" ? "h-7 px-2 text-[12px]" : "h-7 px-2.5 text-[13px]",
            grow && "min-w-0 flex-1",
            "hover:text-gray-1000 data-[state=on]:bg-background-100 data-[state=on]:text-gray-1000 data-[state=on]:shadow-geist-xs",
          )}
        >
          {opt.label}
        </ToggleGroupPrimitive.Item>
      ))}
    </ToggleGroupPrimitive.Root>
  );
}

/* ---------------- EmptyState / Spinner / Kbd ---------------- */

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
    <div className={cx("flex flex-col items-center justify-center gap-3 px-6 py-14 text-center", className)}>
      {icon ? <div className="grid size-11 place-items-center rounded-full bg-gray-100 text-gray-900">{icon}</div> : null}
      <div>
        <div className="t-h-14 text-gray-1000">{title}</div>
        {desc ? <p className="t-label-13 mx-auto mt-1 max-w-[42ch] text-gray-800">{desc}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx("size-4 animate-spin text-gray-800", className)} />;
}

/** 键位控件（Geist 键帽风格） */
export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cx(
        "inline-flex h-[22px] min-w-[22px] select-none items-center justify-center rounded-md border border-gray-400/80 bg-gray-100 px-1.5",
        "font-mono text-[11px] leading-none text-gray-900 shadow-[inset_0_-1.5px_0_var(--ds-gray-a300)]",
        "dark:border-gray-500 dark:bg-gray-300 dark:text-gray-1000 dark:shadow-[inset_0_-1.5px_0_#00000080]",
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
