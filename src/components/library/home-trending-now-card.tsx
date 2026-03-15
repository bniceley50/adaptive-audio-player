import Link from "next/link";
import { featuredBookCircles } from "@/features/discovery/book-circles";
import { featuredListeningEditions } from "@/features/discovery/listening-editions";
import type { SocialCommunityPulseSummary } from "@/lib/backend/types";

export function HomeTrendingNowCard({
  pulse,
}: {
  pulse: SocialCommunityPulseSummary;
}) {
  const topEditions = pulse.editionCounts
    .map((entry) => ({
      entry,
      edition:
        featuredListeningEditions.find((edition) => edition.id === entry.editionId) ?? null,
    }))
    .filter((value): value is { entry: (typeof pulse.editionCounts)[number]; edition: NonNullable<(typeof featuredListeningEditions)[number] | null> } => value.edition !== null)
    .slice(0, 2);

  const topCircles = pulse.circleCounts
    .map((entry) => ({
      entry,
      circle: featuredBookCircles.find((circle) => circle.id === entry.circleId) ?? null,
    }))
    .filter((value): value is { entry: (typeof pulse.circleCounts)[number]; circle: NonNullable<(typeof featuredBookCircles)[number] | null> } => value.circle !== null)
    .slice(0, 2);

  if (topEditions.length === 0 && topCircles.length === 0) {
    return null;
  }

  return (
    <section className="overflow-hidden rounded-[2rem] border border-stone-200/80 bg-white shadow-[0_22px_60px_-42px_rgba(28,25,23,0.4)]">
      <div className="border-b border-stone-200/80 bg-[linear-gradient(135deg,#fffdf7_0%,#f7f3ea_52%,#eef4ff_100%)] p-6">
        <p className="text-xs font-medium uppercase tracking-[0.22em] text-stone-500">
          Trending now
        </p>
        <h2 className="mt-2 text-xl font-semibold text-stone-900">
          The listening styles and circles getting traction
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
          A quick consumer-friendly view of what is currently getting saved and joined
          across synced workspaces.
        </p>
      </div>
      <div className="grid gap-4 p-6 xl:grid-cols-2">
        <article className="rounded-[1.5rem] border border-stone-200 bg-[linear-gradient(180deg,#fafaf9_0%,#ffffff_100%)] p-5 shadow-sm">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
            Top editions
          </p>
          <div className="mt-4 space-y-3">
            {topEditions.map(({ entry, edition }) => (
              <div
                key={edition.id}
                className="rounded-[1.2rem] border border-stone-200 bg-white px-4 py-4"
              >
                <div className="flex flex-wrap items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
                  <span className="rounded-full bg-sky-50 px-2.5 py-1 text-sky-700">
                    {entry.saves} saves
                  </span>
                  {entry.reuses > 0 ? (
                    <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">
                      {entry.reuses} reuses
                    </span>
                  ) : null}
                </div>
                <p className="mt-3 text-sm font-semibold text-stone-950">{edition.title}</p>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  {edition.narratorName} for {edition.bookTitle}
                </p>
                <Link
                  className="mt-4 inline-flex rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
                  href={`/import?edition=${edition.id}`}
                >
                  Try this edition
                </Link>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-[1.5rem] border border-stone-200 bg-[linear-gradient(180deg,#fafaf9_0%,#ffffff_100%)] p-5 shadow-sm">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
            Top circles
          </p>
          <div className="mt-4 space-y-3">
            {topCircles.map(({ entry, circle }) => (
              <div
                key={circle.id}
                className="rounded-[1.2rem] border border-stone-200 bg-white px-4 py-4"
              >
                <div className="flex flex-wrap items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
                  <span className="rounded-full bg-sky-50 px-2.5 py-1 text-sky-700">
                    {entry.joins} joins
                  </span>
                  {entry.shares > 0 ? (
                    <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">
                      {entry.shares} shares
                    </span>
                  ) : null}
                </div>
                <p className="mt-3 text-sm font-semibold text-stone-950">{circle.title}</p>
                <p className="mt-2 text-sm leading-6 text-stone-600">{circle.checkpoint}</p>
                <Link
                  className="mt-4 inline-flex rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
                  href="/social"
                >
                  Open circles
                </Link>
              </div>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}
