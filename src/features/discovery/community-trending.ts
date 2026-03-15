import { featuredBookCircles, type FeaturedBookCircle } from "@/features/discovery/book-circles";
import {
  featuredListeningEditions,
  type FeaturedListeningEdition,
} from "@/features/discovery/listening-editions";
import {
  getAllPublicSocialMoments,
  type PublicSocialMoment,
} from "@/features/social/public-moments";
import type {
  SocialCommunityCircleSummary,
  SocialCommunityEditionSummary,
  SocialCommunityMomentSummary,
  SocialCommunityPulseSummary,
} from "@/lib/backend/types";
import type { SyncedSocialState } from "@/lib/types/social";

export interface TrendingEditionMatch {
  edition: FeaturedListeningEdition;
  stats: SocialCommunityEditionSummary;
}

export interface TrendingCircleMatch {
  circle: FeaturedBookCircle;
  stats: SocialCommunityCircleSummary;
}

export interface TrendingMomentMatch {
  moment: PublicSocialMoment;
  stats: SocialCommunityMomentSummary;
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

export function getTrendingMoments(
  pulse: SocialCommunityPulseSummary | null | undefined,
  socialState: SyncedSocialState | null = null,
  limit = 1,
): TrendingMomentMatch[] {
  if (!pulse) {
    return [];
  }

  const allMoments = getAllPublicSocialMoments(socialState);

  return pulse.momentCounts
    .map((stats) => ({
      stats,
      moment: allMoments.find((moment) => moment.id === stats.momentId) ?? null,
    }))
    .filter((value): value is TrendingMomentMatch => value.moment !== null)
    .slice(0, limit);
}
