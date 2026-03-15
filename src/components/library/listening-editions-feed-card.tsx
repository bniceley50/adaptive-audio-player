"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getAllPublicBookCircles } from "@/features/discovery/book-circles";
import {
  getEditionDiscoveryReason,
  getRelativeDiscoveryBadge,
} from "@/features/discovery/personalization";
import {
  getCommunityHeatBadge,
  getEditionCommunityHeat,
} from "@/features/social/community-heat";
import { useDiscoveryPreferences } from "@/features/discovery/use-discovery-preferences";
import {
  socialStateChangedEvent,
  toggleSavedListeningEdition,
  touchSavedListeningEdition,
} from "@/features/social/local-social";
import { useSocialState } from "@/features/social/use-social-state";
import type {
  SocialCommunityActivityEventSummary,
  SocialCommunityPulseSummary,
} from "@/lib/backend/types";
import type { SyncedSocialState } from "@/lib/types/social";
import {
  defaultTasteChangedEvent,
  listeningProfileChangedEvent,
  readLocalLibraryBook,
  readLocalListeningProfiles,
  writeDefaultListeningProfile,
} from "@/lib/library/local-library";
import { workspaceContextChangedEvent } from "@/lib/library/local-state";
import {
  featuredListeningEditions,
  type FeaturedListeningEdition,
} from "@/features/discovery/listening-editions";

type FeedEdition = FeaturedListeningEdition & {
  source: "community" | "library";
  bookId: string | null;
};

function getEditionActivityTime(
  entry:
    | {
        savedAt?: string;
        lastUsedAt?: string | null;
      }
    | undefined,
) {
  return new Date(entry?.lastUsedAt ?? entry?.savedAt ?? 0).getTime();
}

function readLibraryEditions(): FeedEdition[] {
  return readLocalListeningProfiles()
    .slice(0, 2)
    .map((profile, index) => {
      const book = readLocalLibraryBook(profile.bookId);
      const mode = (profile.mode === "ambient" || profile.mode === "immersive"
        ? profile.mode
        : "classic") satisfies FeaturedListeningEdition["mode"];

      return {
        id: `library-${profile.bookId}`,
        title: `${profile.narratorName} ${profile.mode} edition`,
        creator: "From your library",
        narratorName: profile.narratorName,
        mode,
        bookTitle: book?.title ?? `Book ${index + 1}`,
        genreLabel: book?.genreLabel ?? "Personal library",
        bestFor: "bringing a taste you already trust into the next book quickly",
        note: "This edition comes from a book you already tuned and listened to.",
        source: "library",
        bookId: profile.bookId,
      };
    });
}

