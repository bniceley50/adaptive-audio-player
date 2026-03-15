import { featuredBookCircles } from "@/features/discovery/book-circles";
import { featuredListeningEditions } from "@/features/discovery/listening-editions";
import type { SocialCommunityPulseSummary } from "@/lib/backend/types";

function formatSnapshotTime(value: string | null) {
  if (!value) {
    return "No synced activity yet";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "No synced activity yet";
  }

  return date.toLocaleString();
}

export function SocialCommunityPulseCard({
  pulse,
}: {
  pulse: SocialCommunityPulseSummary;
}) {
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
          Community pulse
        </p>
        <h2 className="mt-2 text-xl font-semibold text-stone-900">
          Backend-backed social activity across synced workspaces
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
          This summary is aggregated from durable social activity events, so it reflects
          real saves, joins, reopens, shares, and promoted moments in the backend instead of only the latest
          snapshot per workspace.
        </p>
      </div>
      <div className="grid gap-4 p-6 md:grid-cols-5">
        <article className="rounded-[1.4rem] border border-stone-200 bg-stone-50/80 p-4 shadow-sm">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
            Active workspaces
          </p>
          <p className="mt-3 text-2xl font-semibold text-stone-950">
            {pulse.totalSocialWorkspaces}
          </p>
        </article>
        <article className="rounded-[1.4rem] border border-stone-200 bg-stone-50/80 p-4 shadow-sm">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
            Saved editions
          </p>
          <p className="mt-3 text-2xl font-semibold text-stone-950">
            {pulse.totalSavedEditions}
          </p>
        </article>
        <article className="rounded-[1.4rem] border border-stone-200 bg-stone-50/80 p-4 shadow-sm">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
            Joined circles
          </p>
          <p className="mt-3 text-2xl font-semibold text-stone-950">
            {pulse.totalJoinedCircles}
          </p>
        </article>
        <article className="rounded-[1.4rem] border border-stone-200 bg-stone-50/80 p-4 shadow-sm">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
            Promoted moments
          </p>
          <p className="mt-3 text-2xl font-semibold text-stone-950">
            {pulse.totalPromotedMoments}
          </p>
        </article>
        <article className="rounded-[1.4rem] border border-stone-200 bg-stone-50/80 p-4 shadow-sm">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
            Last synced pulse
          </p>
          <p className="mt-3 text-sm font-semibold text-stone-950">
            {formatSnapshotTime(pulse.lastSyncedAt)}
          </p>
        </article>
      </div>
      <div className="grid gap-4 border-t border-stone-200/80 p-6 md:grid-cols-2">
        <article className="rounded-[1.4rem] border border-stone-200 bg-white p-4 shadow-sm">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
            Most saved edition
          </p>
          <p className="mt-3 text-sm font-semibold text-stone-950">
            {topEdition?.title ?? "No saved editions yet"}
          </p>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            {topEdition && pulse.editionCounts[0]
              ? `${pulse.editionCounts[0].saves} saves, ${pulse.editionCounts[0].reuses} reuses`
              : "Once workspaces start saving editions, this card will show the strongest pull."}
          </p>
        </article>
        <article className="rounded-[1.4rem] border border-stone-200 bg-white p-4 shadow-sm">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
            Most joined circle
          </p>
          <p className="mt-3 text-sm font-semibold text-stone-950">
            {topCircle?.title ?? "No joined circles yet"}
          </p>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            {topCircle && pulse.circleCounts[0]
              ? `${pulse.circleCounts[0].joins} joins, ${pulse.circleCounts[0].shares} shares`
              : "Once workspaces start joining circles, this card will show the strongest shared pull."}
          </p>
        </article>
      </div>
    </section>
  );
}
