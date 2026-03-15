import { featuredBookCircles } from "@/features/discovery/book-circles";
import { featuredListeningEditions } from "@/features/discovery/listening-editions";
import type {
  SocialActivityEventKind,
  SocialCommunityActivityEventSummary,
} from "@/lib/backend/types";

function formatEventLabel(kind: SocialActivityEventKind, quantity: number) {
  if (kind === "edition-saved") {
    return `${quantity} save${quantity === 1 ? "" : "s"}`;
  }

  if (kind === "edition-reused") {
    return `${quantity} reuse${quantity === 1 ? "" : "s"}`;
  }

  if (kind === "circle-joined") {
    return `${quantity} join${quantity === 1 ? "" : "s"}`;
  }

  if (kind === "circle-reopened") {
    return `${quantity} reopen${quantity === 1 ? "" : "s"}`;
  }

  return `${quantity} share${quantity === 1 ? "" : "s"}`;
}

function describeEvent(event: SocialCommunityActivityEventSummary) {
  if (event.kind === "edition-saved" || event.kind === "edition-reused") {
    const edition =
      featuredListeningEditions.find((entry) => entry.id === event.subjectId) ?? null;

    return {
      title: edition?.title ?? "Listening edition",
      detail: edition
        ? `${edition.narratorName} for ${edition.bookTitle}`
        : "A saved listening style from the public feed.",
    };
  }

  const circle = featuredBookCircles.find((entry) => entry.id === event.subjectId) ?? null;
  return {
    title: circle?.title ?? "Book circle",
    detail: circle
      ? `${circle.bookTitle} · ${circle.checkpoint}`
      : "A shared public listening group from the social feed.",
  };
}

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
          const description = describeEvent(event);

          return (
            <article
              key={event.id}
              className="rounded-[1.4rem] border border-stone-200 bg-[linear-gradient(180deg,#fafaf9_0%,#ffffff_100%)] p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
                <span className="rounded-full bg-sky-50 px-2.5 py-1 text-sky-700">
                  {formatEventLabel(event.kind, event.quantity)}
                </span>
                <span className="rounded-full bg-stone-100 px-2.5 py-1">
                  {new Date(event.occurredAt).toLocaleString()}
                </span>
              </div>
              <p className="mt-3 text-sm font-semibold text-stone-950">
                {description.title}
              </p>
              <p className="mt-2 text-sm leading-6 text-stone-600">{description.detail}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
