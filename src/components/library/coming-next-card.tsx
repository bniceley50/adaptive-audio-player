"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  togglePinnedDiscoverySignal,
  toggleTrackedPlannedFeature,
} from "@/features/discovery/local-discovery";
import { useDiscoveryPreferences } from "@/features/discovery/use-discovery-preferences";

const comingSoonItems = [
  {
    id: "private-audio-files",
    eyebrow: "Next",
    title: "Private audiobook files",
    detail:
      "A dedicated path for DRM-free or already-converted personal audiobook files is being shaped now.",
    meta: "Planned first support: M4B and MP3",
    href: "/import?source=audio",
    action: "View audio import plans",
  },
  {
    id: "richer-document-imports",
    eyebrow: "Later",
    title: "Richer document imports",
    detail:
      "EPUB, PDF, and DOCX intake will layer onto the same simple import flow once the private-audio path lands.",
    meta: "Same setup and listening workflow",
    href: "/import",
    action: "See import roadmap",
  },
  {
    id: "library-connectors",
    eyebrow: "Later",
    title: "Smarter library connectors",
    detail:
      "Cloud-style library connections can arrive after the private import path is clean and consumer-friendly.",
    meta: "Library-first, not setup-heavy",
    href: "/import?source=audio",
    action: "See what’s coming",
  },
] as const;

export function ComingNextCard() {
  const { personalizationPaused, pinnedDiscoverySignal, trackedPlannedFeatures } =
    useDiscoveryPreferences();
  const effectivePinnedSignal = useMemo(
    () => (personalizationPaused ? null : pinnedDiscoverySignal),
    [personalizationPaused, pinnedDiscoverySignal],
  );
  const effectiveTrackedFeatures = useMemo(
    () => (personalizationPaused ? [] : trackedPlannedFeatures),
    [personalizationPaused, trackedPlannedFeatures],
  );

  const trackedCount = effectiveTrackedFeatures.length;
  const interestLabel = useMemo(() => {
    if (trackedCount === 0) {
      return "Save the features you care about";
    }

    if (trackedCount === 1) {
      return "1 future path saved";
    }

    return `${trackedCount} future paths saved`;
  }, [trackedCount]);
  const orderedItems = useMemo(
    () =>
      [...comingSoonItems].sort((left, right) => {
        const leftPinned =
          effectivePinnedSignal?.kind === "feature" && effectivePinnedSignal.id === left.id ? 1 : 0;
        const rightPinned =
          effectivePinnedSignal?.kind === "feature" && effectivePinnedSignal.id === right.id ? 1 : 0;
        if (leftPinned !== rightPinned) {
          return rightPinned - leftPinned;
        }

        const leftTracked = effectiveTrackedFeatures.includes(left.id) ? 1 : 0;
        const rightTracked = effectiveTrackedFeatures.includes(right.id) ? 1 : 0;
        return rightTracked - leftTracked;
      }),
    [effectivePinnedSignal, effectiveTrackedFeatures],
  );

  return (
    <section className="overflow-hidden rounded-[2rem] border border-stone-200/80 bg-[linear-gradient(135deg,#fcfbf7_0%,#ffffff_42%,#eef4ff_100%)] shadow-[0_22px_60px_-42px_rgba(28,25,23,0.4)]">
      <div className="border-b border-stone-200/80 bg-white/85 p-6 backdrop-blur">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-stone-500">
              {trackedCount > 0 ? "Saved future paths" : "Coming next"}
            </p>
            <h2 className="mt-2 text-xl font-semibold text-stone-900">
              {trackedCount > 0
                ? "Keep the future paths you care about close"
                : "See where the product is heading without losing the simple path today"}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
              {trackedCount > 0
                ? "The app now keeps your saved roadmap items near the everyday flow so private-library plans stay easy to revisit."
                : "The app keeps the everyday listening flow simple now, while making the next private-library steps visible and easy to understand."}
            </p>
          </div>
          <div className="rounded-full border border-stone-200 bg-white px-4 py-2 text-sm text-stone-600 shadow-sm">
            {interestLabel}
          </div>
        </div>
      </div>
      <div className="grid gap-4 p-6 xl:grid-cols-3">
        {orderedItems.map((item) => (
          <article
            key={item.title}
            className="rounded-[1.5rem] border border-stone-200 bg-white/90 p-5 shadow-sm"
          >
            <div className="flex flex-wrap items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-stone-500">
              <span>{item.eyebrow}</span>
              {effectiveTrackedFeatures.includes(item.id) ? (
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-700">
                  Saved for you
                </span>
              ) : null}
              {effectivePinnedSignal?.kind === "feature" && effectivePinnedSignal.id === item.id ? (
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-700">
                  Pinned
                </span>
              ) : null}
            </div>
            <h3 className="mt-3 text-lg font-semibold text-stone-950">{item.title}</h3>
            <p className="mt-2 text-sm leading-6 text-stone-600">{item.detail}</p>
            <p className="mt-3 text-sm font-medium text-stone-800">{item.meta}</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                className="inline-flex rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
                href={item.href}
              >
                {item.action}
              </Link>
              <button
                className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                  effectiveTrackedFeatures.includes(item.id)
                    ? "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                    : "border border-stone-300 bg-white text-stone-700 hover:border-stone-400 hover:bg-stone-50"
                }`}
                type="button"
                onClick={() => {
                  toggleTrackedPlannedFeature(item.id);
                }}
              >
                {effectiveTrackedFeatures.includes(item.id) ? "Saved" : "Notify me"}
              </button>
              <button
                className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
                type="button"
                onClick={() => {
                  togglePinnedDiscoverySignal({
                    kind: "feature",
                    id: item.id,
                  });
                }}
              >
                {effectivePinnedSignal?.kind === "feature" && effectivePinnedSignal.id === item.id
                  ? "Unpin path"
                  : "Pin path"}
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
