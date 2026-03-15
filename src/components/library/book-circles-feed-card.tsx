"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { getAllPublicBookCircles } from "@/features/discovery/book-circles";
import {
  getCircleDiscoveryReason,
  getRelativeDiscoveryBadge,
} from "@/features/discovery/personalization";
import {
  getCircleCommunityHeat,
  getCommunityHeatBadge,
} from "@/features/social/community-heat";
import {
  incrementCircleShareCount,
  joinCircleMembership,
  leaveCircleMembership,
  touchCircleMembership,
} from "@/features/social/local-social";
import {
  toggleJoinedCircle,
  togglePinnedDiscoverySignal,
} from "@/features/discovery/local-discovery";
import { featuredListeningEditions } from "@/features/discovery/listening-editions";
import { useDiscoveryPreferences } from "@/features/discovery/use-discovery-preferences";
import { useSocialState } from "@/features/social/use-social-state";
import type {
  SocialCommunityActivityEventSummary,
  SocialCommunityPulseSummary,
} from "@/lib/backend/types";
import type { SyncedSocialState } from "@/lib/types/social";

function getCircleActivityTime(
  entry:
    | {
        joinedAt?: string;
        lastOpenedAt?: string | null;
      }
    | undefined,
) {
  return new Date(entry?.lastOpenedAt ?? entry?.joinedAt ?? 0).getTime();
}

