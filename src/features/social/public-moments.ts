import { getAllPublicBookCircles } from "@/features/discovery/book-circles";
import type { FeaturedBookCircle } from "@/features/discovery/book-circles";
import { featuredListeningEditions } from "@/features/discovery/listening-editions";
import {
  getCommunityHeatBadge,
  getEditionCommunityHeat,
  getMomentCommunityHeat,
} from "@/features/social/community-heat";
import type {
  PublicSocialMomentRecord,
  SocialCommunityActivityEventSummary,
  SocialCommunityPulseSummary,
} from "@/lib/backend/types";
import type { PromotedSocialMomentRecord, SyncedSocialState } from "@/lib/types/social";

export type PublicSocialMoment = {
  id: string;
  editionId: string | null;
  circleId: string | null;
  bookTitle: string;
  chapterLabel: string;
  quote: string;
  curatorNote: string;
  moodLabel: string;
  ownerLabel?: string | null;
  moderationStatus?: "active" | "review" | "hidden";
  reportCount?: number;
  source: "curated" | "promoted";
};

export function mapPublicSocialMomentRecord(
  record: PublicSocialMomentRecord,
): PublicSocialMoment {
  return {
    id: record.id,
    editionId: record.editionId,
    circleId: record.circleId,
    bookTitle: record.bookTitle,
    chapterLabel: record.chapterLabel,
    quote: record.quoteText,
    curatorNote:
      "Promoted from a saved quote in a real player session so it can live inside the public social layer.",
    moodLabel: "Shared moment",
    ownerLabel: record.ownerDisplayName?.trim() || null,
    moderationStatus: record.moderationStatus,
    reportCount: record.reportCount,
    source: "promoted",
  };
}

export const publicSocialMoments: PublicSocialMoment[] = [
  {
    id: "storm-harbor-first-reveal",
    editionId: "cinematic-harbor",
    circleId: "storm-harbor-night-watch",
    bookTitle: "Storm Harbor",
    chapterLabel: "Chapter 3",
    quote: "The harbor did not look asleep. It looked like it was waiting.",
    curatorNote:
      "This is the moment the cinematic edition starts paying off. The voice and pacing make the reveal feel expensive without losing clarity.",
    moodLabel: "Big reveal",
    source: "curated",
  },
  {
    id: "ashen-signals-interview-room",
    editionId: "quiet-detective",
    circleId: "ashen-signals-close-read",
    bookTitle: "Ashen Signals",
    chapterLabel: "Chapter 2",
    quote: "He answered too quickly, like he had rehearsed innocence more than truth.",
    curatorNote:
      "A dialogue-first moment that shows why a cleaner, quieter edition works for this book circle.",
    moodLabel: "Close read",
    source: "curated",
  },
  {
    id: "observatory-sky-log",
    editionId: "night-window",
    circleId: "observatory-late-shift",
    bookTitle: "The Last Observatory",
    chapterLabel: "Chapter 4",
    quote: "The sky log was not a record. It was a warning written politely.",
    curatorNote:
      "Late-night listeners keep sharing this because the softer ambient profile still leaves the line feeling sharp.",
    moodLabel: "Night listen",
    source: "curated",
  },
];

export function resolveMatchingPublicEdition(input: {
  bookTitle: string;
  narratorName?: string | null;
  mode?: string | null;
}) {
  return (
    featuredListeningEditions.find(
      (edition) =>
        edition.bookTitle === input.bookTitle &&
        (input.narratorName ? edition.narratorName === input.narratorName : true) &&
        (input.mode ? edition.mode === input.mode : true),
    ) ?? featuredListeningEditions.find((edition) => edition.bookTitle === input.bookTitle) ?? null
  );
}

export function resolveMatchingPublicCircle(
  editionId: string | null,
  socialState: SyncedSocialState | null = null,
  events: SocialCommunityActivityEventSummary[] = [],
  persistentCircles: FeaturedBookCircle[] = [],
) {
  if (!editionId) {
    return null;
  }

  return (
    getAllPublicBookCircles(socialState, events, persistentCircles).find(
      (circle) => circle.editionId === editionId,
    ) ?? null
  );
}

function buildPromotedPublicMoment(record: PromotedSocialMomentRecord): PublicSocialMoment {
  return {
    id: record.id,
    editionId: record.editionId,
    circleId: record.circleId,
    bookTitle: record.bookTitle,
    chapterLabel: record.chapterLabel,
    quote: record.quoteText,
    curatorNote:
      "Promoted from a saved quote in your player so it can live inside the social layer.",
    moodLabel: "Your moment",
    ownerLabel: null,
    moderationStatus: "active",
    reportCount: 0,
    source: "promoted",
  };
}

function buildPromotedMomentFromEvent(
  event: SocialCommunityActivityEventSummary,
): PublicSocialMoment | null {
  if (event.kind !== "moment-promoted") {
    return null;
  }

  const quote = event.metadata?.quoteText?.trim();
  const bookTitle = event.metadata?.bookTitle?.trim();
  const chapterLabel = event.metadata?.chapterLabel?.trim();

  if (!quote || !bookTitle || !chapterLabel) {
    return null;
  }

  return {
    id: event.subjectId,
    editionId: event.metadata?.editionId ?? null,
    circleId: event.metadata?.circleId ?? null,
    bookTitle,
    chapterLabel,
    quote,
    curatorNote:
      "Promoted from a saved quote in a real player session so it can live inside the public social layer.",
    moodLabel: "Shared moment",
    ownerLabel: null,
    moderationStatus: "active",
    reportCount: 0,
    source: "promoted",
  };
}

