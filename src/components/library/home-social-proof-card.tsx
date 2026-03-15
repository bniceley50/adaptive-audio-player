import Link from "next/link";
import { featuredBookCircles } from "@/features/discovery/book-circles";
import { featuredListeningEditions } from "@/features/discovery/listening-editions";
import type { SocialCommunityPulseSummary } from "@/lib/backend/types";

export function HomeSocialProofCard({
  pulse,
}: {
  pulse: SocialCommunityPulseSummary;
}) {
  if (pulse.totalSocialWorkspaces === 0) {
    return null;
  }

  const topEdition = pulse.editionCounts[0]
    ? featuredListeningEditions.find((edition) => edition.id === pulse.editionCounts[0].editionId) ??
      null
    : null;
  const topCircle = pulse.circleCounts[0]
    ? featuredBookCircles.find((circle) => circle.id === pulse.circleCounts[0].circleId) ?? null
    : null;

  return (
    <section className="overflow-hidden rounded-[2rem] border border-stone-200/80 bg-white shadow-[0_22px_60px_-42px_rgba(28,25,23,0.4)]">
      <div className="border-b border-stone-200/80 bg-[linear-gradient(135deg,#fffdf7_0%,#f7f3ea_52%,#eef4ff_100%)] p-6">
        <p className="text-xs font-medium uppercase tracking-[0.22em] text-stone-500">
          Social proof
        </p>
        <h2 className="mt-2 text-xl font-semibold text-stone-900">
          People are already saving editions and joining circles
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
          The listening layer is starting to develop real shared momentum across synced
          workspaces, not just local demos.
        </p>
      </div>
      <div className="grid gap-4 p-6 md:grid-cols-4">
        <article className="rounded-[1.4rem] border border-stone-200 bg-stone-50/80 p-4 shadow-sm">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
            Active social workspaces
          </p>
          <p className="mt-3 text-2xl font-semibold text-stone-950">
            {pulse.totalSocialWorkspaces}
          </p>
        </article>
        <article className="rounded-[1.4rem] border border-stone-200 bg-stone-50/80 p-4 shadow-sm">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
            Most saved edition
          </p>
          <p className="mt-3 text-sm font-semibold text-stone-950">
            {topEdition?.title ?? "Still warming up"}
          </p>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            {topEdition && pulse.editionCounts[0]
              ? `${pulse.editionCounts[0].saves} saves across synced workspaces`
              : "Saved editions will start showing up here as the social layer grows."}
          </p>
        </article>
        <article className="rounded-[1.4rem] border border-stone-200 bg-stone-50/80 p-4 shadow-sm">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
            Most joined circle
          </p>
          <p className="mt-3 text-sm font-semibold text-stone-950">
            {topCircle?.title ?? "Still warming up"}
          </p>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            {topCircle && pulse.circleCounts[0]
              ? `${pulse.circleCounts[0].joins} joins across synced workspaces`
              : "Joined circles will start showing up here as shared activity grows."}
          </p>
        </article>
        <article className="rounded-[1.4rem] border border-stone-200 bg-stone-50/80 p-4 shadow-sm">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
            Promoted moments
          </p>
          <p className="mt-3 text-2xl font-semibold text-stone-950">
            {pulse.totalPromotedMoments}
          </p>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            Memorable lines promoted from real player sessions into the social layer.
          </p>
        </article>
      </div>
      <div className="border-t border-stone-200/80 p-6">
        <Link
          className="inline-flex rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
          href="/social"
        >
          Open social page
        </Link>
      </div>
    </section>
  );
}
