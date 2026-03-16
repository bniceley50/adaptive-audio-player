"use client";

import { useMemo } from "react";
import { featuredBookCircles } from "@/features/discovery/book-circles";
import { featuredListeningEditions } from "@/features/discovery/listening-editions";
import { useSocialState } from "@/features/social/use-social-state";

function getMostRecentDate(...values: Array<string | null | undefined>) {
  const timestamps = values
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value).getTime())
    .filter((value) => Number.isFinite(value));

  if (timestamps.length === 0) {
    return null;
  }

  return new Date(Math.max(...timestamps));
}

function formatRelativeDate(date: Date | null) {
  if (!date) {
    return "No activity yet";
  }

  const diffMs = Date.now() - date.getTime();
  const diffHours = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60)));
  if (diffHours < 1) {
    return "Just now";
  }
  if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) {
    return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
  }

  return date.toLocaleDateString();
}

export function SocialActivitySummaryCard() {
  const { savedEditions, circleMemberships } = useSocialState();

  const latestSavedEdition = useMemo(() => {
    return [...savedEditions]
      .sort((left, right) => {
        const leftTime = new Date(left.lastUsedAt ?? left.savedAt).getTime();
        const rightTime = new Date(right.lastUsedAt ?? right.savedAt).getTime();
        return rightTime - leftTime;
      })
      .map((entry) => ({
        entry,
        edition:
          featuredListeningEditions.find((edition) => edition.id === entry.editionId) ?? null,
      }))
      .find((value) => value.edition !== null) ?? null;
  }, [savedEditions]);

  const latestCircle = useMemo(() => {
    return [...circleMemberships]
      .sort((left, right) => {
        const leftTime = new Date(left.lastOpenedAt ?? left.joinedAt).getTime();
        const rightTime = new Date(right.lastOpenedAt ?? right.joinedAt).getTime();
        return rightTime - leftTime;
      })
      .map((entry) => ({
        entry,
        circle: featuredBookCircles.find((circle) => circle.id === entry.circleId) ?? null,
      }))
      .find((value) => value.circle !== null) ?? null;
  }, [circleMemberships]);

  const totalShareCount = useMemo(
    () => circleMemberships.reduce((sum, entry) => sum + entry.shareCount, 0),
    [circleMemberships],
  );

  const latestActivity = getMostRecentDate(
    latestSavedEdition?.entry.lastUsedAt ?? latestSavedEdition?.entry.savedAt,
    latestCircle?.entry.lastOpenedAt ?? latestCircle?.entry.joinedAt,
  );

  return (
    <section className="overflow-hidden rounded-[2rem] border border-stone-200/80 bg-white shadow-[0_22px_60px_-42px_rgba(28,25,23,0.4)]">
      <div className="border-b border-stone-200/80 bg-[linear-gradient(135deg,#fffdf7_0%,#f7f3ea_52%,#eef4ff_100%)] p-6">
        <p className="text-xs font-medium uppercase tracking-[0.22em] text-stone-500">
          Synced activity
        </p>
        <h2 className="mt-2 text-xl font-semibold text-stone-900">
          Your community shelf is active
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
          Saved listening versions, group joins, and share activity now travel with the
          workspace. This is the current shape of that synced community state.
        </p>
      </div>
      <div className="grid gap-4 p-6 md:grid-cols-4">
        <article className="rounded-[1.4rem] border border-stone-200 bg-stone-50/80 p-4 shadow-sm">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
            Saved versions
          </p>
          <p className="mt-3 text-2xl font-semibold text-stone-950">{savedEditions.length}</p>
        </article>
        <article className="rounded-[1.4rem] border border-stone-200 bg-stone-50/80 p-4 shadow-sm">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
            Joined groups
          </p>
          <p className="mt-3 text-2xl font-semibold text-stone-950">{circleMemberships.length}</p>
        </article>
        <article className="rounded-[1.4rem] border border-stone-200 bg-stone-50/80 p-4 shadow-sm">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
            Group shares
          </p>
          <p className="mt-3 text-2xl font-semibold text-stone-950">{totalShareCount}</p>
        </article>
        <article className="rounded-[1.4rem] border border-stone-200 bg-stone-50/80 p-4 shadow-sm">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
            Latest activity
          </p>
          <p className="mt-3 text-lg font-semibold text-stone-950">
            {formatRelativeDate(latestActivity)}
          </p>
        </article>
      </div>
      <div className="grid gap-4 border-t border-stone-200/80 p-6 md:grid-cols-2">
        <article className="rounded-[1.4rem] border border-stone-200 bg-white p-4 shadow-sm">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
            Latest saved version
          </p>
          <p className="mt-3 text-sm font-semibold text-stone-950">
            {latestSavedEdition?.edition?.title ?? "Nothing saved yet"}
          </p>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            {latestSavedEdition?.edition
              ? `${latestSavedEdition.edition.narratorName} · ${latestSavedEdition.edition.mode}`
              : "Save a listening version from the public feed to start building a synced shelf."}
          </p>
        </article>
        <article className="rounded-[1.4rem] border border-stone-200 bg-white p-4 shadow-sm">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
            Latest joined group
          </p>
          <p className="mt-3 text-sm font-semibold text-stone-950">
            {latestCircle?.circle?.title ?? "No circle joined yet"}
          </p>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            {latestCircle?.circle
              ? latestCircle.circle.checkpoint
              : "Join a group from the public feed to keep its checkpoint and activity synced."}
          </p>
        </article>
      </div>
    </section>
  );
}