export function ListeningEditionsFeedCard({
  initialSocialState = null,
  communityPulse = null,
  communityEvents = null,
  initialPublicCircles = null,
}: {
  initialSocialState?: SyncedSocialState | null;
  communityPulse?: SocialCommunityPulseSummary | null;
  communityEvents?: SocialCommunityActivityEventSummary[] | null;
  initialPublicCircles?: ReturnType<typeof getAllPublicBookCircles> | null;
}) {
  const preferences = useDiscoveryPreferences();
  const { savedEditions, createdCircles, promotedMoments } = useSocialState(initialSocialState);
  const { followedAuthorTimestamps, joinedCircleTimestamps, personalizationPaused } = preferences;
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
  const joinedCircles = effectivePreferences.joinedCircles;
  const [feedbackId, setFeedbackId] = useState<string | null>(null);
  const [libraryEditions, setLibraryEditions] = useState<FeedEdition[]>(() =>
    typeof window === "undefined" ? [] : readLibraryEditions(),
  );
  const editionHeat = useMemo(
    () => getEditionCommunityHeat(communityEvents),
    [communityEvents],
  );
  const allCircles = useMemo(
    () =>
      getAllPublicBookCircles(
        {
          savedEditions,
          circleMemberships: [],
          createdCircles,
          promotedMoments,
        },
        communityEvents ?? [],
        initialPublicCircles ?? [],
      ),
    [communityEvents, createdCircles, initialPublicCircles, promotedMoments, savedEditions],
  );

  useEffect(() => {
    function refresh() {
      setLibraryEditions(readLibraryEditions());
    }

    refresh();
    window.addEventListener(listeningProfileChangedEvent, refresh);
    window.addEventListener(defaultTasteChangedEvent, refresh);
    window.addEventListener(workspaceContextChangedEvent, refresh);
    window.addEventListener(socialStateChangedEvent, refresh);

    return () => {
      window.removeEventListener(listeningProfileChangedEvent, refresh);
      window.removeEventListener(defaultTasteChangedEvent, refresh);
      window.removeEventListener(workspaceContextChangedEvent, refresh);
      window.removeEventListener(socialStateChangedEvent, refresh);
    };
  }, []);

  const editions = useMemo<FeedEdition[]>(() => {
    const curated = featuredListeningEditions.map((edition) => ({
      ...edition,
      source: "community" as const,
      bookId: null,
    }));

    const joinedEditionIds = allCircles
      .filter((circle) => joinedCircles.includes(circle.id))
      .map((circle) => circle.editionId);

    return [...libraryEditions, ...curated]
      .sort((left, right) => {
        const leftSaved = savedEditions.find((entry) => entry.editionId === left.id);
        const rightSaved = savedEditions.find((entry) => entry.editionId === right.id);
        const leftSavedScore = leftSaved ? 1 : 0;
        const rightSavedScore = rightSaved ? 1 : 0;
        if (leftSavedScore !== rightSavedScore) {
          return rightSavedScore - leftSavedScore;
        }

        const activityDelta =
          getEditionActivityTime(rightSaved) - getEditionActivityTime(leftSaved);
        if (activityDelta !== 0) {
          return activityDelta;
        }

        const leftJoined = joinedEditionIds.includes(left.id) ? 1 : 0;
        const rightJoined = joinedEditionIds.includes(right.id) ? 1 : 0;
        if (leftJoined !== rightJoined) {
          return rightJoined - leftJoined;
        }

        const leftHeat = editionHeat.get(left.id);
        const rightHeat = editionHeat.get(right.id);
        const leftHeatScore = leftHeat?.score ?? 0;
        const rightHeatScore = rightHeat?.score ?? 0;
        if (leftHeatScore !== rightHeatScore) {
          return rightHeatScore - leftHeatScore;
        }

        const leftCommunity = communityPulse?.editionCounts.find(
          (entry) => entry.editionId === left.id,
        );
        const rightCommunity = communityPulse?.editionCounts.find(
          (entry) => entry.editionId === right.id,
        );
        const leftCommunityScore = (leftCommunity?.saves ?? 0) * 10 + (leftCommunity?.reuses ?? 0);
        const rightCommunityScore =
          (rightCommunity?.saves ?? 0) * 10 + (rightCommunity?.reuses ?? 0);
        if (leftCommunityScore !== rightCommunityScore) {
          return rightCommunityScore - leftCommunityScore;
        }

        return 0;
      })
      .slice(0, 4);
  }, [allCircles, communityPulse, editionHeat, joinedCircles, libraryEditions, savedEditions]);

  return (
    <section className="overflow-hidden rounded-[2rem] border border-stone-200/80 bg-white shadow-[0_22px_60px_-42px_rgba(28,25,23,0.4)]">
      <div className="border-b border-stone-200/80 bg-[linear-gradient(135deg,#fffdf7_0%,#f7f3ea_52%,#eef4ff_100%)] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-stone-500">
              Listening editions feed
            </p>
            <h2 className="mt-2 text-xl font-semibold text-stone-900">
              Borrow a sound that already works
            </h2>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              Start with a community-ready or library-proven listening edition, then
              make it your default in one tap.
            </p>
            {personalizationPaused ? (
              <p className="mt-2 text-sm leading-6 text-sky-700">
                Personalization is paused, so this feed is using neutral ordering.
              </p>
            ) : null}
          </div>
          <div className="rounded-[1.2rem] border border-stone-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.22em] text-stone-500">
              Discoverable now
            </p>
            <p className="mt-2 text-base font-semibold text-stone-950">
              {editions.length} edition{editions.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>
      </div>
      <div className="grid gap-4 p-6 xl:grid-cols-2">
        {editions.map((edition) => (
          <article
            key={edition.id}
            className="rounded-[1.5rem] border border-stone-200 bg-[linear-gradient(180deg,#fafaf9_0%,#ffffff_100%)] p-5 shadow-sm"
          >
            {(() => {
              const heat = editionHeat.get(edition.id);
              const badge = getCommunityHeatBadge(heat);
              return badge ? (
                <div className="mb-4 rounded-[1.1rem] border border-violet-200 bg-violet-50/80 px-4 py-3">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-violet-700">
                    {badge}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-violet-900">
                    Backend event history shows fresh community momentum around this edition.
                  </p>
                </div>
              ) : null;
            })()}
            {(() => {
              const communitySummary =
                communityPulse?.editionCounts.find((entry) => entry.editionId === edition.id) ?? null;
              return communitySummary ? (
                <div className="mb-4 rounded-[1.1rem] border border-sky-200 bg-sky-50/80 px-4 py-3">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-sky-700">
                    Community pulse
                  </p>
                  <p className="mt-2 text-sm leading-6 text-sky-900">
                    {communitySummary.saves} save
                    {communitySummary.saves === 1 ? "" : "s"} across synced workspaces
                    {communitySummary.reuses > 0
                      ? `, ${communitySummary.reuses} reuse${
                          communitySummary.reuses === 1 ? "" : "s"
                        }`
                      : ""}
                    .
                  </p>
                </div>
              ) : null;
            })()}
            {(() => {
              const reason = getEditionDiscoveryReason(edition.id, effectivePreferences);
              return reason ? (
                <div className="mb-4 rounded-[1.1rem] border border-emerald-200 bg-emerald-50/80 px-4 py-3">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                    {reason.label}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-emerald-900">{reason.detail}</p>
                </div>
              ) : null;
            })()}
            {(() => {
              const savedEdition = savedEditions.find((entry) => entry.editionId === edition.id);
              return savedEdition ? (
                <div className="mb-4 rounded-[1.1rem] border border-amber-200 bg-amber-50/80 px-4 py-3">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-amber-700">
                    Saved to your social shelf
                  </p>
                  <p className="mt-2 text-sm leading-6 text-amber-900">
                    {savedEdition.lastUsedAt
                      ? "You saved this edition and already used it in your flow."
                      : "You saved this edition so it stays easy to reuse across devices and workspaces."}
                  </p>
                  {savedEdition.lastUsedAt ? (
                    <p className="mt-2 text-xs font-medium uppercase tracking-[0.16em] text-amber-700">
                      Ranked from your synced social memory
                    </p>
                  ) : null}
                </div>
              ) : null;
            })()}
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-xl">
                {(() => {
                  const joinedCircle = allCircles.find(
                    (circle) =>
                      joinedCircles.includes(circle.id) && circle.editionId === edition.id,
                  );
                  const recentBadge = joinedCircle
                    ? getRelativeDiscoveryBadge(joinedCircleTimestamps[joinedCircle.id])
                    : null;
                  const followedAuthor = effectivePreferences.followedAuthors.find((authorName) =>
                    getEditionDiscoveryReason(edition.id, {
                      ...effectivePreferences,
                      followedAuthors: [authorName],
                    })?.label.includes(authorName),
                  );
                  const followBadge = followedAuthor
                    ? getRelativeDiscoveryBadge(followedAuthorTimestamps[followedAuthor])
                    : null;

                  return recentBadge || followBadge ? (
                    <div className="mb-3 flex flex-wrap gap-2">
                      {recentBadge ? (
                        <span className="rounded-full bg-sky-50 px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-sky-700">
                          {recentBadge}
                        </span>
                      ) : null}
                      {followBadge ? (
                        <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-violet-700">
                          {followBadge}
                        </span>
                      ) : null}
                    </div>
                  ) : null;
                })()}
                <div className="flex flex-wrap items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
                  <span className="rounded-full bg-stone-100 px-2.5 py-1">
                    {edition.source === "community" ? "Public feed" : "From your library"}
                  </span>
                  {allCircles.some(
                    (circle) => joinedCircles.includes(circle.id) && circle.editionId === edition.id,
                  ) ? (
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">
                      From circles you joined
                    </span>
                  ) : null}
                  {savedEditions.some((entry) => entry.editionId === edition.id) ? (
                    <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">
                      Saved
                    </span>
                  ) : null}
                  {(() => {
                    const communitySummary =
                      communityPulse?.editionCounts.find((entry) => entry.editionId === edition.id) ??
                      null;
                    return communitySummary ? (
                      <span className="rounded-full bg-sky-50 px-2.5 py-1 text-sky-700">
                        {communitySummary.saves} saves
                      </span>
                    ) : null;
                  })()}
                  {(() => {
                    const badge = getCommunityHeatBadge(editionHeat.get(edition.id));
                    return badge ? (
                      <span className="rounded-full bg-violet-50 px-2.5 py-1 text-violet-700">
                        {badge}
                      </span>
                    ) : null;
                  })()}
                  <span className="rounded-full bg-stone-100 px-2.5 py-1 capitalize">
                    {edition.mode}
                  </span>
                  <span className="rounded-full bg-stone-100 px-2.5 py-1">
                    {edition.genreLabel}
                  </span>
                </div>
                <h3 className="mt-3 text-lg font-semibold text-stone-950">
                  {edition.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  {edition.narratorName} for <span className="font-medium">{edition.bookTitle}</span>
                </p>
                <p className="mt-3 text-sm leading-6 text-stone-600">{edition.note}</p>
              </div>
              <div className="rounded-[1.2rem] border border-stone-200 bg-white px-4 py-4 text-right shadow-sm">
                <p className="text-[0.65rem] font-medium uppercase tracking-[0.22em] text-stone-500">
                  Created by
                </p>
                <p className="mt-2 text-sm font-semibold text-stone-950">{edition.creator}</p>
              </div>
            </div>
            <div className="mt-4 rounded-[1.2rem] border border-stone-200 bg-white px-4 py-4">
              <p className="text-[0.65rem] font-medium uppercase tracking-[0.22em] text-stone-500">
                Best for
              </p>
              <p className="mt-2 text-sm leading-6 text-stone-700">{edition.bestFor}</p>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                className="rounded-full bg-stone-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-800"
                type="button"
                onClick={() => {
                  writeDefaultListeningProfile({
                    bookId: edition.bookId ?? `featured-${edition.id}`,
                    narratorId: edition.narratorName.toLowerCase().replace(/\s+/g, "-"),
                    narratorName: edition.narratorName,
                    mode: edition.mode,
                  });
                  touchSavedListeningEdition(edition.id);
                  setFeedbackId(edition.id);
                  window.setTimeout(() => setFeedbackId(null), 1800);
                }}
              >
                {feedbackId === edition.id ? "Edition ready" : "Use as default"}
              </button>
              <button
                className="rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
                type="button"
                onClick={() => {
                  toggleSavedListeningEdition(edition.id);
                }}
              >
                {savedEditions.some((entry) => entry.editionId === edition.id)
                  ? "Unsave edition"
                  : "Save edition"}
              </button>
              <Link
                className="rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
                href={
                  edition.bookId
                    ? `/books/${edition.bookId}`
                    : `/social/editions/${edition.id}`
                }
              >
                {edition.bookId ? "Open book" : "View edition"}
              </Link>
            </div>
            {feedbackId === edition.id ? (
              <p className="mt-3 text-sm text-emerald-700">
                This edition is now the default starting taste for new imports.
              </p>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
