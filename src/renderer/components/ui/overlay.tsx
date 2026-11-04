import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { X } from "lucide-react";
import { useI18n } from "@/i18n";
import { cx } from "@/lib/utils";

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  className?: string;
  widthClass?: string;
  hideClose?: boolean;
}

export function Dialog({ open, onOpenChange, children, className, widthClass = "max-w-xl", hideClose }: DialogProps) {
  const { t } = useI18n();
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[3px] transition-opacity duration-[var(--dur-modal)] data-[state=closed]:opacity-0" />
        <DialogPrimitive.Content
          className={cx(
            "fixed left-1/2 top-[6dvh] z-50 flex max-h-[min(86dvh,760px)] w-[calc(100vw-24px)] -translate-x-1/2 flex-col overflow-hidden rounded-2xl bg-background-100 shadow-geist-modal transition-[transform,opacity] duration-[var(--dur-modal)] ease-[var(--ease-out)] focus:outline-none data-[state=closed]:scale-[var(--pop-scale)] data-[state=closed]:opacity-0 sm:top-1/2 sm:w-[92vw] sm:-translate-y-1/2",
            widthClass,
            className,
          )}
        >
          {children}
          {hideClose ? null : (
            <DialogPrimitive.Close
              aria-label={t("common.close", "关闭")}
              className="absolute right-3 top-3 grid size-8 place-items-center rounded-lg text-gray-800 transition-colors hover:bg-gray-100 hover:text-gray-1000"
            >
              <X className="size-4" />
            </DialogPrimitive.Close>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function DialogHeader({ title, desc, children }: { title: React.ReactNode; desc?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="border-b border-gray-300 px-5 py-5 pr-12 sm:px-6">
      <DialogPrimitive.Title className="t-h-20 text-balance text-gray-1000">{title}</DialogPrimitive.Title>
      {desc ? <DialogPrimitive.Description className="t-copy-13 mt-1.5 text-pretty text-gray-800">{desc}</DialogPrimitive.Description> : null}
      {children}
    </div>
  );
}

export function DialogBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cx("min-h-0 flex-1 overflow-y-auto px-5 py-5 scroll-thin sm:px-6", className)}>{children}</div>;
}

export function DialogFooter({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cx("flex flex-wrap items-center justify-end gap-2 border-t border-gray-300 bg-background-100 px-5 py-4 sm:px-6", className)}>
      {children}
    </div>
  );
}

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;

export function DropdownMenuContent({
  className,
  children,
  align = "start",
  sideOffset = 6,
}: {
  className?: string;
  children: React.ReactNode;
  align?: "start" | "center" | "end";
  sideOffset?: number;
}) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        className={cx(
          "z-50 min-w-48 origin-[var(--radix-dropdown-menu-content-transform-origin)] overflow-hidden rounded-xl bg-background-100 p-1.5 shadow-geist-menu transition-[transform,opacity] duration-150 ease-swift data-[state=closed]:scale-[0.98] data-[state=closed]:opacity-0",
          className,
        )}
      >
        {children}
      </DropdownMenuPrimitive.Content>
    </DropdownMenuPrimitive.Portal>
  );
}

export function DropdownMenuItem({
  className,
  danger,
  ...props
}: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & { danger?: boolean }) {
  return (
    <DropdownMenuPrimitive.Item
      className={cx(
        "flex min-h-9 cursor-default select-none items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] outline-none transition-colors",
        danger ? "text-red-900 focus:bg-red-700/10" : "text-gray-1000 focus:bg-gray-100",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuLabel({ children }: { children: React.ReactNode }) {
  return <DropdownMenuPrimitive.Label className="t-label-12 px-2.5 pb-1.5 pt-2 text-gray-800">{children}</DropdownMenuPrimitive.Label>;
}

export function DropdownMenuSeparator() {
  return <DropdownMenuPrimitive.Separator className="mx-1 my-1.5 h-px bg-gray-300" />;
}

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;

export function PopoverContent({
  className,
  children,
  align = "start",
  sideOffset = 6,
}: {
  className?: string;
  children: React.ReactNode;
  align?: "start" | "center" | "end";
  sideOffset?: number;
}) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        className={cx(
          "z-50 origin-[var(--radix-popover-content-transform-origin)] rounded-xl bg-background-100 p-3 shadow-geist-menu outline-none transition-[transform,opacity] duration-150 ease-swift data-[state=closed]:scale-[0.98] data-[state=closed]:opacity-0",
          className,
        )}
      >
        {children}
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  );
}

export function Tip({ children, tip, side = "top" }: { children: React.ReactNode; tip: React.ReactNode; side?: "top" | "bottom" | "left" | "right" }) {
  // 自带 Provider：Tip 会被页面、对话框、独立渲染的组件分别使用，
  // 不能要求每个调用方都在外层记得包一层。
  return (
    <TooltipPrimitive.Provider delayDuration={300}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            sideOffset={6}
            collisionPadding={8}
            className="z-50 max-w-64 origin-[var(--radix-tooltip-content-transform-origin)] rounded-lg bg-gray-1000 px-2.5 py-1.5 text-[12px] leading-4 text-background-100 shadow-geist-md"
          >
            {tip}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}

export { TooltipPrimitive };
