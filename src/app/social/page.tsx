import { BookCirclesFeedCard } from "@/components/library/book-circles-feed-card";
import { ListeningEditionsFeedCard } from "@/components/library/listening-editions-feed-card";
import { SocialActivitySummaryCard } from "@/components/library/social-activity-summary-card";
import { SocialBackendSnapshotCard } from "@/components/library/social-backend-snapshot-card";
import { SocialActivityTimelineCard } from "@/components/library/social-activity-timeline-card";
import { SocialMemoryCard } from "@/components/library/social-memory-card";
import { SocialShelfCard } from "@/components/library/social-shelf-card";
import { AppShell } from "@/components/shared/app-shell";
import { getWorkspaceLibrarySnapshot } from "@/lib/backend/sqlite";
import { readWorkspaceIdFromRequest } from "@/lib/backend/workspace-session";

export default async function SocialPage() {
  const workspaceId = await readWorkspaceIdFromRequest();
  const backendLibrarySnapshot = workspaceId
    ? getWorkspaceLibrarySnapshot(workspaceId)
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
      <SocialBackendSnapshotCard
        socialState={backendLibrarySnapshot?.socialState ?? null}
        syncedAt={backendLibrarySnapshot?.syncedAt ?? null}
      />
      <SocialActivitySummaryCard />
      <SocialActivityTimelineCard />
      <SocialMemoryCard />
      <SocialShelfCard />
      <ListeningEditionsFeedCard />
      <BookCirclesFeedCard />
    </AppShell>
  );
}
