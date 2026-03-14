"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { featuredBookCircles } from "@/features/discovery/book-circles";
import {
  getCircleDiscoveryReason,
  getRelativeDiscoveryBadge,
} from "@/features/discovery/personalization";
import {
  toggleJoinedCircle,
} from "@/features/discovery/local-discovery";
import { featuredListeningEditions } from "@/features/discovery/listening-editions";
import { useDiscoveryPreferences } from "@/features/discovery/use-discovery-preferences";

export function BookCirclesFeedCard() {
  const preferences = useDiscoveryPreferences();
  const { joinedCircles, joinedCircleTimestamps } = preferences;
  const [sharedCircleId, setSharedCircleId] = useState<string | null>(null);

  const circles = useMemo(
    () =>
      featuredBookCircles
        .map((circle) => ({
          ...circle,
          edition:
            featuredListeningEditions.find((edition) => edition.id === circle.editionId) ?? null,
        }))
        .sort((left, right) => {
          const leftJoined = joinedCircles.includes(left.id) ? 1 : 0;
          const rightJoined = joinedCircles.includes(right.id) ? 1 : 0;
          return rightJoined - leftJoined;
        }),
    [joinedCircles],
  );

  async function shareCircle(circleId: string, title: string, bookTitle: string) {
    const shareText = `Join the public ${title} for ${bookTitle} in Adaptive Audio Player.`;
    const shareUrl =
      typeof window !== "undefined"
        ? `${window.location.origin}/import?edition=${featuredBookCircles.find((circle) => circle.id === circleId)?.editionId ?? ""}`
        : "https://github.com/bniceley50/adaptive-audio-player";

    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: `${title} · Public circle`,
          text: shareText,
          url: shareUrl,
        });
        setSharedCircleId(circleId);
        window.setTimeout(() => setSharedCircleId(null), 1800);
        return;
      } catch {
        // fall through to clipboard
      }
    }

    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
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
          const freshnessBadge = getRelativeDiscoveryBadge(joinedCircleTimestamps[circle.id]);

          return (
            <article
              key={circle.id}
              className="rounded-[1.5rem] border border-stone-200 bg-[linear-gradient(180deg,#fafaf9_0%,#ffffff_100%)] p-5 shadow-sm"
            >
              {(() => {
                const reason = getCircleDiscoveryReason(circle.id, preferences);
                return reason ? (
                  <div className="mb-4 rounded-[1.1rem] border border-emerald-200 bg-emerald-50/80 px-4 py-3">
                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                      {reason.label}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-emerald-900">{reason.detail}</p>
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
                  }}
                >
                  {joined ? "Joined" : "Join circle"}
                </button>
                <Link
                  className="rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
                  href={`/import?edition=${circle.editionId}`}
                >
                  Start with this edition
                </Link>
                <button
                  className="rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
                  type="button"
                  onClick={() => {
                    void shareCircle(circle.id, circle.title, circle.bookTitle);
                  }}
                >
                  {sharedCircleId === circle.id ? "Shared" : "Share circle"}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
