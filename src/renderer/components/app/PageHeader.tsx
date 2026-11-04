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
    <div
      className={cx(
        "mx-auto flex w-full max-w-[1440px] flex-col gap-4 px-4 pb-5 pt-6 sm:px-6 sm:pt-7 lg:flex-row lg:items-end lg:justify-between lg:px-8",
        className,
      )}
    >
      <div className="min-w-0 max-w-3xl">
        <h1 className="t-h-30 text-balance text-gray-1000">{title}</h1>
        {desc ? <p className="t-copy-14 mt-2 max-w-[72ch] text-pretty text-gray-800">{desc}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2 lg:justify-end">{actions}</div> : null}
    </div>
  );
}

export function PageBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cx("mx-auto w-full max-w-[1440px] px-4 pb-10 sm:px-6 lg:px-8", className)}>{children}</div>;
}
