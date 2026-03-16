import { notFound } from "next/navigation";
import { SocialMomentDetailCard } from "@/components/library/social-moment-detail-card";
import { AppShell } from "@/components/shared/app-shell";
import { mapPublicSocialCircleRecord } from "@/features/discovery/book-circles";
import {
  getPublicMomentDetail,
  mapPublicSocialMomentRecord,
} from "@/features/social/public-moments";
import {
  listAllSocialActivityEvents,
  getSocialCommunityPulse,
  listPublicSocialCirclesWithOptions,
  listPublicSocialMomentsWithOptions,
  getWorkspaceLibrarySnapshot,
} from "@/lib/backend/sqlite";
import { isModerationReviewerAccount } from "@/lib/backend/moderation";
import {
  readAccountIdFromRequest,
  readWorkspaceIdFromRequest,
} from "@/lib/backend/workspace-session";

export default async function SocialMomentPage({
  params,
  searchParams,
}: {
  params: Promise<{ momentId: string }>;
  searchParams?: Promise<{
    entry?: string | string[];
  }>;
}) {
  const { momentId } = await params;
  const resolvedSearchParams = (await searchParams) ?? {};
  const entry = Array.isArray(resolvedSearchParams.entry)
    ? resolvedSearchParams.entry[0]
    : resolvedSearchParams.entry;
  const accountId = await readAccountIdFromRequest();
  const workspaceId = await readWorkspaceIdFromRequest();
  const isReviewer = isModerationReviewerAccount(accountId);
  const backendLibrarySnapshot = workspaceId
    ? getWorkspaceLibrarySnapshot(workspaceId)
    : null;
  const pulse = getSocialCommunityPulse();
  const events = listAllSocialActivityEvents();
  const persistentCircles = listPublicSocialCirclesWithOptions({
    includeHiddenOwnedByWorkspaceId: workspaceId,
    includeAllHidden: isReviewer,
  }).map(mapPublicSocialCircleRecord);
  const persistentMoments = listPublicSocialMomentsWithOptions({
    includeHiddenOwnedByWorkspaceId: workspaceId,
    includeAllHidden: isReviewer,
  }).map(mapPublicSocialMomentRecord);
  const detail = getPublicMomentDetail(
    momentId,
    pulse,
    events,
    backendLibrarySnapshot?.socialState ?? null,
    persistentCircles,
    persistentMoments,
  );

  if (!detail) {
    notFound();
  }

  return (
    <AppShell eyebrow="Public moment" title={detail.moment.bookTitle}>
      <SocialMomentDetailCard
        moment={detail.moment}
        edition={detail.edition}
        circle={detail.circle}
        activity={detail.activity}
        relatedMoments={detail.relatedMoments}
        canModerate={detail.moment.ownerWorkspaceId === workspaceId || isReviewer}
        entry={entry ?? null}
      />
    </AppShell>
  );
}
