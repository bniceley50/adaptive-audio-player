import { notFound } from "next/navigation";
import { SocialCircleStarterCard } from "@/components/library/social-circle-starter-card";
import { AppShell } from "@/components/shared/app-shell";
import { mapPublicSocialCircleRecord } from "@/features/discovery/book-circles";
import { getPublicMomentCircleStarter } from "@/features/social/public-moments";
import {
  listAllSocialActivityEvents,
  getSocialCommunityPulse,
  listPublicSocialCircles,
  getWorkspaceLibrarySnapshot,
} from "@/lib/backend/sqlite";
import { readWorkspaceIdFromRequest } from "@/lib/backend/workspace-session";

export default async function SocialCircleStarterPage({
  searchParams,
}: {
  searchParams?: Promise<{
    moment?: string | string[];
  }>;
}) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const momentId = Array.isArray(resolvedSearchParams.moment)
    ? resolvedSearchParams.moment[0]
    : resolvedSearchParams.moment;

  if (!momentId) {
    notFound();
  }

  const workspaceId = await readWorkspaceIdFromRequest();
  const backendLibrarySnapshot = workspaceId
    ? getWorkspaceLibrarySnapshot(workspaceId)
    : null;
  const pulse = getSocialCommunityPulse();
  const events = listAllSocialActivityEvents();
  const persistentCircles = listPublicSocialCircles().map(mapPublicSocialCircleRecord);
  const starter = getPublicMomentCircleStarter(
    momentId,
    pulse,
    events,
    backendLibrarySnapshot?.socialState ?? null,
    persistentCircles,
  );

  if (!starter) {
    notFound();
  }

  return (
    <AppShell eyebrow="Circle starter" title={starter.moment.bookTitle}>
      <SocialCircleStarterCard
        moment={starter.moment}
        edition={starter.edition}
        circle={starter.circle}
        suggestedTitle={starter.suggestedTitle}
        suggestedCheckpoint={starter.suggestedCheckpoint}
        suggestedVibe={starter.suggestedVibe}
        suggestedSummary={starter.suggestedSummary}
      />
    </AppShell>
  );
}
