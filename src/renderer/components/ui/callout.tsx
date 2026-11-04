import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { cx } from "@/lib/utils";

type Tone = "info" | "warning" | "danger" | "success";

const TONE: Record<Tone, { box: string; icon: ReactNode; title: string }> = {
  info: {
    box: "border-brand-300/40 bg-brand-100/40 text-gray-1000",
    icon: <Info className="size-4 shrink-0 text-brand-700" />,
    title: "text-gray-1000",
  },
  warning: {
    box: "border-amber-700/30 bg-amber-700/10 text-amber-900",
    icon: <AlertTriangle className="size-4 shrink-0 text-amber-900" />,
    title: "text-amber-900",
  },
  danger: {
    box: "border-red-700/30 bg-red-700/10 text-red-900",
    icon: <AlertTriangle className="size-4 shrink-0 text-red-900" />,
    title: "text-red-900",
  },
  success: {
    box: "border-green-700/30 bg-green-700/10 text-green-900",
    icon: <CheckCircle2 className="size-4 shrink-0 text-green-900" />,
    title: "text-green-900",
  },
};

/**
 * 状态卡 / 下一步卡统一外壳。
 * 目的在保证每个结论都有「标题 + 解释 + 动作」三件套，
 * 避免出现只说明问题、不给出下一步的面板。
 */
export function Callout({
  tone = "info",
  title,
  children,
  action,
  className,
}: {
  tone?: Tone;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const t = TONE[tone];
  return (
    <div className={cx("flex items-start gap-[9px] rounded-xl border p-3", t.box, className)}>
      {t.icon}
      <div className="min-w-0 flex-1">
        <div className={cx("t-label-13 font-semibold", t.title)}>{title}</div>
        {children ? <div className="mt-1 t-copy-12 text-gray-800">{children}</div> : null}
        {action ? <div className="mt-2 flex flex-wrap items-center gap-2">{action}</div> : null}
      </div>
    </div>
  );
}
