interface RenderHistorySummaryProps {
  eyebrow: string;
  detail: string;
  cards: readonly {
    id: string;
    label: string;
    detail: string;
  }[];
  className?: string;
  cardClassName?: string;
  eyebrowClassName?: string;
  detailClassName?: string;
  labelClassName?: string;
  bodyClassName?: string;
}

export function RenderHistorySummary({
  eyebrow,
  detail,
  cards,
  className = "rounded-[1.4rem] border border-sky-200/60 bg-[linear-gradient(135deg,#eff6ff_0%,#ffffff_100%)] px-4 py-4",
  cardClassName = "rounded-[1.1rem] border border-stone-200/80 bg-white px-4 py-3 shadow-sm",
  eyebrowClassName = "text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-sky-700",
  detailClassName = "mt-3 text-sm leading-6 text-stone-600",
  labelClassName = "text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-stone-500",
  bodyClassName = "mt-2 text-sm leading-6 text-stone-700",
}: RenderHistorySummaryProps) {
  return (
    <div className={className}>
      <p className={eyebrowClassName}>{eyebrow}</p>
      <p className={detailClassName}>{detail}</p>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {cards.map((card) => (
          <article key={card.id} className={cardClassName}>
            <p className={labelClassName}>{card.label}</p>
            <p className={bodyClassName}>{card.detail}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
