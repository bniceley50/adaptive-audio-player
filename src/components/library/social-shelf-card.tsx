"use client";

import Link from "next/link";
import { useMemo } from "react";
import { featuredBookCircles } from "@/features/discovery/book-circles";
import { featuredListeningEditions } from "@/features/discovery/listening-editions";
import {
  leaveCircleMembership,
  toggleSavedListeningEdition,
  touchCircleMembership,
} from "@/features/social/local-social";
import { useSocialState } from "@/features/social/use-social-state";

function sortByRecent<
  T extends {
    savedAt?: string;
    joinedAt?: string;
    lastUsedAt?: string | null;
    lastOpenedAt?: string | null;
  },
>(items: T[]) {
  return [...items].sort((left, right) => {
    const leftTime = new Date(
      left.lastUsedAt ?? left.lastOpenedAt ?? left.savedAt ?? left.joinedAt ?? 0,
    ).getTime();
    const rightTime = new Date(
      right.lastUsedAt ?? right.lastOpenedAt ?? right.savedAt ?? right.joinedAt ?? 0,
    ).getTime();
    return rightTime - leftTime;
  });
}

export function SocialShelfCard() {
  const { savedEditions, circleMemberships } = useSocialState();

  const recentSavedEditions = useMemo(
    () =>
      sortByRecent(savedEditions)
        .map((entry) => ({
          entry,
          edition:
            featuredListeningEditions.find((edition) => edition.id === entry.editionId) ?? null,
        }))
        .filter((value): value is { entry: (typeof savedEditions)[number]; edition: NonNullable<(typeof featuredListeningEditions)[number] | null> } => value.edition !== null)
        .slice(0, 3),
    [savedEditions],
  );
  const recentCircles = useMemo(
    () =>
      sortByRecent(circleMemberships)
        .map((entry) => ({
          entry,
          circle:
            featuredBookCircles.find((circle) => circle.id === entry.circleId) ?? null,
        }))
        .filter((value): value is { entry: (typeof circleMemberships)[number]; circle: NonNullable<(typeof featuredBookCircles)[number] | null> } => value.circle !== null)
        .slice(0, 3),
    [circleMemberships],
  );

  if (recentSavedEditions.length === 0 && recentCircles.length === 0) {
    return null;
  }

  return (
    <section className="overflow-hidden rounded-[2rem] border border-stone-200/80 bg-white shadow-[0_22px_60px_-42px_rgba(28,25,23,0.4)]">
      <div className="border-b border-stone-200/80 bg-[linear-gradient(135deg,#fffdf7_0%,#f7f3ea_52%,#eef4ff_100%)] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-stone-500">
              Social shelf
            </p>
            <h2 className="mt-2 text-xl font-semibold text-stone-900">
              Manage your synced editions and circles
            </h2>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              These are the social items that now follow your workspace. Reuse them fast or
              clean them up without hunting through multiple discovery cards.
            </p>
          </div>
          <Link
            className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
            href="/social"
          >
            Open social page
          </Link>
        </div>
      </div>
      <div className="grid gap-4 p-6 xl:grid-cols-2">
        <article className="rounded-[1.5rem] border border-stone-200 bg-[linear-gradient(180deg,#fafaf9_0%,#ffffff_100%)] p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
                Saved editions
              </p>
              <h3 className="mt-2 text-lg font-semibold text-stone-950">
                Reuse your best starting sounds
              </h3>
            </div>
            <span className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs font-medium text-stone-600">
              {recentSavedEditions.length}
            </span>
          </div>
          <div className="mt-4 space-y-3">
            {recentSavedEditions.length > 0 ? (
              recentSavedEditions.map(({ entry, edition }) => (
                <div
                  key={entry.editionId}
                  className="rounded-[1.2rem] border border-stone-200 bg-white px-4 py-4"
                >
                  <div className="flex flex-wrap items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
                    <span className="rounded-full bg-stone-100 px-2.5 py-1 capitalize">
                      {edition.mode}
                    </span>
                    <span className="rounded-full bg-stone-100 px-2.5 py-1">
                      {edition.genreLabel}
                    </span>
                  </div>
                  <p className="mt-3 text-sm font-semibold text-stone-950">{edition.title}</p>
                  <p className="mt-2 text-sm leading-6 text-stone-600">
                    {edition.narratorName} for {edition.bookTitle}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link
                      className="rounded-full bg-stone-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-800"
                      href={`/import?edition=${edition.id}`}
                    >
                      Use edition
                    </Link>
                    <button
                      className="rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
                      type="button"
                      onClick={() => {
                        toggleSavedListeningEdition(edition.id);
                      }}
                    >
                      Unsave
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm leading-6 text-stone-600">
                Save a listening edition from the feed to keep it on your synced social shelf.
              </p>
            )}
          </div>
        </article>

        <article className="rounded-[1.5rem] border border-stone-200 bg-[linear-gradient(180deg,#fafaf9_0%,#ffffff_100%)] p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
                Joined circles
              </p>
              <h3 className="mt-2 text-lg font-semibold text-stone-950">
                Keep up with the circles you opened
              </h3>
            </div>
            <span className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs font-medium text-stone-600">
              {recentCircles.length}
            </span>
          </div>
          <div className="mt-4 space-y-3">
            {recentCircles.length > 0 ? (
              recentCircles.map(({ entry, circle }) => (
                <div
                  key={entry.circleId}
                  className="rounded-[1.2rem] border border-stone-200 bg-white px-4 py-4"
                >
                  <div className="flex flex-wrap items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
                    <span className="rounded-full bg-stone-100 px-2.5 py-1">
                      {circle.memberCount} listeners
                    </span>
                    {entry.shareCount > 0 ? (
                      <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">
                        {entry.shareCount} share{entry.shareCount === 1 ? "" : "s"}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-3 text-sm font-semibold text-stone-950">{circle.title}</p>
                  <p className="mt-2 text-sm leading-6 text-stone-600">{circle.checkpoint}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link
                      className="rounded-full bg-stone-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-800"
                      href={`/import?edition=${circle.editionId}`}
                      onClick={() => {
                        touchCircleMembership(circle.id);
                      }}
                    >
                      Open circle path
                    </Link>
                    <button
                      className="rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
                      type="button"
                      onClick={() => {
                        leaveCircleMembership(circle.id);
                      }}
                    >
                      Leave
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm leading-6 text-stone-600">
                Join a public circle to keep its checkpoint and activity on your synced shelf.
              </p>
            )}
          </div>
        </article>
      </div>
    </section>
  );
}
