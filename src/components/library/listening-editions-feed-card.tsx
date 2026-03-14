"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { featuredBookCircles } from "@/features/discovery/book-circles";
import {
  getEditionDiscoveryReason,
  getRelativeDiscoveryBadge,
} from "@/features/discovery/personalization";
import { useDiscoveryPreferences } from "@/features/discovery/use-discovery-preferences";
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

export function ListeningEditionsFeedCard() {
  const preferences = useDiscoveryPreferences();
  const { followedAuthorTimestamps, joinedCircles, joinedCircleTimestamps } = preferences;
  const [feedbackId, setFeedbackId] = useState<string | null>(null);
  const [libraryEditions, setLibraryEditions] = useState<FeedEdition[]>(() =>
    typeof window === "undefined" ? [] : readLibraryEditions(),
  );

  useEffect(() => {
    function refresh() {
      setLibraryEditions(readLibraryEditions());
    }

    refresh();
    window.addEventListener(listeningProfileChangedEvent, refresh);
    window.addEventListener(defaultTasteChangedEvent, refresh);
    window.addEventListener(workspaceContextChangedEvent, refresh);

    return () => {
      window.removeEventListener(listeningProfileChangedEvent, refresh);
      window.removeEventListener(defaultTasteChangedEvent, refresh);
      window.removeEventListener(workspaceContextChangedEvent, refresh);
    };
  }, []);

  const editions = useMemo<FeedEdition[]>(() => {
    const curated = featuredListeningEditions.map((edition) => ({
      ...edition,
      source: "community" as const,
      bookId: null,
    }));

    const joinedEditionIds = featuredBookCircles
      .filter((circle) => joinedCircles.includes(circle.id))
      .map((circle) => circle.editionId);

    return [...libraryEditions, ...curated]
      .sort((left, right) => {
        const leftJoined = joinedEditionIds.includes(left.id) ? 1 : 0;
        const rightJoined = joinedEditionIds.includes(right.id) ? 1 : 0;
        return rightJoined - leftJoined;
      })
      .slice(0, 4);
  }, [joinedCircles, libraryEditions]);

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
              const reason = getEditionDiscoveryReason(edition.id, preferences);
              return reason ? (
                <div className="mb-4 rounded-[1.1rem] border border-emerald-200 bg-emerald-50/80 px-4 py-3">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                    {reason.label}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-emerald-900">{reason.detail}</p>
                </div>
              ) : null;
            })()}
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-xl">
                {(() => {
                  const joinedCircle = featuredBookCircles.find(
                    (circle) =>
                      joinedCircles.includes(circle.id) && circle.editionId === edition.id,
                  );
                  const recentBadge = joinedCircle
                    ? getRelativeDiscoveryBadge(joinedCircleTimestamps[joinedCircle.id])
                    : null;
                  const followedAuthor = preferences.followedAuthors.find((authorName) =>
                    getEditionDiscoveryReason(edition.id, {
                      ...preferences,
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
                  {featuredBookCircles.some(
                    (circle) => joinedCircles.includes(circle.id) && circle.editionId === edition.id,
                  ) ? (
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">
                      From circles you joined
                    </span>
                  ) : null}
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
                  setFeedbackId(edition.id);
                  window.setTimeout(() => setFeedbackId(null), 1800);
                }}
              >
                {feedbackId === edition.id ? "Edition ready" : "Use as default"}
              </button>
              <Link
                className="rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
                href={edition.bookId ? `/books/${edition.bookId}` : `/import?edition=${edition.id}`}
              >
                {edition.bookId ? "Open book" : "Start import"}
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
