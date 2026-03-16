import { notFound } from "next/navigation";
import { SocialEditionDetailCard } from "@/components/library/social-edition-detail-card";
import { AppShell } from "@/components/shared/app-shell";
import { mapPublicSocialCircleRecord } from "@/features/discovery/book-circles";
import {
  listAllSocialActivityEvents,
  getSocialCommunityPulse,
  listPublicSocialCirclesWithOptions,
  listPublicSocialMomentsWithOptions,
  getWorkspaceLibrarySnapshot,
} from "@/lib/backend/sqlite";
import { getPublicEditionDetail } from "@/features/social/public-social";
import {
  getAllPublicSocialMoments,
  mapPublicSocialMomentRecord,
} from "@/features/social/public-moments";
import { isModerationReviewerAccount } from "@/lib/backend/moderation";
import {
  readAccountIdFromRequest,
  readWorkspaceIdFromRequest,
} from "@/lib/backend/workspace-session";

export default async function SocialEditionPage({
  params,
  searchParams,
}: {
  params: Promise<{ editionId: string }>;
  searchParams?: Promise<{
    moment?: string | string[];
    entry?: string | string[];
  }>;
}) {
  const { editionId } = await params;
  const resolvedSearchParams = (await searchParams) ?? {};
  const sourceMomentId = Array.isArray(resolvedSearchParams.moment)
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
  const detail = getPublicEditionDetail(
    editionId,
    pulse,
    events,
    backendLibrarySnapshot?.socialState ?? null,
    persistentCircles,
  );
  const allMoments = getAllPublicSocialMoments(
    backendLibrarySnapshot?.socialState ?? null,
    events,
    persistentMoments,
  );
  const relatedMoments = allMoments
    .filter((moment) => moment.editionId === editionId)
    .slice(0, 2);
  const sourceMoment = sourceMomentId
    ? allMoments.find((moment) => moment.id === sourceMomentId) ?? null
    : null;

  if (!detail) {
    notFound();
  }

  return (
    <AppShell eyebrow="Social edition" title={detail.edition.title}>
      <SocialEditionDetailCard
        edition={detail.edition}
        relatedCircles={detail.relatedCircles}
        summary={detail.summary}
        heatBadge={detail.heatBadge}
        recentEvents={detail.recentEvents}
        relatedCircleSummary={detail.relatedCircleSummary}
        otherActiveEditions={detail.otherActiveEditions}
        relatedMoments={relatedMoments}
        sourceMoment={sourceMoment}
        entry={entry ?? null}
        initialSocialState={backendLibrarySnapshot?.socialState ?? null}
      />
    </AppShell>
  );
}
