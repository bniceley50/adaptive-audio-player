import { notFound } from "next/navigation";
import { SocialCircleDetailCard } from "@/components/library/social-circle-detail-card";
import { AppShell } from "@/components/shared/app-shell";
import {
  getSocialCommunityPulse,
  getWorkspaceLibrarySnapshot,
  listRecentSocialActivityEvents,
} from "@/lib/backend/sqlite";
import { getPublicCircleDetail } from "@/features/social/public-social";
import { readWorkspaceIdFromRequest } from "@/lib/backend/workspace-session";

export default async function SocialCirclePage({
  params,
}: {
  params: Promise<{ circleId: string }>;
}) {
  const { circleId } = await params;
  const workspaceId = await readWorkspaceIdFromRequest();
  const backendLibrarySnapshot = workspaceId
    ? getWorkspaceLibrarySnapshot(workspaceId)
    : null;
  const pulse = getSocialCommunityPulse();
  const events = listRecentSocialActivityEvents(12);
  const detail = getPublicCircleDetail(circleId, pulse, events);

  if (!detail) {
    notFound();
  }

  return (
    <AppShell eyebrow="Book circle" title={detail.circle.title}>
      <SocialCircleDetailCard
        circle={detail.circle}
        edition={detail.edition}
        editionSummary={detail.editionSummary}
        summary={detail.summary}
        heatBadge={detail.heatBadge}
        recentEvents={detail.recentEvents}
        otherActiveCircles={detail.otherActiveCircles}
        initialSocialState={backendLibrarySnapshot?.socialState ?? null}
      />
    </AppShell>
  );
}
