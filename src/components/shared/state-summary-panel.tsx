import type { ReactNode } from "react";

interface StateSummaryPanelProps {
  label: string;
  detail: string;
  action: string;
  children: ReactNode;
  actionLabel?: string;
  sectionLabel?: string;
  actionClassName?: string;
  statsClassName?: string;
}

export function StateSummaryPanel({
  label,
  detail,
  action,
  children,
  actionLabel = "Next action",
  sectionLabel = "Current state",
  actionClassName = "max-w-xs",
  statsClassName = "mt-5 grid gap-3 md:grid-cols-4",
}: StateSummaryPanelProps) {
  return (
    <section className="rounded-[2rem] border border-stone-200/80 bg-[linear-gradient(135deg,#fffefb_0%,#ffffff_42%,#eef4ff_100%)] p-6 shadow-[0_24px_70px_-46px_rgba(28,25,23,0.42)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-stone-500">
            {sectionLabel}
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-stone-950">{label}</h2>
          <p className="mt-2 text-sm leading-6 text-stone-600">{detail}</p>
        </div>
        <div className="rounded-[1.5rem] border border-white/80 bg-white/85 px-4 py-4 shadow-sm backdrop-blur">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-stone-500">
            {actionLabel}
          </p>
          <p className={`mt-2 text-base font-semibold text-stone-950 ${actionClassName}`}>
            {action}
          </p>
        </div>
      </div>
      <div className={statsClassName}>{children}</div>
    </section>
  );
}
