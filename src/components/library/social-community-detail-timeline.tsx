"use client";

import {
  describeSocialCommunityTimelineEvent,
  formatSocialCommunityRelativeTime,
} from "@/features/social/public-social";
import type { SocialCommunityActivityEventSummary } from "@/lib/backend/types";

export function SocialCommunityDetailTimeline({
  events,
  emptyCopy,
}: {
  events: SocialCommunityActivityEventSummary[];
  emptyCopy: string;
}) {
  return (
    <article className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-[0.22em] text-stone-500">
        Recent community timeline
      </p>
      <div className="mt-4 space-y-3">
        {events.length > 0 ? (
          events.map((event) => {
            const narrative = describeSocialCommunityTimelineEvent(event);

            return (
              <div
                key={event.id}
                className="rounded-[1.2rem] border border-stone-200 bg-stone-50/80 p-4"
              >
                <div className="flex flex-wrap items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
                  <span className="rounded-full bg-sky-50 px-2.5 py-1 text-sky-700">
                    {narrative.eyebrow}
                  </span>
                  <span className="rounded-full bg-white px-2.5 py-1">
                    {formatSocialCommunityRelativeTime(event.occurredAt)}
                  </span>
                </div>
                <p className="mt-3 text-sm font-semibold text-stone-950">{narrative.title}</p>
                <p className="mt-2 text-sm leading-6 text-stone-600">{narrative.detail}</p>
              </div>
            );
          })
        ) : (
          <div className="rounded-[1.2rem] border border-stone-200 bg-stone-50/80 p-4 text-sm leading-6 text-stone-600">
            {emptyCopy}
          </div>
        )}
      </div>
    </article>
  );
}