export function BookCirclesFeedCard({
  initialSocialState = null,
  communityPulse = null,
  communityEvents = null,
}: {
  initialSocialState?: SyncedSocialState | null;
  communityPulse?: SocialCommunityPulseSummary | null;
  communityEvents?: SocialCommunityActivityEventSummary[] | null;
}) {
  const searchParams = useSearchParams();
  const preferences = useDiscoveryPreferences();
  const { circleMemberships, createdCircles } = useSocialState(initialSocialState);
  const { joinedCircleTimestamps, personalizationPaused } = preferences;
  const effectivePreferences = useMemo(
    () => ({
      ...preferences,
      followedAuthors: personalizationPaused ? [] : preferences.followedAuthors,
      joinedCircles: personalizationPaused ? [] : preferences.joinedCircles,
      pinnedDiscoverySignal: personalizationPaused ? null : preferences.pinnedDiscoverySignal,
      trackedPlannedFeatures: personalizationPaused ? [] : preferences.trackedPlannedFeatures,
    }),
    [preferences, personalizationPaused],
  );
  const { joinedCircles, pinnedDiscoverySignal } = effectivePreferences;
  const [sharedCircleId, setSharedCircleId] = useState<string | null>(null);
  const highlightedCircleId = searchParams.get("circle");
  const circleHeat = useMemo(
    () => getCircleCommunityHeat(communityEvents),
    [communityEvents],
  );
  const allCircles = useMemo(
    () =>
      getAllPublicBookCircles({
        savedEditions: [],
        circleMemberships: [],
        createdCircles,
        promotedMoments: [],
      }, communityEvents ?? []),
    [communityEvents, createdCircles],
  );

  const circles = useMemo(
    () =>
      allCircles
        .map((circle) => ({
          ...circle,
          edition:
            featuredListeningEditions.find((edition) => edition.id === circle.editionId) ?? null,
        }))
        .sort((left, right) => {
          const leftHighlighted = highlightedCircleId === left.id ? 1 : 0;
          const rightHighlighted = highlightedCircleId === right.id ? 1 : 0;
          if (leftHighlighted !== rightHighlighted) {
            return rightHighlighted - leftHighlighted;
          }
          const leftPinned =
            pinnedDiscoverySignal?.kind === "circle" && pinnedDiscoverySignal.id === left.id ? 1 : 0;
          const rightPinned =
            pinnedDiscoverySignal?.kind === "circle" && pinnedDiscoverySignal.id === right.id ? 1 : 0;
          if (leftPinned !== rightPinned) {
            return rightPinned - leftPinned;
          }
          const leftMembership = circleMemberships.find((entry) => entry.circleId === left.id);
          const rightMembership = circleMemberships.find((entry) => entry.circleId === right.id);
          const leftMembershipScore = leftMembership ? 1 : 0;
          const rightMembershipScore = rightMembership ? 1 : 0;
          if (leftMembershipScore !== rightMembershipScore) {
            return rightMembershipScore - leftMembershipScore;
          }
          const activityDelta =
            getCircleActivityTime(rightMembership) - getCircleActivityTime(leftMembership);
          if (activityDelta !== 0) {
            return activityDelta;
          }
          const leftJoined = joinedCircles.includes(left.id) ? 1 : 0;
          const rightJoined = joinedCircles.includes(right.id) ? 1 : 0;
          if (leftJoined !== rightJoined) {
            return rightJoined - leftJoined;
          }

          const leftHeat = circleHeat.get(left.id);
          const rightHeat = circleHeat.get(right.id);
          const leftHeatScore = leftHeat?.score ?? 0;
          const rightHeatScore = rightHeat?.score ?? 0;
          if (leftHeatScore !== rightHeatScore) {
            return rightHeatScore - leftHeatScore;
          }

          const leftCommunity = communityPulse?.circleCounts.find(
            (entry) => entry.circleId === left.id,
          );
          const rightCommunity = communityPulse?.circleCounts.find(
            (entry) => entry.circleId === right.id,
          );
          const leftCommunityScore =
            (leftCommunity?.joins ?? 0) * 10 +
            (leftCommunity?.reopens ?? 0) * 3 +
            (leftCommunity?.shares ?? 0);
          const rightCommunityScore =
            (rightCommunity?.joins ?? 0) * 10 +
            (rightCommunity?.reopens ?? 0) * 3 +
            (rightCommunity?.shares ?? 0);
          return rightCommunityScore - leftCommunityScore;
        }),
    [
      circleHeat,
      circleMemberships,
      allCircles,
      communityPulse,
      highlightedCircleId,
      joinedCircles,
      pinnedDiscoverySignal,
    ],
  );

  async function shareCircle(circleId: string, title: string, bookTitle: string) {
    const shareText = `Join the public ${title} for ${bookTitle} in Adaptive Audio Player.`;
    const shareUrl =
      typeof window !== "undefined"
        ? `${window.location.origin}/import?edition=${allCircles.find((circle) => circle.id === circleId)?.editionId ?? ""}`
        : "https://github.com/bniceley50/adaptive-audio-player";

    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: `${title} · Public circle`,
          text: shareText,
          url: shareUrl,
        });
        incrementCircleShareCount(circleId);
        setSharedCircleId(circleId);
        window.setTimeout(() => setSharedCircleId(null), 1800);
        return;
      } catch {
        // fall through to clipboard
      }
    }

    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
      incrementCircleShareCount(circleId);
      setSharedCircleId(circleId);
      window.setTimeout(() => setSharedCircleId(null), 1800);
    }
  }

  return (
    <section className="overflow-hidden rounded-[2rem] border border-stone-200/80 bg-white shadow-[0_22px_60px_-42px_rgba(28,25,23,0.4)]">
      <div className="border-b border-stone-200/80 bg-[linear-gradient(135deg,#fffdf7_0%,#f7f3ea_52%,#eef4ff_100%)] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-stone-500">
              Public book circles
            </p>
            <h2 className="mt-2 text-xl font-semibold text-stone-900">
              Join a serious listening group in one tap
            </h2>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              Start from a public circle with a recommended edition, a clear weekly
              checkpoint, and a title people are already moving through together.
            </p>
            {highlightedCircleId ? (
              <p className="mt-2 text-sm leading-6 text-amber-700">
                Focused from a trending circle pick so you can land on the exact group that
                brought you here.
              </p>
            ) : null}
            {personalizationPaused ? (
              <p className="mt-2 text-sm leading-6 text-sky-700">
                Personalization is paused, so public circles are shown in neutral order.
              </p>
            ) : null}
          </div>
          <div className="rounded-[1.2rem] border border-stone-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.22em] text-stone-500">
              Open circles
            </p>
            <p className="mt-2 text-base font-semibold text-stone-950">{circles.length}</p>
          </div>
        </div>
      </div>
      <div className="grid gap-4 p-6 xl:grid-cols-3">
        {circles.map((circle) => {
          const joined = joinedCircles.includes(circle.id);
          const membership = circleMemberships.find((entry) => entry.circleId === circle.id);
          const communitySummary =
            communityPulse?.circleCounts.find((entry) => entry.circleId === circle.id) ?? null;
          const highlighted = highlightedCircleId === circle.id;
          const pinned =
            pinnedDiscoverySignal?.kind === "circle" && pinnedDiscoverySignal.id === circle.id;
          const freshnessBadge = getRelativeDiscoveryBadge(joinedCircleTimestamps[circle.id]);

          return (
            <article
              id={`circle-${circle.id}`}
              key={circle.id}
              className={`rounded-[1.5rem] p-5 shadow-sm ${
                highlighted
                  ? "border-2 border-amber-300 bg-[linear-gradient(180deg,#fff7ed_0%,#ffffff_100%)] shadow-[0_24px_60px_-40px_rgba(180,83,9,0.35)]"
                  : "border border-stone-200 bg-[linear-gradient(180deg,#fafaf9_0%,#ffffff_100%)]"
              }`}
            >
              {(() => {
                const heat = circleHeat.get(circle.id);
                const badge = getCommunityHeatBadge(heat);
                return badge ? (
                  <div className="mb-4 rounded-[1.1rem] border border-violet-200 bg-violet-50/80 px-4 py-3">
                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-violet-700">
                      {badge}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-violet-900">
                      Backend event history shows fresh community momentum around this circle.
                    </p>
                  </div>
                ) : null;
              })()}
              {highlighted ? (
                <div className="mb-4 rounded-[1.1rem] border border-amber-200 bg-amber-50/80 px-4 py-3">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-amber-700">
                    Focused from trending now
                  </p>
                  <p className="mt-2 text-sm leading-6 text-amber-900">
                    This circle was selected from the home trending strip so you can jump
                    straight into the most relevant public listening group.
                  </p>
                </div>
              ) : null}
              {communitySummary ? (
                <div className="mb-4 rounded-[1.1rem] border border-sky-200 bg-sky-50/80 px-4 py-3">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-sky-700">
                    Community pulse
                  </p>
                  <p className="mt-2 text-sm leading-6 text-sky-900">
                    {communitySummary.joins} join
                    {communitySummary.joins === 1 ? "" : "s"} across synced workspaces
                    {communitySummary.shares > 0
                      ? `, ${communitySummary.shares} share${
                          communitySummary.shares === 1 ? "" : "s"
                        }`
                      : ""}
                    .
                  </p>
                </div>
              ) : null}
              {(() => {
                const reason = getCircleDiscoveryReason(circle.id, effectivePreferences);
                return reason ? (
                  <div className="mb-4 rounded-[1.1rem] border border-emerald-200 bg-emerald-50/80 px-4 py-3">
                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                      {reason.label}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-emerald-900">{reason.detail}</p>
                  </div>
                ) : membership ? (
                  <div className="mb-4 rounded-[1.1rem] border border-amber-200 bg-amber-50/80 px-4 py-3">
                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-amber-700">
                      From your synced circles
                    </p>
                    <p className="mt-2 text-sm leading-6 text-amber-900">
                      {membership.lastOpenedAt
                        ? "You already reopened this circle, so it stays near the top of discovery."
                        : "You joined this circle before, so it stays ready across devices and workspaces."}
                    </p>
                  </div>
                ) : null;
              })()}
              <div className="flex flex-wrap items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
                <span className="rounded-full bg-stone-100 px-2.5 py-1">Public</span>
                <span className="rounded-full bg-stone-100 px-2.5 py-1">
                  {circle.memberCount} listeners
                </span>
                {joined ? (
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">
                    Joined
                  </span>
                ) : null}
                {membership?.shareCount ? (
                  <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">
                    {membership.shareCount} share{membership.shareCount === 1 ? "" : "s"}
                  </span>
                ) : null}
                {communitySummary ? (
                  <span className="rounded-full bg-sky-50 px-2.5 py-1 text-sky-700">
                    {communitySummary.joins} joins
                  </span>
                ) : null}
                {(() => {
                  const badge = getCommunityHeatBadge(circleHeat.get(circle.id));
                  return badge ? (
                    <span className="rounded-full bg-violet-50 px-2.5 py-1 text-violet-700">
                      {badge}
                    </span>
                  ) : null;
                })()}
                {highlighted ? (
                  <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">
                    Highlighted
                  </span>
                ) : null}
                {pinned ? (
                  <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">
                    Pinned
                  </span>
                ) : null}
                {freshnessBadge ? (
                  <span className="rounded-full bg-sky-50 px-2.5 py-1 text-sky-700">
                    {freshnessBadge}
                  </span>
                ) : null}
                {circle.edition ? (
                  <span className="rounded-full bg-stone-100 px-2.5 py-1 capitalize">
                    {circle.edition.mode}
                  </span>
                ) : null}
              </div>
              <h3 className="mt-3 text-lg font-semibold text-stone-950">{circle.title}</h3>
              <p className="mt-2 text-sm leading-6 text-stone-600">{circle.summary}</p>
              <div className="mt-4 rounded-[1.2rem] border border-stone-200 bg-white px-4 py-4">
                <p className="text-[0.65rem] font-medium uppercase tracking-[0.22em] text-stone-500">
                  Current checkpoint
                </p>
                <p className="mt-2 text-sm font-medium text-stone-900">{circle.checkpoint}</p>
                <p className="mt-2 text-sm leading-6 text-stone-600">{circle.vibe}</p>
              </div>
              {circle.edition ? (
                <p className="mt-4 text-sm leading-6 text-stone-600">
                  Start with <span className="font-medium">{circle.edition.title}</span> by{" "}
                  {circle.host}.
                </p>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  className="rounded-full bg-stone-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-800"
                  type="button"
                  onClick={() => {
                    toggleJoinedCircle(circle.id);
                    if (joined) {
                      leaveCircleMembership(circle.id);
                    } else {
                      joinCircleMembership(circle.id);
                    }
                  }}
                >
                  {joined ? "Joined" : "Join circle"}
                </button>
                <Link
                  className="rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
                  href={`/social/circles/${circle.id}`}
                  onClick={() => {
                    touchCircleMembership(circle.id);
                  }}
                >
                  View circle
                </Link>
                <button
                  className="rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
                  type="button"
                  onClick={() => {
                    joinCircleMembership(circle.id);
                    void shareCircle(circle.id, circle.title, circle.bookTitle);
                  }}
                >
                  {sharedCircleId === circle.id ? "Shared" : "Share circle"}
                </button>
                <button
                  className="rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
                  type="button"
                  onClick={() => {
                    togglePinnedDiscoverySignal({
                      kind: "circle",
                      id: circle.id,
                    });
                  }}
                >
                  {pinned ? "Unpin circle" : "Pin circle"}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
