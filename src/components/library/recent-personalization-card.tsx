"use client";

import Link from "next/link";
import { useMemo } from "react";
import { featuredAuthorSpotlights } from "@/features/discovery/author-spotlights";
import { featuredBookCircles } from "@/features/discovery/book-circles";
import { getRelativeDiscoveryBadge } from "@/features/discovery/personalization";
import { togglePinnedDiscoverySignal } from "@/features/discovery/local-discovery";
import { useDiscoveryPreferences } from "@/features/discovery/use-discovery-preferences";

type PersonalizationItem = {
  id: string;
  kind: "circle" | "author" | "feature";
  eyebrow: string;
  title: string;
  detail: string;
  href: string;
  action: string;
  updatedAt: string;
};

const plannedFeatureMeta: Record<
  string,
  { title: string; detail: string; href: string; action: string }
> = {
  "private-audio-files": {
    title: "Private audiobook files",
    detail:
      "You saved the private-audio path, so the app is keeping that roadmap within easy reach.",
    href: "/import?source=audio",
    action: "Review audio plans",
  },
  "richer-document-imports": {
    title: "Richer document imports",
    detail:
      "You saved richer document imports, so the intake roadmap stays visible while text remains the fastest path.",
    href: "/import",
    action: "Review the roadmap",
  },
  "library-connectors": {
    title: "Smarter library connectors",
    detail:
      "You saved the library-connector path, so the future cloud-import direction stays easy to revisit.",
    href: "/import?source=audio",
    action: "See what’s coming",
  },
};

function sortByRecent<T extends { updatedAt: string }>(items: T[]): T[] {
  return [...items].sort(
    (left, right) =>
      new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
  );
}

export function RecentPersonalizationCard() {
  const {
    followedAuthors,
    followedAuthorTimestamps,
    joinedCircles,
    joinedCircleTimestamps,
    trackedPlannedFeatures,
    trackedFeatureTimestamps,
    pinnedDiscoverySignal,
  } = useDiscoveryPreferences();

  const items = useMemo(() => {
    const recentCircle = sortByRecent(
      featuredBookCircles
        .filter(
          (circle) =>
            joinedCircles.includes(circle.id) && Boolean(joinedCircleTimestamps[circle.id]),
        )
        .map<PersonalizationItem>((circle) => ({
          id: circle.id,
          kind: "circle",
          eyebrow: "Recent circle",
          title: circle.title,
          detail: `You joined this circle recently, so its shared checkpoint and edition stay close.`,
          href: `/import?edition=${circle.editionId}`,
          action: "Continue with this circle",
          updatedAt: joinedCircleTimestamps[circle.id]!,
        })),
    )[0] ?? null;

    const recentAuthor = sortByRecent(
      featuredAuthorSpotlights
        .filter(
          (spotlight) =>
            followedAuthors.includes(spotlight.name) &&
            Boolean(followedAuthorTimestamps[spotlight.name]),
        )
        .map<PersonalizationItem>((spotlight) => ({
          id: spotlight.name,
          kind: "author",
          eyebrow: "Recent follow",
          title: spotlight.name,
          detail: `You followed this author recently, so the recommended edition stays easy to reuse.`,
          href: `/import?edition=${spotlight.recommendedEditionId}`,
          action: "Try the recommended edition",
          updatedAt: followedAuthorTimestamps[spotlight.name]!,
        })),
    )[0] ?? null;

    const recentFeature = sortByRecent(
      trackedPlannedFeatures
        .filter(
          (featureId) =>
            Boolean(plannedFeatureMeta[featureId]) &&
            Boolean(trackedFeatureTimestamps[featureId]),
        )
        .map<PersonalizationItem>((featureId) => ({
          id: featureId,
          kind: "feature",
          eyebrow: "Saved future path",
          title: plannedFeatureMeta[featureId].title,
          detail: plannedFeatureMeta[featureId].detail,
          href: plannedFeatureMeta[featureId].href,
          action: plannedFeatureMeta[featureId].action,
          updatedAt: trackedFeatureTimestamps[featureId]!,
        })),
    )[0] ?? null;

    return [recentCircle, recentAuthor, recentFeature].filter(
      (item): item is PersonalizationItem => item !== null,
    );
  }, [
    followedAuthors,
    followedAuthorTimestamps,
    joinedCircles,
    joinedCircleTimestamps,
    trackedFeatureTimestamps,
    trackedPlannedFeatures,
  ]);

  const latestItem = useMemo(
    () =>
      sortByRecent(items)[0] ?? null,
    [items],
  );

  if (items.length === 0) {
    return null;
  }

  return (
    <section className="overflow-hidden rounded-[2rem] border border-stone-200/80 bg-[linear-gradient(135deg,#fffef9_0%,#ffffff_48%,#eef4ff_100%)] shadow-[0_22px_60px_-42px_rgba(28,25,23,0.4)]">
      <div className="border-b border-stone-200/80 bg-white/85 p-6 backdrop-blur">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-stone-500">
              Recently personalized
            </p>
            <h2 className="mt-2 text-xl font-semibold text-stone-900">
              The app is reacting to what you touched last
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
              Recent follows, joins, and saved future paths stay near the top so you can
              pick up the same thread without re-teaching the app.
            </p>
          </div>
          {latestItem ? (
            <div className="rounded-full border border-stone-200 bg-white px-4 py-2 text-sm text-stone-600 shadow-sm">
              Latest signal: {latestItem.title}
            </div>
          ) : null}
        </div>
      </div>
      <div className="grid gap-4 p-6 md:grid-cols-3">
        {items.map((item) => {
          const freshnessBadge = getRelativeDiscoveryBadge(item.updatedAt);

          return (
            <article
              key={item.id}
              className="rounded-[1.5rem] border border-stone-200 bg-white/90 p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
                <span>{item.eyebrow}</span>
                {freshnessBadge ? (
                  <span className="rounded-full bg-sky-50 px-2.5 py-1 text-sky-700">
                    {freshnessBadge}
                  </span>
                ) : null}
                {pinnedDiscoverySignal?.kind === item.kind && pinnedDiscoverySignal.id === item.id ? (
                  <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">
                    Pinned
                  </span>
                ) : null}
              </div>
              <h3 className="mt-3 text-lg font-semibold text-stone-950">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-stone-600">{item.detail}</p>
              <Link
                className="mt-4 inline-flex rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
                href={item.href}
              >
                {item.action}
              </Link>
              <button
                className="mt-3 inline-flex rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
                type="button"
                onClick={() => {
                  togglePinnedDiscoverySignal({
                    kind: item.kind,
                    id: item.id,
                  });
                }}
              >
                {pinnedDiscoverySignal?.kind === item.kind && pinnedDiscoverySignal.id === item.id
                  ? "Unpin"
                  : "Pin near the top"}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
