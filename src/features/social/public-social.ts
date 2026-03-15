import { featuredBookCircles } from "@/features/discovery/book-circles";
import { featuredListeningEditions } from "@/features/discovery/listening-editions";
import {
  getCircleCommunityHeat,
  getCommunityHeatBadge,
  getEditionCommunityHeat,
} from "@/features/social/community-heat";
import type {
  SocialActivityEventKind,
  SocialCommunityActivityEventSummary,
  SocialCommunityPulseSummary,
} from "@/lib/backend/types";

export function formatSocialCommunityEventLabel(
  kind: SocialActivityEventKind,
  quantity: number,
) {
  if (kind === "edition-saved") {
    return `${quantity} save${quantity === 1 ? "" : "s"}`;
  }

  if (kind === "edition-reused") {
    return `${quantity} reuse${quantity === 1 ? "" : "s"}`;
  }

  if (kind === "circle-joined") {
    return `${quantity} join${quantity === 1 ? "" : "s"}`;
  }

  if (kind === "circle-reopened") {
    return `${quantity} reopen${quantity === 1 ? "" : "s"}`;
  }

  return `${quantity} share${quantity === 1 ? "" : "s"}`;
}

export function describeSocialCommunityEvent(event: SocialCommunityActivityEventSummary) {
  if (event.kind === "edition-saved" || event.kind === "edition-reused") {
    const edition =
      featuredListeningEditions.find((entry) => entry.id === event.subjectId) ?? null;

    return {
      title: edition?.title ?? "Listening edition",
      detail: edition
        ? `${edition.narratorName} for ${edition.bookTitle}`
        : "A saved listening style from the public feed.",
      href: edition ? `/social/editions/${edition.id}` : "/social",
    };
  }

  const circle = featuredBookCircles.find((entry) => entry.id === event.subjectId) ?? null;
  return {
    title: circle?.title ?? "Book circle",
    detail: circle
      ? `${circle.bookTitle} · ${circle.checkpoint}`
      : "A shared public listening group from the social feed.",
    href: circle ? `/social/circles/${circle.id}` : "/social",
  };
}

export function getPublicEditionDetail(
  editionId: string,
  pulse: SocialCommunityPulseSummary,
  events: SocialCommunityActivityEventSummary[],
) {
  const edition =
    featuredListeningEditions.find((entry) => entry.id === editionId) ?? null;

  if (!edition) {
    return null;
  }

  const relatedCircles = featuredBookCircles.filter(
    (circle) => circle.editionId === editionId,
  );
  const summary =
    pulse.editionCounts.find((entry) => entry.editionId === editionId) ?? null;
  const heat = getEditionCommunityHeat(events).get(editionId) ?? null;
  const recentEvents = events.filter((event) => event.subjectId === editionId);

  return {
    edition,
    relatedCircles,
    summary,
    heat,
    heatBadge: getCommunityHeatBadge(heat),
    recentEvents,
  };
}

export function getPublicCircleDetail(
  circleId: string,
  pulse: SocialCommunityPulseSummary,
  events: SocialCommunityActivityEventSummary[],
) {
  const circle = featuredBookCircles.find((entry) => entry.id === circleId) ?? null;

  if (!circle) {
    return null;
  }

  const edition =
    featuredListeningEditions.find((entry) => entry.id === circle.editionId) ?? null;
  const summary =
    pulse.circleCounts.find((entry) => entry.circleId === circleId) ?? null;
  const heat = getCircleCommunityHeat(events).get(circleId) ?? null;
  const recentEvents = events.filter((event) => event.subjectId === circleId);

  return {
    circle,
    edition,
    summary,
    heat,
    heatBadge: getCommunityHeatBadge(heat),
    recentEvents,
  };
}
