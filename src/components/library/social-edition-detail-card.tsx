"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { SocialCommunityDetailTimeline } from "@/components/library/social-community-detail-timeline";
import { touchSavedListeningEdition, toggleSavedListeningEdition } from "@/features/social/local-social";
import { useSocialState } from "@/features/social/use-social-state";
import type { FeaturedBookCircle } from "@/features/discovery/book-circles";
import type { FeaturedListeningEdition } from "@/features/discovery/listening-editions";
import type {
  SocialCommunityActivityEventSummary,
  SocialCommunityEditionSummary,
} from "@/lib/backend/types";
import type { SyncedSocialState } from "@/lib/types/social";

export function SocialEditionDetailCard({
  edition,
  relatedCircles,
  summary,
  heatBadge,
  recentEvents,
  relatedCircleSummary,
  otherActiveEditions,
  relatedMoments,
  initialSocialState = null,
}: {
  edition: FeaturedListeningEdition;
  relatedCircles: FeaturedBookCircle[];
  summary: SocialCommunityEditionSummary | null;
  heatBadge: string | null;
  recentEvents: SocialCommunityActivityEventSummary[];
  relatedCircleSummary: {
    totalJoins: number;
    totalShares: number;
    strongestCircle: {
      circle: FeaturedBookCircle;
      joins: number;
      shares: number;
      score: number;
    } | null;
  };
  otherActiveEditions: {
    edition: FeaturedListeningEdition;
    summary: SocialCommunityEditionSummary | null;
    heatBadge: string | null;
    score: number;
  }[];
  relatedMoments: {
    id: string;
    chapterLabel: string;
    quote: string;
    moodLabel: string;
    source: "curated" | "promoted";
  }[];
  initialSocialState?: SyncedSocialState | null;
}) {
  const { savedEditions } = useSocialState(initialSocialState);
  const [feedback, setFeedback] = useState<string | null>(null);
  const savedEdition = useMemo(
    () => savedEditions.find((entry) => entry.editionId === edition.id) ?? null,
    [edition.id, savedEditions],
  );
  function handleToggleSave() {
    const wasSaved = Boolean(savedEdition);
    toggleSavedListeningEdition(edition.id);
    setFeedback(wasSaved ? "Removed from your synced social shelf." : "Saved to your synced social shelf.");
    window.setTimeout(() => setFeedback(null), 1800);
  }

  function handleUseEdition() {
    touchSavedListeningEdition(edition.id);
  }

  return (
    <>
      <section className="rounded-[2rem] border border-stone-200 bg-white/80 p-8 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
              <span className="rounded-full bg-stone-100 px-2.5 py-1">Public edition</span>
              <span className="rounded-full bg-stone-100 px-2.5 py-1 capitalize">
                {edition.mode}
              </span>
              {heatBadge ? (
                <span className="rounded-full bg-violet-50 px-2.5 py-1 text-violet-700">
                  {heatBadge}
                </span>
              ) : null}
              {savedEdition ? (
                <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">
                  Saved
                </span>
              ) : null}
            </div>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-stone-950">
              {edition.narratorName} for {edition.bookTitle}
            </h2>
            <p className="mt-3 text-base leading-7 text-stone-600">{edition.note}</p>
            <p className="mt-3 text-sm leading-6 text-stone-600">
              Best for {edition.bestFor}. Created by {edition.creator}.
            </p>
            {savedEdition ? (
              <div className="mt-4 rounded-[1.2rem] border border-amber-200 bg-amber-50/80 px-4 py-4">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-amber-700">
                  In your synced shelf
                </p>
                <p className="mt-2 text-sm leading-6 text-amber-900">
                  {savedEdition.lastUsedAt
                    ? "You already reused this edition, so it can shape ranking across your workspaces."
                    : "You saved this edition, so it stays ready across devices and workspaces."}
                </p>
              </div>
            ) : null}
            {feedback ? (
              <p className="mt-4 text-sm font-medium text-emerald-700">{feedback}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              className="rounded-full bg-stone-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-stone-800"
              href={`/import?edition=${edition.id}`}
              onClick={handleUseEdition}
            >
              Start with this edition
            </Link>
            <button
              className="rounded-full border border-stone-300 bg-white px-5 py-3 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
              onClick={handleToggleSave}
              type="button"
            >
              {savedEdition ? "Unsave edition" : "Save edition"}
            </button>
            <Link
              className="rounded-full border border-stone-300 bg-white px-5 py-3 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
              href="/social"
            >
              Back to social
            </Link>
          </div>
        </div>
      </section>
      <section className="grid gap-4 md:grid-cols-3">
        <article className="rounded-[1.4rem] border border-stone-200 bg-white p-5 shadow-sm">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
            Saves
          </p>
          <p className="mt-3 text-2xl font-semibold text-stone-950">{summary?.saves ?? 0}</p>
        </article>
        <article className="rounded-[1.4rem] border border-stone-200 bg-white p-5 shadow-sm">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
            Reuses
          </p>
          <p className="mt-3 text-2xl font-semibold text-stone-950">{summary?.reuses ?? 0}</p>
        </article>
        <article className="rounded-[1.4rem] border border-stone-200 bg-white p-5 shadow-sm">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
            Related circles
          </p>
          <p className="mt-3 text-2xl font-semibold text-stone-950">
            {relatedCircles.length}
          </p>
        </article>
      </section>
      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <article className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-stone-500">
            Public circles using this edition
          </p>
          <div className="mt-4 space-y-3">
            {relatedCircles.map((circle) => (
              <div
                key={circle.id}
                className="rounded-[1.2rem] border border-stone-200 bg-stone-50/80 p-4"
              >
                <p className="text-sm font-semibold text-stone-950">{circle.title}</p>
                <p className="mt-2 text-sm leading-6 text-stone-600">{circle.checkpoint}</p>
                <Link
                  className="mt-3 inline-flex rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
                  href={`/social/circles/${circle.id}`}
                >
                  View circle
                </Link>
              </div>
            ))}
          </div>
        </article>
        <SocialCommunityDetailTimeline
          events={recentEvents}
          emptyCopy="No backend activity yet for this edition."
        />
      </section>
      <section className="grid gap-6 xl:grid-cols-2">
        <article className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-stone-500">
            Community path
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-[1.2rem] border border-stone-200 bg-stone-50/80 p-4">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
                Circle joins around this edition
              </p>
              <p className="mt-3 text-2xl font-semibold text-stone-950">
                {relatedCircleSummary.totalJoins}
              </p>
              <p className="mt-2 text-sm leading-6 text-stone-600">
                {relatedCircleSummary.totalShares} community share
                {relatedCircleSummary.totalShares === 1 ? "" : "s"} have flowed through circles using this edition.
              </p>
            </div>
            <div className="rounded-[1.2rem] border border-stone-200 bg-stone-50/80 p-4">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
                Most active companion circle
              </p>
              {relatedCircleSummary.strongestCircle ? (
                <>
                  <p className="mt-3 text-sm font-semibold text-stone-950">
                    {relatedCircleSummary.strongestCircle.circle.title}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-stone-600">
                    {relatedCircleSummary.strongestCircle.joins} joins
                    {relatedCircleSummary.strongestCircle.shares > 0
                      ? ` · ${relatedCircleSummary.strongestCircle.shares} shares`
                      : ""}
                  </p>
                  <Link
                    className="mt-3 inline-flex rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
                    href={`/social/circles/${relatedCircleSummary.strongestCircle.circle.id}`}
                  >
                    Open circle
                  </Link>
                </>
              ) : (
                <p className="mt-3 text-sm leading-6 text-stone-600">
                  No circle activity has been recorded for this edition yet.
                </p>
              )}
            </div>
          </div>
        </article>
        <article className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-stone-500">
            Also active now
          </p>
          <div className="mt-4 space-y-3">
            {otherActiveEditions.map((entry) => (
              <div
                key={entry.edition.id}
                className="rounded-[1.2rem] border border-stone-200 bg-stone-50/80 p-4"
              >
                <div className="flex flex-wrap items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
                  {entry.heatBadge ? (
                    <span className="rounded-full bg-violet-50 px-2.5 py-1 text-violet-700">
                      {entry.heatBadge}
                    </span>
                  ) : null}
                  {entry.summary ? (
                    <span className="rounded-full bg-sky-50 px-2.5 py-1 text-sky-700">
                      {entry.summary.saves} saves
                    </span>
                  ) : null}
                </div>
                <p className="mt-3 text-sm font-semibold text-stone-950">
                  {entry.edition.title}
                </p>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  {entry.edition.narratorName} for {entry.edition.bookTitle}
                </p>
                <Link
                  className="mt-3 inline-flex rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
                  href={`/social/editions/${entry.edition.id}`}
                >
                  View edition
                </Link>
              </div>
            ))}
          </div>
        </article>
        <article className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-stone-500">
            Featured moments
          </p>
          <div className="mt-4 space-y-3">
            {relatedMoments.map((moment) => (
              <div
                key={moment.id}
                className="rounded-[1.2rem] border border-stone-200 bg-stone-50/80 p-4"
              >
                <div className="flex flex-wrap items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
                  <span>{moment.chapterLabel}</span>
                  {moment.source === "promoted" ? (
                    <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">
                      From your player
                    </span>
                  ) : null}
                </div>
                <p className="mt-3 text-sm italic leading-6 text-stone-700">“{moment.quote}”</p>
                <Link
                  className="mt-3 inline-flex rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
                  href={`/social/moments/${moment.id}`}
                >
                  View moment
                </Link>
              </div>
            ))}
          </div>
        </article>
      </section>
    </>
  );
}
