import { forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cx } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg t-button transition-[transform,background-color,border-color,color,box-shadow] duration-150 ease-swift active:scale-[0.98] disabled:pointer-events-none disabled:bg-gray-100 disabled:text-gray-700 disabled:shadow-none",
  {
    variants: {
      variant: {
        default: "bg-gray-1000 text-background-100 shadow-geist-xs hover:bg-gray-900 active:bg-gray-800",
        secondary: "bg-background-100 text-gray-1000 shadow-geist-border hover:bg-gray-100 active:bg-gray-200",
        tertiary: "bg-transparent text-gray-900 hover:bg-gray-100 hover:text-gray-1000 active:bg-gray-200",
        error: "bg-red-800 text-white shadow-geist-xs hover:bg-red-900 dark:hover:bg-red-700",
        warning: "bg-amber-800 text-white shadow-geist-xs hover:bg-amber-700",
        ghost: "bg-transparent text-gray-800 hover:bg-gray-100 hover:text-gray-1000",
        accent: "bg-tea-600 text-tea-ink shadow-geist-xs hover:bg-tea-500",
      },
      size: {
        xs: "h-7 px-2.5 text-[12px]",
        sm: "h-8 px-3 text-[13px]",
        md: "h-9 px-3.5",
        lg: "h-11 px-4.5 text-[14px]",
      },
      shape: {
        rounded: "",
        square: "aspect-square px-0",
        circle: "aspect-square rounded-full px-0",
      },
    },
    defaultVariants: { variant: "default", size: "md", shape: "rounded" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, shape, loading, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cx(buttonVariants({ variant, size, shape }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null}
      {children}
    </button>
  );
});

export interface IconButtonProps extends ButtonProps {
  label: string;
}

/** 图标按钮：必须提供可访问名称。 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, className, size = "md", variant = "tertiary", ...props },
  ref,
) {
  return (
    <Button
      ref={ref}
      aria-label={label}
      title={label}
      size={size}
      variant={variant}
      shape="square"
      className={cx("shrink-0", className)}
      {...props}
    />
  );
});
