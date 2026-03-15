import { notFound } from "next/navigation";
import { SocialEditionDetailCard } from "@/components/library/social-edition-detail-card";
import { AppShell } from "@/components/shared/app-shell";
import {
  listAllSocialActivityEvents,
  getSocialCommunityPulse,
  getWorkspaceLibrarySnapshot,
} from "@/lib/backend/sqlite";
import { getPublicEditionDetail } from "@/features/social/public-social";
import { getAllPublicSocialMoments } from "@/features/social/public-moments";
import { readWorkspaceIdFromRequest } from "@/lib/backend/workspace-session";

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
  const workspaceId = await readWorkspaceIdFromRequest();
  const backendLibrarySnapshot = workspaceId
    ? getWorkspaceLibrarySnapshot(workspaceId)
    : null;
  const pulse = getSocialCommunityPulse();
  const events = listAllSocialActivityEvents();
  const detail = getPublicEditionDetail(
    editionId,
    pulse,
    events,
    backendLibrarySnapshot?.socialState ?? null,
  );
  const allMoments = getAllPublicSocialMoments(backendLibrarySnapshot?.socialState ?? null, events);
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
