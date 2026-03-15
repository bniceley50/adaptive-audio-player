"use client";

import Link from "next/link";
import { useMemo } from "react";
import { buildSocialTimelineEvents } from "@/features/social/social-timeline";
import { useSocialState } from "@/features/social/use-social-state";
import type { SyncedSocialState } from "@/lib/types/social";

function formatRelativeDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Recently";
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

export function SocialActivityTimelineCard({
  initialSocialState = null,
}: {
  initialSocialState?: SyncedSocialState | null;
}) {
  const { savedEditions, circleMemberships } = useSocialState();

  const events = useMemo(() => {
    const effectiveSocialState =
      savedEditions.length > 0 || circleMemberships.length > 0
        ? { savedEditions, circleMemberships }
        : initialSocialState;

    return buildSocialTimelineEvents(effectiveSocialState);
  }, [circleMemberships, initialSocialState, savedEditions]);

  if (events.length === 0) {
    return null;
  }

  return (
    <section className="overflow-hidden rounded-[2rem] border border-stone-200/80 bg-white shadow-[0_22px_60px_-42px_rgba(28,25,23,0.4)]">
      <div className="border-b border-stone-200/80 bg-[linear-gradient(135deg,#fffdf7_0%,#f7f3ea_52%,#eef4ff_100%)] p-6">
        <p className="text-xs font-medium uppercase tracking-[0.22em] text-stone-500">
          Activity timeline
        </p>
        <h2 className="mt-2 text-xl font-semibold text-stone-900">
          What changed on your social shelf
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
          Recent saves, reuses, joins, and reopen actions from the synced social layer.
        </p>
      </div>
      <div className="p-6">
        <div className="space-y-4">
          {events.map((event) => (
            <article
              key={event.id}
              className="flex flex-wrap items-start justify-between gap-4 rounded-[1.4rem] border border-stone-200 bg-[linear-gradient(180deg,#fafaf9_0%,#ffffff_100%)] p-4 shadow-sm"
            >
              <div className="max-w-3xl">
                <div className="flex flex-wrap items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
                  <span className="rounded-full bg-stone-100 px-2.5 py-1">{event.label}</span>
                  <span className="rounded-full bg-stone-100 px-2.5 py-1">
                    {formatRelativeDate(event.occurredAt)}
                  </span>
                </div>
                <h3 className="mt-3 text-sm font-semibold text-stone-950">{event.title}</h3>
                <p className="mt-2 text-sm leading-6 text-stone-600">{event.detail}</p>
              </div>
              <Link
                className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
                href={event.href}
              >
                Open
              </Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
