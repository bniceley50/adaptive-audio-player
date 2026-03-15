"use client";

import Link from "next/link";
import { useMemo } from "react";
import { featuredBookCircles } from "@/features/discovery/book-circles";
import { featuredListeningEditions } from "@/features/discovery/listening-editions";
import { useSocialState } from "@/features/social/use-social-state";

function sortByRecent<T extends { savedAt?: string; joinedAt?: string; lastUsedAt?: string | null; lastOpenedAt?: string | null }>(
  items: T[],
) {
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

export function SocialMemoryCard() {
  const { savedEditions, circleMemberships } = useSocialState();

  const recentSavedEditions = useMemo(() => sortByRecent(savedEditions).slice(0, 3), [savedEditions]);
  const recentCircleMemberships = useMemo(
    () => sortByRecent(circleMemberships).slice(0, 3),
    [circleMemberships],
  );
  const latestSavedEdition = recentSavedEditions[0] ?? null;
  const latestCircleMembership = recentCircleMemberships[0] ?? null;

  const editionMeta = latestSavedEdition
    ? featuredListeningEditions.find((edition) => edition.id === latestSavedEdition.editionId) ?? null
    : null;
  const circleMeta = latestCircleMembership
    ? featuredBookCircles.find((circle) => circle.id === latestCircleMembership.circleId) ?? null
    : null;

  if (!editionMeta && !circleMeta) {
    return null;
  }

  return (
    <section className="overflow-hidden rounded-[2rem] border border-stone-200/80 bg-[linear-gradient(135deg,#fffdf7_0%,#ffffff_45%,#eef6ff_100%)] shadow-[0_22px_60px_-42px_rgba(28,25,23,0.4)]">
      <div className="border-b border-stone-200/80 bg-white/85 p-6 backdrop-blur">
        <p className="text-xs font-medium uppercase tracking-[0.22em] text-stone-500">
          Social memory
        </p>
        <h2 className="mt-2 text-xl font-semibold text-stone-900">
          Your saved editions and circles now follow you
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
          The social layer is no longer just local browser memory. Saved editions and joined
          circles now come back with your workspace.
        </p>
        <div className="mt-4 flex flex-wrap gap-3 text-xs font-medium text-stone-600">
          <span className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1.5">
            {savedEditions.length} saved edition{savedEditions.length === 1 ? "" : "s"}
          </span>
          <span className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1.5">
            {circleMemberships.length} joined circle{circleMemberships.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>
      <div className="grid gap-4 p-6 md:grid-cols-2">
        <article className="rounded-[1.4rem] border border-stone-200 bg-white/90 p-5 shadow-sm">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-stone-500">
            Saved edition
          </p>
          <p className="mt-2 text-lg font-semibold text-stone-950">
            {editionMeta?.title ?? "No saved edition yet"}
          </p>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            {editionMeta
              ? `${editionMeta.narratorName} in ${editionMeta.mode} for ${editionMeta.bookTitle}.`
              : "Save a listening edition from the feed to keep it available across workspaces."}
          </p>
          {editionMeta ? (
            <>
              <Link
                className="mt-4 inline-flex rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
                href={`/import?edition=${editionMeta.id}`}
              >
                Use saved edition
              </Link>
              {recentSavedEditions.length > 1 ? (
                <div className="mt-4 space-y-2 border-t border-stone-200 pt-4">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
                    Recent saves
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {recentSavedEditions.map((entry) => {
                      const recentEdition = featuredListeningEditions.find(
                        (edition) => edition.id === entry.editionId,
                      );
                      if (!recentEdition) {
                        return null;
                      }

                      return (
                        <Link
                          key={entry.editionId}
                          className="inline-flex rounded-full border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs font-medium text-stone-700 transition hover:border-stone-300 hover:bg-stone-100"
                          href={`/import?edition=${recentEdition.id}`}
                        >
                          {recentEdition.title}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
        </article>
        <article className="rounded-[1.4rem] border border-stone-200 bg-white/90 p-5 shadow-sm">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-stone-500">
            Joined circle
          </p>
          <p className="mt-2 text-lg font-semibold text-stone-950">
            {circleMeta?.title ?? "No joined circle yet"}
          </p>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            {circleMeta
              ? `${circleMeta.checkpoint}. ${latestCircleMembership?.shareCount ?? 0} share${latestCircleMembership?.shareCount === 1 ? "" : "s"} so far.`
              : "Join a circle to keep its checkpoint and activity available across devices."}
          </p>
          {circleMeta ? (
            <>
              <Link
                className="mt-4 inline-flex rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
                href={`/import?edition=${circleMeta.editionId}`}
              >
                Return to this circle
              </Link>
              {recentCircleMemberships.length > 1 ? (
                <div className="mt-4 space-y-2 border-t border-stone-200 pt-4">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
                    Recent circles
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {recentCircleMemberships.map((entry) => {
                      const recentCircle = featuredBookCircles.find(
                        (circle) => circle.id === entry.circleId,
                      );
                      if (!recentCircle) {
                        return null;
                      }

                      return (
                        <Link
                          key={entry.circleId}
                          className="inline-flex rounded-full border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs font-medium text-stone-700 transition hover:border-stone-300 hover:bg-stone-100"
                          href={`/import?edition=${recentCircle.editionId}`}
                        >
                          {recentCircle.title}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
        </article>
      </div>
    </section>
  );
}
