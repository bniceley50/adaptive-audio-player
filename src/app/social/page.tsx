import { BookCirclesFeedCard } from "@/components/library/book-circles-feed-card";
import { ListeningEditionsFeedCard } from "@/components/library/listening-editions-feed-card";
import { SocialActivitySummaryCard } from "@/components/library/social-activity-summary-card";
import { SocialBackendSnapshotCard } from "@/components/library/social-backend-snapshot-card";
import { SocialCommunityActivityCard } from "@/components/library/social-community-activity-card";
import { SocialCommunityPulseCard } from "@/components/library/social-community-pulse-card";
import { SocialMomentsFeedCard } from "@/components/library/social-moments-feed-card";
import { SocialActivityTimelineCard } from "@/components/library/social-activity-timeline-card";
import { SocialMemoryCard } from "@/components/library/social-memory-card";
import { SocialReviewQueueCard } from "@/components/library/social-review-queue-card";
import { SocialShelfCard } from "@/components/library/social-shelf-card";
import { AppShell } from "@/components/shared/app-shell";
import {
  getAllPublicBookCircles,
  mapPublicSocialCircleRecord,
} from "@/features/discovery/book-circles";
import {
  getAllPublicSocialMoments,
  mapPublicSocialMomentRecord,
} from "@/features/social/public-moments";
import {
  listAllSocialActivityEvents,
  getSocialCommunityPulse,
  listPublicSocialCircles,
  listPublicSocialCirclesWithOptions,
  listPublicSocialMoments,
  listPublicSocialMomentsWithOptions,
  getWorkspaceLibrarySnapshot,
  listRecentSocialActivityEvents,
} from "@/lib/backend/sqlite";
import { isModerationReviewerAccount } from "@/lib/backend/moderation";
import {
  readAccountIdFromRequest,
  readWorkspaceIdFromRequest,
} from "@/lib/backend/workspace-session";

