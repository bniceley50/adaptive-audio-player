import { notFound } from "next/navigation";
import { SocialCircleDetailCard } from "@/components/library/social-circle-detail-card";
import { AppShell } from "@/components/shared/app-shell";
import {
  getSocialCommunityPulse,
  getWorkspaceLibrarySnapshot,
  listRecentSocialActivityEvents,
} from "@/lib/backend/sqlite";
import { getPublicCircleDetail } from "@/features/social/public-social";
import { getAllPublicSocialMoments } from "@/features/social/public-moments";
import { readWorkspaceIdFromRequest } from "@/lib/backend/workspace-session";

export default async function SocialCirclePage({
  params,
  searchParams,
}: {
  params: Promise<{ circleId: string }>;
  searchParams?: Promise<{
    moment?: string | string[];
    entry?: string | string[];
  }>;
}) {
  const { circleId } = await params;
  const resolvedSearchParams = (await searchParams) ?? {};
  const sourceMomentId = Array.isArray(resolvedSearchParams.moment)
    ? resolvedSearchParams.moment[0]
    : resolvedSearchParams.moment;
  const entry = Array.isArray(resolvedSearchParams.entry)
    ? resolvedSearchParams.entry[0]
    : resolvedSearchParams.entry;
  const workspaceId = await readWorkspaceIdFromRequest();
  const backendLibrarySnapshot = workspaceId
    ? getWorkspaceLibrarySnapshot(workspaceId)
    : null;
  const pulse = getSocialCommunityPulse();
  const events = listRecentSocialActivityEvents(12);
  const detail = getPublicCircleDetail(circleId, pulse, events);
  const allMoments = getAllPublicSocialMoments(backendLibrarySnapshot?.socialState ?? null, events);
  const relatedMoments = allMoments
    .filter((moment) => moment.circleId === circleId)
    .slice(0, 2);
  const sourceMoment = sourceMomentId
    ? allMoments.find((moment) => moment.id === sourceMomentId) ?? null
    : null;

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
        relatedMoments={relatedMoments}
        sourceMoment={sourceMoment}
        entry={entry ?? null}
        initialSocialState={backendLibrarySnapshot?.socialState ?? null}
      />
    </AppShell>
  );
}
