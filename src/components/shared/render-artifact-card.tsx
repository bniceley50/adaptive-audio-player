import type { ReactNode } from "react";

interface RenderArtifactCardProps {
  title: string;
  meta: string;
  generatedAt: string;
  timestampClassName?: string;
  className?: string;
  titleClassName?: string;
  metaClassName?: string;
  actions: ReactNode;
}

export function RenderArtifactCard({
  title,
  meta,
  generatedAt,
  timestampClassName = "rounded-full border border-white/15 bg-white/8 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-stone-200",
  className = "rounded-[1.35rem] border border-white/10 bg-black/10 px-4 py-4",
  titleClassName = "text-sm font-semibold text-white",
  metaClassName = "mt-2 text-sm text-stone-300",
  actions,
}: RenderArtifactCardProps) {
  return (
    <article className={className}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className={titleClassName}>{title}</p>
          <p className={metaClassName}>{meta}</p>
        </div>
        <span className={timestampClassName}>
          {new Date(generatedAt).toLocaleString()}
        </span>
      </div>
      <div className="mt-4 flex flex-wrap gap-3">{actions}</div>
    </article>
  );
}
