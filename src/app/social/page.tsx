import { BookCirclesFeedCard } from "@/components/library/book-circles-feed-card";
import { ListeningEditionsFeedCard } from "@/components/library/listening-editions-feed-card";
import { SocialActivitySummaryCard } from "@/components/library/social-activity-summary-card";
import { SocialBackendSnapshotCard } from "@/components/library/social-backend-snapshot-card";
import { SocialCommunityActivityCard } from "@/components/library/social-community-activity-card";
import { SocialCommunityPulseCard } from "@/components/library/social-community-pulse-card";
import { SocialActivityTimelineCard } from "@/components/library/social-activity-timeline-card";
import { SocialMemoryCard } from "@/components/library/social-memory-card";
import { SocialShelfCard } from "@/components/library/social-shelf-card";
import { AppShell } from "@/components/shared/app-shell";
import { featuredBookCircles } from "@/features/discovery/book-circles";
import {
  getSocialCommunityPulse,
  getWorkspaceLibrarySnapshot,
  listRecentSocialActivityEvents,
} from "@/lib/backend/sqlite";
import { readWorkspaceIdFromRequest } from "@/lib/backend/workspace-session";

export default async function SocialPage({
  searchParams,
}: {
  searchParams?: Promise<{
    circle?: string | string[];
    entry?: string | string[];
  }>;
}) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const focusedCircleId = Array.isArray(resolvedSearchParams.circle)
    ? resolvedSearchParams.circle[0]
    : resolvedSearchParams.circle;
  const entry = Array.isArray(resolvedSearchParams.entry)
    ? resolvedSearchParams.entry[0]
    : resolvedSearchParams.entry;
  const workspaceId = await readWorkspaceIdFromRequest();
  const backendLibrarySnapshot = workspaceId
    ? getWorkspaceLibrarySnapshot(workspaceId)
    : null;
  const communityPulse = getSocialCommunityPulse();
  const communityEvents = listRecentSocialActivityEvents(6);
  const focusedCircle = focusedCircleId
    ? featuredBookCircles.find((circle) => circle.id === focusedCircleId) ?? null
    : null;

  return (
    <AppShell eyebrow="Social" title="Saved editions and public circles">
      <section className="rounded-[2rem] border border-stone-200 bg-white/80 p-8 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-[0.22em] text-stone-500">
          Social listening
        </p>
        <h2 className="mt-4 max-w-2xl text-3xl font-semibold tracking-tight text-stone-950">
          Keep your best listening editions and circles in one place.
        </h2>
        <p className="mt-4 max-w-3xl text-base leading-7 text-stone-600">
          This page brings together the synced social shelf and the public discovery feed.
          Save an edition, reopen a circle, and keep your social listening state easy to
          manage across workspaces.
        </p>
      </section>
      {focusedCircle ? (
        <section className="rounded-[2rem] border border-amber-200 bg-[linear-gradient(135deg,#fff7ed_0%,#ffffff_100%)] p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl">
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-amber-700">
                {entry === "trending-circle" ? "Focused from trending now" : "Focused circle"}
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-stone-950">
                {focusedCircle.title}
              </h2>
              <p className="mt-3 text-sm leading-6 text-stone-600">
                {entry === "trending-circle"
                  ? "You landed here from the live home trend strip, so this circle is highlighted first instead of dropping you into the full feed cold."
                  : "This circle is highlighted first so you can jump straight into the specific public listening path you selected."}
              </p>
            </div>
            <div className="rounded-[1.2rem] border border-amber-200 bg-white/90 px-4 py-4 shadow-sm">
              <p className="text-[0.65rem] font-medium uppercase tracking-[0.22em] text-stone-500">
                Current checkpoint
              </p>
              <p className="mt-2 text-sm font-semibold text-stone-950">
                {focusedCircle.checkpoint}
              </p>
              <p className="mt-2 text-sm leading-6 text-stone-600">
                {focusedCircle.bookTitle}
              </p>
            </div>
          </div>
        </section>
      ) : null}
      <SocialBackendSnapshotCard
        socialState={backendLibrarySnapshot?.socialState ?? null}
        syncedAt={backendLibrarySnapshot?.syncedAt ?? null}
      />
      <SocialCommunityPulseCard pulse={communityPulse} />
      <SocialCommunityActivityCard events={communityEvents} />
      <SocialActivitySummaryCard />
      <SocialActivityTimelineCard
        initialSocialState={backendLibrarySnapshot?.socialState ?? null}
      />
      <SocialMemoryCard />
      <SocialShelfCard />
      <ListeningEditionsFeedCard
        initialSocialState={backendLibrarySnapshot?.socialState ?? null}
        communityPulse={communityPulse}
        communityEvents={communityEvents}
      />
      <BookCirclesFeedCard
        initialSocialState={backendLibrarySnapshot?.socialState ?? null}
        communityPulse={communityPulse}
        communityEvents={communityEvents}
      />
    </AppShell>
  );
}
