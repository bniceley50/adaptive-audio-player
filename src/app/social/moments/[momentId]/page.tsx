import { notFound } from "next/navigation";
import { SocialMomentDetailCard } from "@/components/library/social-moment-detail-card";
import { AppShell } from "@/components/shared/app-shell";
import { mapPublicSocialCircleRecord } from "@/features/discovery/book-circles";
import { getPublicMomentDetail } from "@/features/social/public-moments";
import {
  listAllSocialActivityEvents,
  getSocialCommunityPulse,
  listPublicSocialCircles,
  getWorkspaceLibrarySnapshot,
} from "@/lib/backend/sqlite";
import { readWorkspaceIdFromRequest } from "@/lib/backend/workspace-session";

export default async function SocialMomentPage({
  params,
}: {
  params: Promise<{ momentId: string }>;
}) {
  const { momentId } = await params;
  const workspaceId = await readWorkspaceIdFromRequest();
  const backendLibrarySnapshot = workspaceId
    ? getWorkspaceLibrarySnapshot(workspaceId)
    : null;
  const pulse = getSocialCommunityPulse();
  const events = listAllSocialActivityEvents();
  const persistentCircles = listPublicSocialCircles().map(mapPublicSocialCircleRecord);
  const detail = getPublicMomentDetail(
    momentId,
    pulse,
    events,
    backendLibrarySnapshot?.socialState ?? null,
    persistentCircles,
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
      />
    </AppShell>
  );
}
