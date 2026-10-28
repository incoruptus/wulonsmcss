import { cx } from "@/lib/utils";

export function PageHeader({
  title,
  desc,
  actions,
  className,
}: {
  title: string;
  desc?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex items-end justify-between gap-4 px-6 pb-4 pt-5", className)}>
      <div className="min-w-0">
        <h1 className="t-h-20 text-gray-1000">{title}</h1>
        {desc ? <p className="t-label-13 mt-1 text-gray-800">{desc}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function PageBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cx("px-6 pb-10", className)}>{children}</div>;
}
