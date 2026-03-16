import type { PublicSocialCircleRecord, SocialCommunityActivityEventSummary } from "@/lib/backend/types";
import type { SyncedSocialState } from "@/lib/types/social";

export type FeaturedBookCircle = {
  id: string;
  title: string;
  editionId: string;
  host: string;
  moderationStatus?: "active" | "review" | "hidden";
  reportCount?: number;
  bookTitle: string;
  memberCount: number;
  checkpoint: string;
  vibe: string;
  summary: string;
  source?: "featured" | "created";
};

export const featuredBookCircles: FeaturedBookCircle[] = [
  {
    id: "storm-harbor-night-watch",
    title: "Night Watch Circle",
    editionId: "cinematic-harbor",
    host: "Editorial Circle",
    bookTitle: "Storm Harbor",
    memberCount: 184,
    checkpoint: "This week: Chapters 1-3 and the harbor reveal",
    vibe: "High-stakes mystery with a cinematic listening edition",
    summary:
      "A public circle for listeners who want one strong starter edition and a clear weekly checkpoint.",
    source: "featured",
  },
  {
    id: "ashen-signals-close-read",
    title: "Close Read Circle",
    editionId: "quiet-detective",
    host: "Library Desk",
    bookTitle: "Ashen Signals",
    memberCount: 126,
    checkpoint: "This week: Opening investigation and first interview",
    vibe: "Dialogue-first suspense with a quieter narration profile",
    summary:
      "Built for listeners who want a cleaner, more serious edition and slower chapter discussion.",
    source: "featured",
  },
  {
    id: "observatory-late-shift",
    title: "Late Shift Circle",
    editionId: "night-window",
    host: "Late Shift Club",
    bookTitle: "The Last Observatory",
    memberCount: 209,
    checkpoint: "This week: Observatory arrival and the first sky log",
    vibe: "Reflective night listening with a softer ambient edition",
    summary:
      "A public circle for end-of-day listeners who want to keep one book moving together without a heavy group chat.",
    source: "featured",
  },
];

export function mapPublicSocialCircleRecord(
  circle: PublicSocialCircleRecord,
): FeaturedBookCircle {
  return {
    id: circle.id,
    title: circle.title,
    editionId: circle.editionId,
    host: circle.ownerDisplayName?.trim() || circle.host,
    moderationStatus: circle.moderationStatus,
    reportCount: circle.reportCount,
    bookTitle: circle.bookTitle,
    memberCount: circle.memberCount,
    checkpoint: circle.checkpoint,
    vibe: circle.vibe,
    summary: circle.summary,
    source: "created",
  };
}

export function getAllPublicBookCircles(
  socialState: SyncedSocialState | null = null,
  events: SocialCommunityActivityEventSummary[] = [],
  persistentCircles: FeaturedBookCircle[] = [],
): FeaturedBookCircle[] {
  const backendCreated = events
    .filter(
      (event) =>
        (event.kind === "circle-joined" ||
          event.kind === "circle-reopened" ||
          event.kind === "circle-shared") &&
        event.metadata?.circleTitle &&
        event.metadata?.editionId,
    )
    .map((event) => ({
      id: event.subjectId,
      title: event.metadata?.circleTitle ?? "Community circle",
      editionId: event.metadata?.editionId ?? "",
      host: event.metadata?.circleHost ?? "Community",
      bookTitle: event.metadata?.bookTitle ?? "Untitled book",
      memberCount: Math.max(1, event.quantity),
      checkpoint: event.metadata?.circleCheckpoint ?? "Community checkpoint",
      vibe: event.metadata?.circleVibe ?? "Listener-created discussion path",
      summary:
        event.metadata?.circleSummary ??
        "A public circle seeded from real backend social activity.",
      source: "created" as const,
    }));
  const created = (socialState?.createdCircles ?? []).map((circle) => ({
    ...circle,
    source: "created" as const,
  }));

  const byId = new Map<string, FeaturedBookCircle>();
  for (const circle of [
    ...featuredBookCircles,
    ...backendCreated,
    ...created,
    ...persistentCircles,
  ]) {
    byId.set(circle.id, circle);
  }

  return [...byId.values()];
}
