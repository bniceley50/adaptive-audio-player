import { featuredAuthorSpotlights } from "@/features/discovery/author-spotlights";
import { featuredBookCircles } from "@/features/discovery/book-circles";

export interface DiscoveryPreferenceState {
  followedAuthors: string[];
  joinedCircles: string[];
  trackedPlannedFeatures: string[];
}

export interface DiscoveryReason {
  label: string;
  detail: string;
}

export function getEditionDiscoveryReason(
  editionId: string,
  preferences: DiscoveryPreferenceState,
): DiscoveryReason | null {
  const joinedCircle = featuredBookCircles.find(
    (circle) =>
      preferences.joinedCircles.includes(circle.id) && circle.editionId === editionId,
  );
  if (joinedCircle) {
    return {
      label: `Because you joined ${joinedCircle.title}`,
      detail:
        "This edition is being surfaced first because it matches a public circle you already joined.",
    };
  }

  const followedAuthor = featuredAuthorSpotlights.find(
    (spotlight) =>
      preferences.followedAuthors.includes(spotlight.name) &&
      spotlight.recommendedEditionId === editionId,
  );
  if (followedAuthor) {
    return {
      label: `Because you follow ${followedAuthor.name}`,
      detail:
        "This edition is being surfaced because it is the recommended starting point for an author you already followed.",
    };
  }

  return null;
}

export function getCircleDiscoveryReason(
  circleId: string,
  preferences: DiscoveryPreferenceState,
): DiscoveryReason | null {
  const joinedCircle = featuredBookCircles.find(
    (circle) => preferences.joinedCircles.includes(circle.id) && circle.id === circleId,
  );
  if (!joinedCircle) {
    return null;
  }

  return {
    label: "Because you already joined this circle",
    detail:
      "The circle stays near the top so it is easy to jump back into the shared title, checkpoint, and edition.",
  };
}
