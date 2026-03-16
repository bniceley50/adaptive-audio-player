"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { SocialCommunityDetailTimeline } from "@/components/library/social-community-detail-timeline";
import {
  incrementCircleShareCount,
  joinCircleMembership,
  leaveCircleMembership,
  touchCircleMembership,
} from "@/features/social/local-social";
import { useSocialState } from "@/features/social/use-social-state";
import type { FeaturedBookCircle } from "@/features/discovery/book-circles";
import type { FeaturedListeningEdition } from "@/features/discovery/listening-editions";
import type { PublicSocialMoment } from "@/features/social/public-moments";
import type {
  SocialCommunityActivityEventSummary,
  SocialCommunityEditionSummary,
  SocialCommunityCircleSummary,
} from "@/lib/backend/types";
import type { SyncedSocialState } from "@/lib/types/social";

export function SocialCircleDetailCard({
  circle,
  edition,
  editionSummary,
  summary,
  heatBadge,
  recentEvents,
  otherActiveCircles,
  relatedMoments,
  sourceMoment = null,
  entry = null,
  initialSocialState = null,
}: {
  circle: FeaturedBookCircle;
  edition: FeaturedListeningEdition | null;
  editionSummary: SocialCommunityEditionSummary | null;
  summary: SocialCommunityCircleSummary | null;
  heatBadge: string | null;
  recentEvents: SocialCommunityActivityEventSummary[];
  otherActiveCircles: {
    circle: FeaturedBookCircle;
    summary: SocialCommunityCircleSummary | null;
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
  sourceMoment?: PublicSocialMoment | null;
  entry?: string | null;
  initialSocialState?: SyncedSocialState | null;
}) {
  const { circleMemberships } = useSocialState(initialSocialState);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);
  const membership = useMemo(
    () => circleMemberships.find((entry) => entry.circleId === circle.id) ?? null,
    [circle.id, circleMemberships],
  );
  function handleToggleMembership() {
    if (membership) {
      leaveCircleMembership(circle.id);
      setFeedback("Left this circle from your synced social shelf.");
    } else {
      joinCircleMembership(circle.id);
      setFeedback("Joined this circle and saved it to your synced social shelf.");
    }

    window.setTimeout(() => setFeedback(null), 1800);
  }

  async function handleShareCircle() {
    const shareText = `Join the public ${circle.title} for ${circle.bookTitle} in Adaptive Audio Player.`;
    const shareUrl =
      typeof window !== "undefined"
        ? `${window.location.origin}/social/circles/${circle.id}`
        : `/social/circles/${circle.id}`;

    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: `${circle.title} · Public circle`,
          text: shareText,
          url: shareUrl,
        });
        incrementCircleShareCount(circle.id);
        setFeedback("Shared this circle from your synced social shelf.");
        window.setTimeout(() => setFeedback(null), 1800);
        return;
      } catch {
        // Fall through to clipboard.
      }
    }

    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
      incrementCircleShareCount(circle.id);
      setFeedback("Copied this circle link to your clipboard.");
      window.setTimeout(() => setFeedback(null), 1800);
    }
  }

  async function handleReportCircle() {
    setReporting(true);
    setFeedback(null);

    try {
      const response = await fetch("/api/social/report", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          contentKind: "circle",
          contentId: circle.id,
          reason: "needs-review",
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { error?: string; reportCount?: number }
        | null;

      if (!response.ok) {
        setFeedback(payload?.error ?? "Could not send this report.");
      } else {
        setFeedback(
          `Reported for review${payload?.reportCount ? ` · ${payload.reportCount} report${payload.reportCount === 1 ? "" : "s"}` : ""}.`,
        );
      }
    } catch {
      setFeedback("Could not send this report.");
    } finally {
      setReporting(false);
      window.setTimeout(() => setFeedback(null), 2400);
    }
  }

  function handleStartWithEdition() {
    joinCircleMembership(circle.id);
    touchCircleMembership(circle.id);
  }

  return (
    <>
      <section className="rounded-[2rem] border border-stone-200 bg-white/80 p-8 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
              <span className="rounded-full bg-stone-100 px-2.5 py-1">Public circle</span>
              {heatBadge ? (
                <span className="rounded-full bg-violet-50 px-2.5 py-1 text-violet-700">
                  {heatBadge}
                </span>
              ) : null}
              {membership ? (
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">
                  Joined
                </span>
              ) : null}
              {circle.moderationStatus === "review" ? (
                <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">
                  Under review
                </span>
              ) : null}
            </div>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-stone-950">
              {circle.bookTitle}
            </h2>
            {sourceMoment ? (
              <div
                id="moment-led"
                className="mt-4 rounded-[1.2rem] border border-emerald-200 bg-emerald-50/80 px-4 py-4"
              >
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                  {entry === "moment-path" ? "Focused from this moment" : "Focused moment"}
                </p>
                <p className="mt-2 text-sm italic leading-6 text-emerald-950">
                  “{sourceMoment.quote}”
                </p>
                <p className="mt-2 text-sm leading-6 text-emerald-900">
                  This circle is being foregrounded because that moment already points here as the best shared checkpoint.
                </p>
              </div>
            ) : null}
            <p className="mt-3 text-base leading-7 text-stone-600">{circle.summary}</p>
            <p className="mt-3 text-sm leading-6 text-stone-600">
              {circle.vibe}. Hosted by {circle.host}.
            </p>
            {circle.moderationStatus === "review" ? (
              <div className="mt-4 rounded-[1.2rem] border border-amber-200 bg-amber-50/80 px-4 py-4">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-amber-700">
                  Review state
                </p>
                <p className="mt-2 text-sm leading-6 text-amber-900">
                  This circle has {circle.reportCount ?? 0} report{(circle.reportCount ?? 0) === 1 ? "" : "s"} and is being de-emphasized in public discovery until it is reviewed.
                </p>
              </div>
            ) : null}
            {membership ? (
              <div className="mt-4 rounded-[1.2rem] border border-amber-200 bg-amber-50/80 px-4 py-4">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-amber-700">
                  In your synced circles
                </p>
                <p className="mt-2 text-sm leading-6 text-amber-900">
                  {membership.lastOpenedAt
                    ? "You reopened this circle recently, so it can stay near the top of your social discovery."
                    : "You joined this circle and it now travels with your synced social shelf."}
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
              href={`/import?edition=${circle.editionId}`}
              onClick={handleStartWithEdition}
            >
              Start with this edition
            </Link>
            <button
              className="rounded-full border border-stone-300 bg-white px-5 py-3 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
              onClick={handleToggleMembership}
              type="button"
            >
              {membership ? "Leave circle" : "Join circle"}
            </button>
            <button
              className="rounded-full border border-stone-300 bg-white px-5 py-3 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
              onClick={handleShareCircle}
              type="button"
            >
              Share circle
            </button>
            <button
              className="rounded-full border border-stone-300 bg-white px-5 py-3 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={reporting}
              onClick={() => {
                void handleReportCircle();
              }}
              type="button"
            >
              {reporting ? "Reporting..." : "Report circle"}
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
      <section className="grid gap-4 md:grid-cols-4">
        <article className="rounded-[1.4rem] border border-stone-200 bg-white p-5 shadow-sm">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
            Joins
          </p>
          <p className="mt-3 text-2xl font-semibold text-stone-950">{summary?.joins ?? 0}</p>
        </article>
        <article className="rounded-[1.4rem] border border-stone-200 bg-white p-5 shadow-sm">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
            Reopens
          </p>
          <p className="mt-3 text-2xl font-semibold text-stone-950">{summary?.reopens ?? 0}</p>
        </article>
        <article className="rounded-[1.4rem] border border-stone-200 bg-white p-5 shadow-sm">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
            Shares
          </p>
          <p className="mt-3 text-2xl font-semibold text-stone-950">{summary?.shares ?? 0}</p>
        </article>
        <article className="rounded-[1.4rem] border border-stone-200 bg-white p-5 shadow-sm">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
            Checkpoint
          </p>
          <p className="mt-3 text-sm font-semibold text-stone-950">{circle.checkpoint}</p>
        </article>
      </section>
      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <article className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-stone-500">
            Recommended edition
          </p>
          <div className="mt-4 rounded-[1.2rem] border border-stone-200 bg-stone-50/80 p-4">
            <p className="text-sm font-semibold text-stone-950">
              {edition?.title ?? "Edition unavailable"}
            </p>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              {edition
                ? `${edition.narratorName} in ${edition.mode} for ${edition.bookTitle}`
                : "This circle does not have a linked edition yet."}
            </p>
            {edition ? (
              <Link
                className="mt-3 inline-flex rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
                href={`/social/editions/${edition.id}`}
              >
                View edition
              </Link>
            ) : null}
          </div>
        </article>
        <SocialCommunityDetailTimeline
          events={recentEvents}
          emptyCopy="No backend activity yet for this circle."
        />
      </section>
      <section className="grid gap-6 xl:grid-cols-2">
        <article className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-stone-500">
            Edition momentum
          </p>
          <div className="mt-4 rounded-[1.2rem] border border-stone-200 bg-stone-50/80 p-4">
            {edition ? (
              <>
                <p className="text-sm font-semibold text-stone-950">{edition.title}</p>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  {editionSummary
                    ? `${editionSummary.saves} saves and ${editionSummary.reuses} reuses across synced workspaces.`
                    : "No edition activity has been recorded yet for this circle's listening profile."}
                </p>
                <Link
                  className="mt-3 inline-flex rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
                  href={`/social/editions/${edition.id}`}
                >
                  Open edition page
                </Link>
              </>
            ) : (
              <p className="text-sm leading-6 text-stone-600">
                This circle does not have a linked edition yet.
              </p>
            )}
          </div>
        </article>
        <article className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-stone-500">
            Also active now
          </p>
          <div className="mt-4 space-y-3">
            {otherActiveCircles.map((entry) => (
              <div
                key={entry.circle.id}
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
                      {entry.summary.joins} joins
                    </span>
                  ) : null}
                </div>
                <p className="mt-3 text-sm font-semibold text-stone-950">
                  {entry.circle.title}
                </p>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  {entry.circle.bookTitle} · {entry.circle.checkpoint}
                </p>
                <Link
                  className="mt-3 inline-flex rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
                  href={`/social/circles/${entry.circle.id}`}
                >
                  View circle
                </Link>
              </div>
            ))}
          </div>
        </article>
        <article className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-stone-500">
            Circle moments
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
