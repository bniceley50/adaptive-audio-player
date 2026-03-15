import { featuredBookCircles } from "@/features/discovery/book-circles";
import { featuredListeningEditions } from "@/features/discovery/listening-editions";
import type { SyncedSocialState } from "@/lib/types/social";

export type SocialTimelineEvent = {
  id: string;
  occurredAt: string;
  label: string;
  title: string;
  detail: string;
  href: string;
};

export function buildSocialTimelineEvents(
  socialState: SyncedSocialState | null | undefined,
): SocialTimelineEvent[] {
  if (!socialState) {
    return [];
  }

  const nextEvents: SocialTimelineEvent[] = [];

  for (const entry of socialState.savedEditions) {
    const edition =
      featuredListeningEditions.find((candidate) => candidate.id === entry.editionId) ?? null;
    if (!edition) {
      continue;
    }

    nextEvents.push({
      id: `saved-${entry.editionId}`,
      occurredAt: entry.savedAt,
      label: "Saved edition",
      title: edition.title,
      detail: `${edition.narratorName} for ${edition.bookTitle}`,
      href: `/import?edition=${edition.id}`,
    });

    if (entry.lastUsedAt && entry.lastUsedAt !== entry.savedAt) {
      nextEvents.push({
        id: `used-${entry.editionId}`,
        occurredAt: entry.lastUsedAt,
        label: "Reused edition",
        title: edition.title,
        detail: "Brought back into the import flow from your synced shelf.",
        href: `/import?edition=${edition.id}`,
      });
    }
  }

  for (const entry of socialState.circleMemberships) {
    const circle =
      featuredBookCircles.find((candidate) => candidate.id === entry.circleId) ?? null;
    if (!circle) {
      continue;
    }

    nextEvents.push({
      id: `joined-${entry.circleId}`,
      occurredAt: entry.joinedAt,
      label: "Joined circle",
      title: circle.title,
      detail: circle.checkpoint,
      href: `/import?edition=${circle.editionId}`,
    });

    if (entry.lastOpenedAt && entry.lastOpenedAt !== entry.joinedAt) {
      nextEvents.push({
        id: `opened-${entry.circleId}`,
        occurredAt: entry.lastOpenedAt,
        label: entry.shareCount > 0 ? "Shared circle" : "Reopened circle",
        title: circle.title,
        detail:
          entry.shareCount > 0
            ? `${entry.shareCount} share${entry.shareCount === 1 ? "" : "s"} so far`
            : "Brought back into the listening flow from your synced shelf.",
        href: `/import?edition=${circle.editionId}`,
      });
    }
  }

  for (const entry of socialState.promotedMoments) {
    nextEvents.push({
      id: `moment-${entry.id}`,
      occurredAt: entry.promotedAt,
      label: "Promoted moment",
      title: entry.bookTitle,
      detail: `“${entry.quoteText}” · ${entry.chapterLabel}`,
      href: `/social/moments/${entry.id}`,
    });
  }

  return nextEvents
    .sort(
      (left, right) =>
        new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime(),
    )
    .slice(0, 6);
}
