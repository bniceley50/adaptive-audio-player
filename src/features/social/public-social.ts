import { featuredBookCircles } from "@/features/discovery/book-circles";
import { featuredListeningEditions } from "@/features/discovery/listening-editions";
import { publicSocialMoments } from "@/features/social/public-moments";
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

  if (kind === "moment-promoted") {
    return `${quantity} moment${quantity === 1 ? "" : "s"}`;
  }

  return `${quantity} share${quantity === 1 ? "" : "s"}`;
}

export function formatSocialCommunityRelativeTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Recently";
  }

  const diffMs = Date.now() - date.getTime();
  const diffHours = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60)));
  if (diffHours < 1) {
    return "Just now";
  }
  if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) {
    return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
  }

  return date.toLocaleDateString();
}

export function describeSocialCommunityEvent(event: SocialCommunityActivityEventSummary) {
  if (event.kind === "moment-promoted") {
    const moment = publicSocialMoments.find((entry) => entry.id === event.subjectId) ?? null;
    return {
      title: event.metadata?.bookTitle ?? moment?.bookTitle ?? "Public moment",
      detail:
        event.metadata?.quoteText ??
        moment?.quote ??
        "A memorable line promoted from a listener's player into the public social layer.",
      href: `/social/moments/${event.subjectId}`,
    };
  }

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

export function describeSocialCommunityTimelineEvent(
  event: SocialCommunityActivityEventSummary,
) {
  const subject = describeSocialCommunityEvent(event);
  const quantityLabel = `${event.quantity} listener${event.quantity === 1 ? "" : "s"}`;

  if (event.kind === "edition-saved") {
    return {
      eyebrow: "Saved to shelf",
      title: `${quantityLabel} saved this edition`,
      detail: `${subject.title} is getting added to synced shelves for ${subject.detail.toLowerCase()}.`,
    };
  }

  if (event.kind === "edition-reused") {
    return {
      eyebrow: "Reused in flow",
      title: `${quantityLabel} reused this edition`,
      detail: `${subject.title} is being brought back into active listening flows for ${subject.detail.toLowerCase()}.`,
    };
  }

  if (event.kind === "circle-joined") {
    return {
      eyebrow: "New joins",
      title: `${quantityLabel} joined this circle`,
      detail: `${subject.title} is pulling people into ${subject.detail.toLowerCase()}.`,
    };
  }

  if (event.kind === "circle-reopened") {
    return {
      eyebrow: "Back in rotation",
      title: `${quantityLabel} reopened this circle`,
      detail: `${subject.title} is getting reopened as listeners come back to ${subject.detail.toLowerCase()}.`,
    };
  }

  if (event.kind === "moment-promoted") {
    return {
      eyebrow: "Moment promoted",
      title: `${quantityLabel} promoted this moment`,
      detail: `${subject.title} is now carrying a memorable line into the shared social layer.`,
    };
  }

  return {
    eyebrow: "Shared out",
    title: `${quantityLabel} shared this circle`,
    detail: `${subject.title} is being passed around from ${subject.detail.toLowerCase()}.`,
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
  const editionHeat = getEditionCommunityHeat(events);
  const relatedCircleSummary = relatedCircles.reduce(
    (accumulator, circle) => {
      const circleSummary =
        pulse.circleCounts.find((entry) => entry.circleId === circle.id) ?? null;
      const joins = circleSummary?.joins ?? 0;
      const shares = circleSummary?.shares ?? 0;
      const score = joins * 10 + shares;

      return {
        totalJoins: accumulator.totalJoins + joins,
        totalShares: accumulator.totalShares + shares,
        strongestCircle:
          !accumulator.strongestCircle || score > accumulator.strongestCircle.score
            ? {
                circle,
                joins,
                shares,
                score,
              }
            : accumulator.strongestCircle,
      };
    },
    {
      totalJoins: 0,
      totalShares: 0,
      strongestCircle: null as
        | {
            circle: (typeof relatedCircles)[number];
            joins: number;
            shares: number;
            score: number;
          }
        | null,
    },
  );
  const otherActiveEditions = featuredListeningEditions
    .filter((entry) => entry.id !== editionId)
    .map((entry) => {
      const entrySummary =
        pulse.editionCounts.find((item) => item.editionId === entry.id) ?? null;
      const entryHeat = editionHeat.get(entry.id) ?? null;
      const score =
        (entrySummary?.saves ?? 0) * 10 +
        (entrySummary?.reuses ?? 0) +
        (entryHeat?.score ?? 0);

      return {
        edition: entry,
        summary: entrySummary,
        heatBadge: getCommunityHeatBadge(entryHeat),
        score,
      };
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, 2);

  return {
    edition,
    relatedCircles,
    summary,
    heat,
    heatBadge: getCommunityHeatBadge(heat),
    recentEvents,
    relatedCircleSummary,
    otherActiveEditions,
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
  const circleHeat = getCircleCommunityHeat(events);
  const editionSummary = edition
    ? pulse.editionCounts.find((entry) => entry.editionId === edition.id) ?? null
    : null;
  const otherActiveCircles = featuredBookCircles
    .filter((entry) => entry.id !== circleId)
    .map((entry) => {
      const entrySummary =
        pulse.circleCounts.find((item) => item.circleId === entry.id) ?? null;
      const entryHeat = circleHeat.get(entry.id) ?? null;
      const score =
        (entrySummary?.joins ?? 0) * 10 +
        (entrySummary?.shares ?? 0) +
        (entrySummary?.reopens ?? 0) * 3 +
        (entryHeat?.score ?? 0);

      return {
        circle: entry,
        summary: entrySummary,
        heatBadge: getCommunityHeatBadge(entryHeat),
        score,
      };
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, 2);

  return {
    circle,
    edition,
    editionSummary,
    summary,
    heat,
    heatBadge: getCommunityHeatBadge(heat),
    recentEvents,
    otherActiveCircles,
  };
}
