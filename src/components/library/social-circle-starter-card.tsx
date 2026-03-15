import Link from "next/link";
import type { PublicSocialMoment } from "@/features/social/public-moments";
import type { FeaturedBookCircle } from "@/features/discovery/book-circles";
import type { FeaturedListeningEdition } from "@/features/discovery/listening-editions";

export function SocialCircleStarterCard({
  moment,
  edition,
  circle,
  suggestedTitle,
  suggestedCheckpoint,
  suggestedVibe,
  suggestedSummary,
}: {
  moment: PublicSocialMoment;
  edition: FeaturedListeningEdition | null;
  circle: FeaturedBookCircle | null;
  suggestedTitle: string;
  suggestedCheckpoint: string;
  suggestedVibe: string;
  suggestedSummary: string;
}) {
  return (
    <>
      <section className="rounded-[2rem] border border-stone-200 bg-white/80 p-8 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
              <span className="rounded-full bg-stone-100 px-2.5 py-1">Circle starter</span>
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">
                Seeded from a public moment
              </span>
            </div>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-stone-950">
              {suggestedTitle}
            </h2>
            <p className="mt-4 text-xl font-medium italic leading-8 text-stone-950">
              “{moment.quote}”
            </p>
            <p className="mt-4 text-base leading-7 text-stone-600">{suggestedSummary}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            {edition ? (
              <Link
                className="rounded-full bg-stone-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-stone-800"
                href={`/import?edition=${edition.id}&entry=moment-circle-starter&starterMoment=${moment.id}`}
              >
                Start a fresh circle path
              </Link>
            ) : null}
            {circle ? (
              <Link
                className="rounded-full border border-stone-300 bg-white px-5 py-3 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
                href={`/social/circles/${circle.id}?moment=${moment.id}&entry=moment-path#moment-led`}
              >
                Use the linked circle
              </Link>
            ) : null}
            <Link
              className="rounded-full border border-stone-300 bg-white px-5 py-3 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
              href={`/social/moments/${moment.id}`}
            >
              Back to the moment
            </Link>
          </div>
        </div>
      </section>
      <section className="grid gap-4 md:grid-cols-3">
        <article className="rounded-[1.4rem] border border-stone-200 bg-white p-5 shadow-sm">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
            Suggested checkpoint
          </p>
          <p className="mt-3 text-sm font-semibold text-stone-950">{suggestedCheckpoint}</p>
        </article>
        <article className="rounded-[1.4rem] border border-stone-200 bg-white p-5 shadow-sm">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
            Suggested vibe
          </p>
          <p className="mt-3 text-sm font-semibold text-stone-950">{suggestedVibe}</p>
        </article>
        <article className="rounded-[1.4rem] border border-stone-200 bg-white p-5 shadow-sm">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
            Best starting edition
          </p>
          <p className="mt-3 text-sm font-semibold text-stone-950">
            {edition?.title ?? "No linked edition yet"}
          </p>
        </article>
      </section>
      {circle ? (
        <section className="rounded-[2rem] border border-amber-200 bg-[linear-gradient(135deg,#fff7ed_0%,#ffffff_100%)] p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-amber-700">
            Existing public path
          </p>
          <h3 className="mt-2 text-xl font-semibold text-stone-950">{circle.title}</h3>
          <p className="mt-3 text-sm leading-6 text-stone-600">
            This moment already points into a live circle. You can either jump into that shared path or use the fresh-circle handoff to start a new listening thread around the same line.
          </p>
        </section>
      ) : null}
    </>
  );
}
