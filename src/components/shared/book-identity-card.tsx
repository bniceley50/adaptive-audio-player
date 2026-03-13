import {
  getBookCoverTheme,
  getBookInitials,
} from "@/features/reader/shared-support";

interface BookIdentityCardProps {
  title: string;
  subtitle: string;
  fallbackLabel: string;
  coverTheme?: string | null;
  coverLabel?: string | null;
  coverGlyph?: string | null;
  genreLabel?: string | null;
}

export function BookIdentityCard({
  title,
  subtitle,
  fallbackLabel,
  coverTheme,
  coverLabel,
  coverGlyph,
  genreLabel,
}: BookIdentityCardProps) {
  return (
    <article className="rounded-[1.5rem] border border-stone-200/80 bg-white/85 p-4 shadow-sm">
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-stone-500">
        Book identity
      </p>
      <div className="mt-3 flex items-start gap-4">
        <div
          className={`flex h-24 w-20 shrink-0 flex-col justify-between overflow-hidden rounded-[1.2rem] border border-stone-200 bg-gradient-to-br ${coverTheme ?? getBookCoverTheme(title)} p-3 shadow-sm`}
        >
          <p className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-stone-600">
            {coverLabel ?? fallbackLabel}
          </p>
          <p className="text-xl font-semibold tracking-tight text-stone-950">
            {coverGlyph ?? getBookInitials(title)}
          </p>
        </div>
        <div className="min-w-0">
          <p className="text-lg font-semibold text-stone-950">{title}</p>
          <p className="mt-2 text-sm text-stone-600">{subtitle}</p>
          {genreLabel ? (
            <span className="mt-3 inline-flex rounded-full border border-fuchsia-200 bg-fuchsia-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-fuchsia-700">
              {genreLabel}
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
}
