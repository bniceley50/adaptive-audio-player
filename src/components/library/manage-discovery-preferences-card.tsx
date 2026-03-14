"use client";

import {
  featuredAuthorSpotlights,
} from "@/features/discovery/author-spotlights";
import { featuredBookCircles } from "@/features/discovery/book-circles";
import {
  clearAllDiscoveryPreferences,
  toggleFollowedAuthor,
  toggleJoinedCircle,
  toggleTrackedPlannedFeature,
  writePinnedDiscoverySignal,
} from "@/features/discovery/local-discovery";
import { useDiscoveryPreferences } from "@/features/discovery/use-discovery-preferences";

const featureLabels: Record<string, string> = {
  "private-audio-files": "Private audiobook files",
  "richer-document-imports": "Richer document imports",
  "library-connectors": "Smarter library connectors",
};

function resolvePinnedLabel(
  pinnedSignal: ReturnType<typeof useDiscoveryPreferences>["pinnedDiscoverySignal"],
) {
  if (!pinnedSignal) {
    return null;
  }

  if (pinnedSignal.kind === "circle") {
    return featuredBookCircles.find((circle) => circle.id === pinnedSignal.id)?.title ?? null;
  }

  if (pinnedSignal.kind === "author") {
    return (
      featuredAuthorSpotlights.find((author) => author.name === pinnedSignal.id)?.name ?? null
    );
  }

  return featureLabels[pinnedSignal.id] ?? "Future path";
}

export function ManageDiscoveryPreferencesCard() {
  const {
    followedAuthors,
    joinedCircles,
    pinnedDiscoverySignal,
    trackedPlannedFeatures,
  } = useDiscoveryPreferences();

  const followedAuthorLabels = featuredAuthorSpotlights
    .filter((author) => followedAuthors.includes(author.name))
    .map((author) => author.name);
  const joinedCircleLabels = featuredBookCircles
    .filter((circle) => joinedCircles.includes(circle.id))
    .map((circle) => ({ id: circle.id, title: circle.title }));
  const savedFeatureLabels = trackedPlannedFeatures
    .filter((featureId) => Boolean(featureLabels[featureId]))
    .map((featureId) => ({ id: featureId, title: featureLabels[featureId] }));
  const pinnedLabel = resolvePinnedLabel(pinnedDiscoverySignal);

  if (
    !pinnedDiscoverySignal &&
    followedAuthorLabels.length === 0 &&
    joinedCircleLabels.length === 0 &&
    savedFeatureLabels.length === 0
  ) {
    return null;
  }

  return (
    <section className="overflow-hidden rounded-[2rem] border border-stone-200/80 bg-[linear-gradient(135deg,#fffefb_0%,#ffffff_48%,#eef4ff_100%)] shadow-[0_22px_60px_-42px_rgba(28,25,23,0.4)]">
      <div className="border-b border-stone-200/80 bg-white/85 p-6 backdrop-blur">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-stone-500">
              Manage preferences
            </p>
            <h2 className="mt-2 text-xl font-semibold text-stone-900">
              Review what the app is prioritizing for you
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
              Clear old follows, circle joins, saved future paths, or the current pin
              without hunting through multiple discovery cards.
            </p>
          </div>
          {pinnedLabel ? (
            <div className="rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800 shadow-sm">
              Pinned: {pinnedLabel}
            </div>
          ) : null}
        </div>
        <div className="mt-4">
          <button
            className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
            type="button"
            onClick={() => clearAllDiscoveryPreferences()}
          >
            Reset all discovery preferences
          </button>
        </div>
      </div>
      <div className="grid gap-4 p-6 xl:grid-cols-4">
        <article className="rounded-[1.5rem] border border-stone-200 bg-white/90 p-5 shadow-sm">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-stone-500">
            Current pin
          </p>
          <h3 className="mt-3 text-lg font-semibold text-stone-950">
            {pinnedLabel ?? "Nothing pinned"}
          </h3>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            {pinnedLabel
              ? "This path outranks the normal discovery order across home."
              : "Pin one author, circle, or future path to keep it in front."}
          </p>
          {pinnedLabel ? (
            <button
              className="mt-4 inline-flex rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
              type="button"
              onClick={() => writePinnedDiscoverySignal(null)}
            >
              Clear pin
            </button>
          ) : null}
        </article>

        <article className="rounded-[1.5rem] border border-stone-200 bg-white/90 p-5 shadow-sm">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-stone-500">
            Followed authors
          </p>
          <div className="mt-3 space-y-3">
            {followedAuthorLabels.length > 0 ? (
              followedAuthorLabels.map((authorName) => (
                <div
                  key={authorName}
                  className="flex items-center justify-between gap-3 rounded-[1rem] border border-stone-200 bg-stone-50 px-3 py-3"
                >
                  <span className="text-sm font-medium text-stone-900">{authorName}</span>
                  <button
                    className="rounded-full border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
                    type="button"
                    onClick={() => toggleFollowedAuthor(authorName)}
                  >
                    Remove
                  </button>
                </div>
              ))
            ) : (
              <p className="text-sm leading-6 text-stone-600">No followed authors yet.</p>
            )}
          </div>
        </article>

        <article className="rounded-[1.5rem] border border-stone-200 bg-white/90 p-5 shadow-sm">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-stone-500">
            Joined circles
          </p>
          <div className="mt-3 space-y-3">
            {joinedCircleLabels.length > 0 ? (
              joinedCircleLabels.map((circle) => (
                <div
                  key={circle.id}
                  className="flex items-center justify-between gap-3 rounded-[1rem] border border-stone-200 bg-stone-50 px-3 py-3"
                >
                  <span className="text-sm font-medium text-stone-900">{circle.title}</span>
                  <button
                    className="rounded-full border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
                    type="button"
                    onClick={() => toggleJoinedCircle(circle.id)}
                  >
                    Leave
                  </button>
                </div>
              ))
            ) : (
              <p className="text-sm leading-6 text-stone-600">No joined circles yet.</p>
            )}
          </div>
        </article>

        <article className="rounded-[1.5rem] border border-stone-200 bg-white/90 p-5 shadow-sm">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-stone-500">
            Saved future paths
          </p>
          <div className="mt-3 space-y-3">
            {savedFeatureLabels.length > 0 ? (
              savedFeatureLabels.map((feature) => (
                <div
                  key={feature.id}
                  className="flex items-center justify-between gap-3 rounded-[1rem] border border-stone-200 bg-stone-50 px-3 py-3"
                >
                  <span className="text-sm font-medium text-stone-900">{feature.title}</span>
                  <button
                    className="rounded-full border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
                    type="button"
                    onClick={() => toggleTrackedPlannedFeature(feature.id)}
                  >
                    Remove
                  </button>
                </div>
              ))
            ) : (
              <p className="text-sm leading-6 text-stone-600">No saved future paths yet.</p>
            )}
          </div>
        </article>
      </div>
    </section>
  );
}
