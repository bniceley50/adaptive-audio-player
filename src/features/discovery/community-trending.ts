import { featuredBookCircles, type FeaturedBookCircle } from "@/features/discovery/book-circles";
import {
  featuredListeningEditions,
  type FeaturedListeningEdition,
} from "@/features/discovery/listening-editions";
import type {
  SocialCommunityCircleSummary,
  SocialCommunityEditionSummary,
  SocialCommunityPulseSummary,
} from "@/lib/backend/types";

export interface TrendingEditionMatch {
  edition: FeaturedListeningEdition;
  stats: SocialCommunityEditionSummary;
}

export interface TrendingCircleMatch {
  circle: FeaturedBookCircle;
  stats: SocialCommunityCircleSummary;
}

export function getTrendingEditions(
  pulse: SocialCommunityPulseSummary | null | undefined,
  limit = 1,
): TrendingEditionMatch[] {
  if (!pulse) {
    return [];
  }

  return pulse.editionCounts
    .map((stats) => ({
      stats,
      edition:
        featuredListeningEditions.find((edition) => edition.id === stats.editionId) ?? null,
    }))
    .filter((value): value is TrendingEditionMatch => value.edition !== null)
    .slice(0, limit);
}

export function getTrendingCircles(
  pulse: SocialCommunityPulseSummary | null | undefined,
  limit = 1,
): TrendingCircleMatch[] {
  if (!pulse) {
    return [];
  }

  return pulse.circleCounts
    .map((stats) => ({
      stats,
      circle: featuredBookCircles.find((circle) => circle.id === stats.circleId) ?? null,
    }))
    .filter((value): value is TrendingCircleMatch => value.circle !== null)
    .slice(0, limit);
}
