import Link from "next/link";
import {
  getPublicMomentsFeed,
  type PublicSocialMoment,
} from "@/features/social/public-moments";
import type {
  SocialCommunityActivityEventSummary,
  SocialCommunityPulseSummary,
} from "@/lib/backend/types";
import type { SyncedSocialState } from "@/lib/types/social";

export function SocialMomentsFeedCard({
  pulse,
  events,
  socialState = null,
  focusedMomentId = null,
  persistentMoments = [],
}: {
  pulse: SocialCommunityPulseSummary;
  events: SocialCommunityActivityEventSummary[];
  socialState?: SyncedSocialState | null;
  focusedMomentId?: string | null;
  persistentMoments?: PublicSocialMoment[];
}) {
  const moments = getPublicMomentsFeed(pulse, events, socialState, [], persistentMoments)
    .sort((left, right) => {
      const leftReview = left.moment.moderationStatus === "review" ? 1 : 0;
      const rightReview = right.moment.moderationStatus === "review" ? 1 : 0;
      if (leftReview !== rightReview) {
        return leftReview - rightReview;
      }
      if (left.moment.id === focusedMomentId) {
        return -1;
      }

      if (right.moment.id === focusedMomentId) {
        return 1;
      }

      return 0;
    })
    .slice(0, 3);

  if (moments.length === 0) {
    return null;
  }

  return (
    <section className="overflow-hidden rounded-[2rem] border border-stone-200/80 bg-white shadow-[0_22px_60px_-42px_rgba(28,25,23,0.4)]">
      <div className="border-b border-stone-200/80 bg-[linear-gradient(135deg,#fff8f1_0%,#ffffff_54%,#eef4ff_100%)] p-6">
        <p className="text-xs font-medium uppercase tracking-[0.22em] text-stone-500">
          Shared highlights
        </p>
        <h2 className="mt-2 text-xl font-semibold text-stone-900">
          Memorable lines people keep passing around
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
          Shared highlights tie a quote to a listening version and a live group, so the
          community layer has something richer than counts and joins.
        </p>
      </div>
      <div className="grid gap-4 p-6 xl:grid-cols-3">
        {moments.map(({ moment, edition, circle, activity }) => (
          <article
            key={moment.id}
            id={`moment-${moment.id}`}
            className="rounded-[1.5rem] border border-stone-200 bg-[linear-gradient(180deg,#fafaf9_0%,#ffffff_100%)] p-5 shadow-sm"
          >
            <div className="flex flex-wrap items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
              <span className="rounded-full bg-stone-100 px-2.5 py-1">{moment.moodLabel}</span>
              {moment.source === "promoted" ? (
                <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">
                  From your player
                </span>
              ) : null}
              {moment.id === focusedMomentId ? (
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">
                  Focused now
                </span>
              ) : null}
              {activity.heatBadge ? (
                <span className="rounded-full bg-violet-50 px-2.5 py-1 text-violet-700">
                  {activity.heatBadge}
                </span>
              ) : null}
              {moment.moderationStatus === "review" ? (
                <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">
                  Review
                </span>
              ) : null}
            </div>
            <p className="mt-4 text-base font-medium italic leading-7 text-stone-950">
              “{moment.quote}”
            </p>
            <p className="mt-3 text-sm leading-6 text-stone-600">{moment.curatorNote}</p>
            {moment.moderationStatus === "review" ? (
              <p className="mt-3 text-sm leading-6 text-amber-800">
                Community reports have flagged this moment for review, so it is shown lower than healthy public moments.
              </p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">
                {activity.momentSummary?.promotions ?? 0} promotions
              </span>
              {moment.moderationStatus === "review" ? (
                <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">
                  {moment.reportCount ?? 0} report{(moment.reportCount ?? 0) === 1 ? "" : "s"}
                </span>
              ) : null}
              <span className="rounded-full bg-sky-50 px-2.5 py-1 text-sky-700">
                {activity.editionSummary?.saves ?? 0} saves
              </span>
              <span className="rounded-full bg-sky-50 px-2.5 py-1 text-sky-700">
                {activity.circleSummary?.joins ?? 0} joins
              </span>
              <span className="rounded-full bg-stone-100 px-2.5 py-1">
                {moment.chapterLabel}
              </span>
            </div>
            <div className="mt-4 space-y-2 text-sm text-stone-600">
              {moment.ownerLabel ? <p>Shared by {moment.ownerLabel}</p> : null}
              <p>{edition ? `${edition.title} · ${edition.narratorName}` : "No linked version yet"}</p>
              <p>{circle ? `${circle.title}` : "No linked group yet"}</p>
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                className="rounded-full bg-stone-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-800"
                href={`/social/moments/${moment.id}`}
              >
                View highlight
              </Link>
              {circle ? (
                <Link
                  className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
                  href={`/social/circles/${circle.id}`}
                >
                  Open group
                </Link>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
