import type {
  SocialActivityEventKind,
  SocialCommunityActivityEventSummary,
} from "@/lib/backend/types";

export interface CommunityHeatSummary {
  score: number;
  lastActivityAt: string;
}

function getWeight(kind: SocialActivityEventKind) {
  if (kind === "edition-saved" || kind === "circle-joined") {
    return 4;
  }

  if (kind === "edition-reused" || kind === "circle-reopened") {
    return 3;
  }

  return 2;
}

function accumulateHeat(
  events: SocialCommunityActivityEventSummary[],
  predicate: (event: SocialCommunityActivityEventSummary) => boolean,
) {
  const scores = new Map<string, CommunityHeatSummary>();

  for (const event of events) {
    if (!predicate(event)) {
      continue;
    }

    const current = scores.get(event.subjectId) ?? {
      score: 0,
      lastActivityAt: event.occurredAt,
    };
    current.score += getWeight(event.kind) * Math.max(1, event.quantity);
    if (new Date(event.occurredAt).getTime() > new Date(current.lastActivityAt).getTime()) {
      current.lastActivityAt = event.occurredAt;
    }
    scores.set(event.subjectId, current);
  }

  return scores;
}

export function getEditionCommunityHeat(
  events: SocialCommunityActivityEventSummary[] | null | undefined,
) {
  return accumulateHeat(
    events ?? [],
    (event) => event.kind === "edition-saved" || event.kind === "edition-reused",
  );
}

export function getCircleCommunityHeat(
  events: SocialCommunityActivityEventSummary[] | null | undefined,
) {
  return accumulateHeat(
    events ?? [],
    (event) =>
      event.kind === "circle-joined" ||
      event.kind === "circle-reopened" ||
      event.kind === "circle-shared",
  );
}

export function getCommunityHeatBadge(summary: CommunityHeatSummary | null | undefined) {
  if (!summary) {
    return null;
  }

  const ageMs = Date.now() - new Date(summary.lastActivityAt).getTime();
  const oneDay = 1000 * 60 * 60 * 24;

  if (ageMs <= oneDay) {
    return "Heating up";
  }

  if (summary.score >= 6) {
    return "Active this week";
  }

  return "Recent activity";
}