export default async function SocialPage({
  searchParams,
}: {
  searchParams?: Promise<{
    circle?: string | string[];
    moment?: string | string[];
    entry?: string | string[];
  }>;
}) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const focusedCircleId = Array.isArray(resolvedSearchParams.circle)
    ? resolvedSearchParams.circle[0]
    : resolvedSearchParams.circle;
  const focusedMomentId = Array.isArray(resolvedSearchParams.moment)
    ? resolvedSearchParams.moment[0]
    : resolvedSearchParams.moment;
  const entry = Array.isArray(resolvedSearchParams.entry)
    ? resolvedSearchParams.entry[0]
    : resolvedSearchParams.entry;
  const accountId = await readAccountIdFromRequest();
  const workspaceId = await readWorkspaceIdFromRequest();
  const isReviewer = isModerationReviewerAccount(accountId);
  const backendLibrarySnapshot = workspaceId
    ? getWorkspaceLibrarySnapshot(workspaceId)
    : null;
  const communityPulse = getSocialCommunityPulse();
  const recentCommunityEvents = listRecentSocialActivityEvents(6);
  const communityEvents = listAllSocialActivityEvents();
  const persistentCircles = listPublicSocialCircles().map(mapPublicSocialCircleRecord);
  const persistentMoments = listPublicSocialMoments().map(mapPublicSocialMomentRecord);
  const moderationCircles = workspaceId
    ? listPublicSocialCirclesWithOptions({
        includeHiddenOwnedByWorkspaceId: workspaceId,
        includeAllHidden: isReviewer,
      }).filter(
        (circle) =>
          (isReviewer || circle.ownerWorkspaceId === workspaceId) &&
          (circle.moderationStatus === "review" || circle.moderationStatus === "hidden"),
      )
    : [];
  const moderationMoments = workspaceId
    ? listPublicSocialMomentsWithOptions({
        includeHiddenOwnedByWorkspaceId: workspaceId,
        includeAllHidden: isReviewer,
      }).filter(
        (moment) =>
          (isReviewer || moment.ownerWorkspaceId === workspaceId) &&
          (moment.moderationStatus === "review" || moment.moderationStatus === "hidden"),
      )
    : [];
  const allCircles = getAllPublicBookCircles(
    backendLibrarySnapshot?.socialState ?? null,
    communityEvents,
    persistentCircles,
  );
  const focusedCircle = focusedCircleId
    ? allCircles.find((circle) => circle.id === focusedCircleId) ?? null
    : null;
  const focusedMoment = focusedMomentId
    ? getAllPublicSocialMoments(
        backendLibrarySnapshot?.socialState ?? null,
        communityEvents,
        persistentMoments,
      ).find(
        (moment) => moment.id === focusedMomentId,
      ) ?? null
    : null;

  return (
    <AppShell eyebrow="Community" title="Saved listening versions and book clubs">
      <section className="rounded-[2rem] border border-stone-200 bg-white/80 p-8 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-[0.22em] text-stone-500">
          Community
        </p>
        <h2 className="mt-4 max-w-2xl text-3xl font-semibold tracking-tight text-stone-950">
          Keep your best listening versions, groups, and highlights in one place.
        </h2>
        <p className="mt-4 max-w-3xl text-base leading-7 text-stone-600">
          This page brings together your synced community shelf and the public discovery
          feed. Save a listening version, reopen a group, and keep your shared listening
          activity easy to manage across workspaces.
        </p>
      </section>
      {focusedCircle ? (
        <section className="rounded-[2rem] border border-amber-200 bg-[linear-gradient(135deg,#fff7ed_0%,#ffffff_100%)] p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl">
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-amber-700">
                {entry === "trending-circle" ? "Focused from trending now" : "Focused group"}
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-stone-950">
                {focusedCircle.title}
              </h2>
              <p className="mt-3 text-sm leading-6 text-stone-600">
                {entry === "trending-circle"
                  ? "You landed here from the live home trend strip, so this group is highlighted first instead of dropping you into the full feed cold."
                  : "This group is highlighted first so you can jump straight into the specific shared listening path you selected."}
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
      {focusedMoment ? (
        <section className="rounded-[2rem] border border-emerald-200 bg-[linear-gradient(135deg,#ecfdf5_0%,#ffffff_100%)] p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl">
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-emerald-700">
                {entry === "trending-moment" ? "Focused from trending now" : "Focused highlight"}
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-stone-950">
                {focusedMoment.bookTitle}
              </h2>
              <p className="mt-3 text-base italic leading-7 text-stone-700">
                “{focusedMoment.quote}”
              </p>
              <p className="mt-3 text-sm leading-6 text-stone-600">
                {entry === "trending-moment"
                  ? "You landed here from the live home trend strip, so this shared highlight is highlighted first instead of getting buried inside the full community feed."
                  : "This highlight is highlighted first so you can jump straight into the specific shared quote you selected."}
              </p>
            </div>
            <div className="rounded-[1.2rem] border border-emerald-200 bg-white/90 px-4 py-4 shadow-sm">
              <p className="text-[0.65rem] font-medium uppercase tracking-[0.22em] text-stone-500">
                Listening context
              </p>
              <p className="mt-2 text-sm font-semibold text-stone-950">
                {focusedMoment.chapterLabel}
              </p>
              <p className="mt-2 text-sm leading-6 text-stone-600">
                {focusedMoment.source === "promoted"
                  ? "Promoted from a real player session"
                  : "Curated public highlight"}
              </p>
            </div>
          </div>
        </section>
      ) : null}
      <SocialReviewQueueCard
        circles={moderationCircles}
        moments={moderationMoments}
        mode={isReviewer ? "reviewer" : "owner"}
      />
      <SocialBackendSnapshotCard
        socialState={backendLibrarySnapshot?.socialState ?? null}
        syncedAt={backendLibrarySnapshot?.syncedAt ?? null}
      />
      <SocialCommunityPulseCard pulse={communityPulse} events={communityEvents} />
      <SocialCommunityActivityCard events={recentCommunityEvents} />
      <SocialMomentsFeedCard
        pulse={communityPulse}
        events={communityEvents}
        socialState={backendLibrarySnapshot?.socialState ?? null}
        focusedMomentId={focusedMomentId ?? null}
        persistentMoments={persistentMoments}
      />
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
        initialPublicCircles={persistentCircles}
      />
      <BookCirclesFeedCard
        initialSocialState={backendLibrarySnapshot?.socialState ?? null}
        communityPulse={communityPulse}
        communityEvents={communityEvents}
        initialPublicCircles={persistentCircles}
      />
    </AppShell>
  );
}
