import { notFound } from "next/navigation";
import { SocialEditionDetailCard } from "@/components/library/social-edition-detail-card";
import { AppShell } from "@/components/shared/app-shell";
import {
  getSocialCommunityPulse,
  getWorkspaceLibrarySnapshot,
  listRecentSocialActivityEvents,
} from "@/lib/backend/sqlite";
import { getPublicEditionDetail } from "@/features/social/public-social";
import { readWorkspaceIdFromRequest } from "@/lib/backend/workspace-session";

export default async function SocialEditionPage({
  params,
}: {
  params: Promise<{ editionId: string }>;
}) {
  const { editionId } = await params;
  const workspaceId = await readWorkspaceIdFromRequest();
  const backendLibrarySnapshot = workspaceId
    ? getWorkspaceLibrarySnapshot(workspaceId)
    : null;
  const pulse = getSocialCommunityPulse();
  const events = listRecentSocialActivityEvents(12);
  const detail = getPublicEditionDetail(editionId, pulse, events);

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
        initialSocialState={backendLibrarySnapshot?.socialState ?? null}
      />
    </AppShell>
  );
}