export function getAllPublicSocialMoments(
  socialState: SyncedSocialState | null = null,
  events: SocialCommunityActivityEventSummary[] = [],
  persistentMoments: PublicSocialMoment[] = [],
) {
  const byId = new Map<string, PublicSocialMoment>();

  for (const moment of publicSocialMoments) {
    byId.set(moment.id, moment);
  }

  for (const event of events) {
    const promotedMoment = buildPromotedMomentFromEvent(event);
    if (promotedMoment) {
      byId.set(promotedMoment.id, promotedMoment);
    }
  }

  for (const record of socialState?.promotedMoments ?? []) {
    const promotedMoment = buildPromotedPublicMoment(record);
    byId.set(promotedMoment.id, promotedMoment);
  }

  for (const moment of persistentMoments) {
    byId.set(moment.id, moment);
  }

  return [...byId.values()];
}

export function getMomentActivityScore(
  moment: PublicSocialMoment,
  pulse: SocialCommunityPulseSummary,
  events: SocialCommunityActivityEventSummary[],
) {
  const momentSummary =
    pulse.momentCounts.find((entry) => entry.momentId === moment.id) ?? null;
  const editionSummary =
    moment.editionId
      ? pulse.editionCounts.find((entry) => entry.editionId === moment.editionId) ?? null
      : null;
  const circleSummary =
    moment.circleId
      ? pulse.circleCounts.find((entry) => entry.circleId === moment.circleId) ?? null
      : null;
  const editionHeat =
    moment.editionId ? getEditionCommunityHeat(events).get(moment.editionId) ?? null : null;
  const momentHeat = getMomentCommunityHeat(events).get(moment.id) ?? null;

  return {
    momentSummary,
    editionSummary,
    circleSummary,
    heatBadge: getCommunityHeatBadge(momentHeat ?? editionHeat),
    score:
      (momentSummary?.promotions ?? 0) * 12 +
      (editionSummary?.saves ?? 0) * 10 +
      (editionSummary?.reuses ?? 0) * 4 +
      (circleSummary?.joins ?? 0) * 8 +
      (circleSummary?.shares ?? 0) * 3 +
      (momentHeat?.score ?? 0) +
      (editionHeat?.score ?? 0) +
      (moment.source === "promoted" ? 12 : 0) -
      (moment.moderationStatus === "review" ? 1000 : 0),
  };
}

export function getPublicMomentDetail(
  momentId: string,
  pulse: SocialCommunityPulseSummary,
  events: SocialCommunityActivityEventSummary[],
  socialState: SyncedSocialState | null = null,
  persistentCircles: FeaturedBookCircle[] = [],
  persistentMoments: PublicSocialMoment[] = [],
) {
  const allMoments = getAllPublicSocialMoments(socialState, events, persistentMoments);
  const moment = allMoments.find((entry) => entry.id === momentId) ?? null;

  if (!moment) {
    return null;
  }

  const edition =
    moment.editionId
      ? featuredListeningEditions.find((entry) => entry.id === moment.editionId) ?? null
      : null;
  const circle =
    moment.circleId
      ? getAllPublicBookCircles(socialState, events, persistentCircles).find(
          (entry) => entry.id === moment.circleId,
        ) ?? null
      : null;
  const activity = getMomentActivityScore(moment, pulse, events);
  const relatedMoments = allMoments
    .filter((entry) => entry.id !== moment.id)
    .map((entry) => ({
      moment: entry,
      activity: getMomentActivityScore(entry, pulse, events),
    }))
    .sort((left, right) => right.activity.score - left.activity.score)
    .slice(0, 2);

  return {
    moment,
    edition,
    circle,
    activity,
    relatedMoments,
  };
}

export function getPublicMomentCircleStarter(
  momentId: string,
  pulse: SocialCommunityPulseSummary,
  events: SocialCommunityActivityEventSummary[],
  socialState: SyncedSocialState | null = null,
  persistentCircles: FeaturedBookCircle[] = [],
  persistentMoments: PublicSocialMoment[] = [],
) {
  const detail = getPublicMomentDetail(
    momentId,
    pulse,
    events,
    socialState,
    persistentCircles,
    persistentMoments,
  );

  if (!detail) {
    return null;
  }

  const suggestedTitle = detail.circle
    ? `${detail.circle.title} follow-on`
    : `${detail.moment.bookTitle} ${detail.moment.chapterLabel} circle`;
  const suggestedCheckpoint = `${detail.moment.chapterLabel} and the promoted line`;
  const suggestedVibe = detail.circle
    ? detail.circle.vibe
    : `${detail.moment.moodLabel.toLowerCase()} discussion around one memorable listening moment`;
  const suggestedSummary = detail.edition
    ? `A fresh public circle seeded from “${detail.moment.quote}” using ${detail.edition.title} as the starting listening edition.`
    : `A fresh public circle seeded from “${detail.moment.quote}” so listeners can start from one strong shared moment.`;

  return {
    ...detail,
    suggestedTitle,
    suggestedCheckpoint,
    suggestedVibe,
    suggestedSummary,
  };
}

export function getPublicMomentsFeed(
  pulse: SocialCommunityPulseSummary,
  events: SocialCommunityActivityEventSummary[],
  socialState: SyncedSocialState | null = null,
  persistentCircles: FeaturedBookCircle[] = [],
  persistentMoments: PublicSocialMoment[] = [],
) {
  return getAllPublicSocialMoments(socialState, events, persistentMoments)
    .map((moment) => ({
      moment,
      edition:
        moment.editionId
          ? featuredListeningEditions.find((entry) => entry.id === moment.editionId) ?? null
          : null,
      circle:
        moment.circleId
          ? getAllPublicBookCircles(socialState, events, persistentCircles).find(
              (entry) => entry.id === moment.circleId,
            ) ?? null
          : null,
      activity: getMomentActivityScore(moment, pulse, events),
    }))
    .sort((left, right) => right.activity.score - left.activity.score);
}
