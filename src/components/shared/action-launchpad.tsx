import type { ReactNode } from "react";

export interface ActionLaunchpadItem {
  id: string;
  eyebrow: string;
  label: string;
  detail: string;
  cardClassName?: string;
  eyebrowClassName?: string;
  titleClassName?: string;
  detailClassName?: string;
  action: ReactNode;
}

interface ActionLaunchpadProps {
  items: readonly ActionLaunchpadItem[];
  className?: string;
}

export function ActionLaunchpad({
  items,
  className = "grid gap-4 lg:grid-cols-3",
}: ActionLaunchpadProps) {
  return (
    <div className={className}>
      {items.map((item) => (
        <article
          key={item.id}
          className={`rounded-[1.5rem] border p-5 shadow-sm ${item.cardClassName ?? "border-stone-200 bg-stone-50"}`}
        >
          <p
            className={
              item.eyebrowClassName ??
              "text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-stone-500"
            }
          >
            {item.eyebrow}
          </p>
          <h3
            className={
              item.titleClassName ?? "mt-3 text-lg font-semibold text-stone-950"
            }
          >
            {item.label}
          </h3>
          <p
            className={
              item.detailClassName ?? "mt-2 text-sm leading-6 text-stone-600"
            }
          >
            {item.detail}
          </p>
          <div className="mt-4">{item.action}</div>
        </article>
      ))}
    </div>
  );
}
