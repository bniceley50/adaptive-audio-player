import { featuredBookCircles } from "@/features/discovery/book-circles";
import { featuredListeningEditions } from "@/features/discovery/listening-editions";
import { getCommunityHeatBadge, getEditionCommunityHeat } from "@/features/social/community-heat";
import type {
  SocialCommunityActivityEventSummary,
  SocialCommunityPulseSummary,
} from "@/lib/backend/types";

export type PublicSocialMoment = {
  id: string;
  editionId: string;
  circleId: string;
  bookTitle: string;
  chapterLabel: string;
  quote: string;
  curatorNote: string;
  moodLabel: string;
};

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
  },
];

export function getMomentActivityScore(
  moment: PublicSocialMoment,
  pulse: SocialCommunityPulseSummary,
  events: SocialCommunityActivityEventSummary[],
) {
  const editionSummary =
    pulse.editionCounts.find((entry) => entry.editionId === moment.editionId) ?? null;
  const circleSummary =
    pulse.circleCounts.find((entry) => entry.circleId === moment.circleId) ?? null;
  const editionHeat = getEditionCommunityHeat(events).get(moment.editionId) ?? null;

  return {
    editionSummary,
    circleSummary,
    heatBadge: getCommunityHeatBadge(editionHeat),
    score:
      (editionSummary?.saves ?? 0) * 10 +
      (editionSummary?.reuses ?? 0) * 4 +
      (circleSummary?.joins ?? 0) * 8 +
      (circleSummary?.shares ?? 0) * 3 +
      (editionHeat?.score ?? 0),
  };
}

export function getPublicMomentDetail(
  momentId: string,
  pulse: SocialCommunityPulseSummary,
  events: SocialCommunityActivityEventSummary[],
) {
  const moment = publicSocialMoments.find((entry) => entry.id === momentId) ?? null;

  if (!moment) {
    return null;
  }

  const edition =
    featuredListeningEditions.find((entry) => entry.id === moment.editionId) ?? null;
  const circle =
    featuredBookCircles.find((entry) => entry.id === moment.circleId) ?? null;
  const activity = getMomentActivityScore(moment, pulse, events);
  const relatedMoments = publicSocialMoments
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

export function getPublicMomentsFeed(
  pulse: SocialCommunityPulseSummary,
  events: SocialCommunityActivityEventSummary[],
) {
  return publicSocialMoments
    .map((moment) => ({
      moment,
      edition:
        featuredListeningEditions.find((entry) => entry.id === moment.editionId) ?? null,
      circle: featuredBookCircles.find((entry) => entry.id === moment.circleId) ?? null,
      activity: getMomentActivityScore(moment, pulse, events),
    }))
    .sort((left, right) => right.activity.score - left.activity.score);
}
