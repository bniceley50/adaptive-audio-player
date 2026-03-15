import Link from "next/link";
import {
  describeSocialCommunityEvent,
  formatSocialCommunityEventLabel,
} from "@/features/social/public-social";
import type { SocialCommunityActivityEventSummary } from "@/lib/backend/types";

export function SocialCommunityActivityCard({
  events,
}: {
  events: SocialCommunityActivityEventSummary[];
}) {
  if (events.length === 0) {
    return null;
  }

  return (
    <section className="overflow-hidden rounded-[2rem] border border-stone-200/80 bg-white shadow-[0_22px_60px_-42px_rgba(28,25,23,0.4)]">
      <div className="border-b border-stone-200/80 bg-[linear-gradient(135deg,#fffdf7_0%,#f7f3ea_52%,#eef4ff_100%)] p-6">
        <p className="text-xs font-medium uppercase tracking-[0.22em] text-stone-500">
          Community activity
        </p>
        <h2 className="mt-2 text-xl font-semibold text-stone-900">
          Real backend social events across synced workspaces
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
          This feed is built from durable social activity events, not only the latest saved
          state for each workspace.
        </p>
      </div>
      <div className="grid gap-4 p-6 md:grid-cols-2">
        {events.map((event) => {
          const description = describeSocialCommunityEvent(event);

          return (
            <article
              key={event.id}
              className="rounded-[1.4rem] border border-stone-200 bg-[linear-gradient(180deg,#fafaf9_0%,#ffffff_100%)] p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
                <span className="rounded-full bg-sky-50 px-2.5 py-1 text-sky-700">
                  {formatSocialCommunityEventLabel(event.kind, event.quantity)}
                </span>
                <span className="rounded-full bg-stone-100 px-2.5 py-1">
                  {new Date(event.occurredAt).toLocaleString()}
                </span>
              </div>
              <Link className="mt-3 block text-sm font-semibold text-stone-950 hover:text-stone-700" href={description.href}>
                {description.title}
              </Link>
              <p className="mt-2 text-sm leading-6 text-stone-600">{description.detail}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
