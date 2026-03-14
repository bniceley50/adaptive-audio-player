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

export type HomeDiscoveryReasonInput = {
  hasSyncedBook: boolean;
  latestBookTitle?: string | null;
  spotlightName?: string | null;
};

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

export function getHomeDiscoveryReason(
  input: HomeDiscoveryReasonInput,
  preferences: DiscoveryPreferenceState,
): DiscoveryReason {
  if (input.hasSyncedBook) {
    return {
      label: "Because you already have a live listening path",
      detail: input.latestBookTitle
        ? `${input.latestBookTitle} is the shortest path back into the product, so resume stays ahead of discovery suggestions.`
        : "Your latest synced title is the shortest path back into the product, so resume stays ahead of discovery suggestions.",
    };
  }

  const joinedCircle = featuredBookCircles.find((circle) =>
    preferences.joinedCircles.includes(circle.id),
  );
  if (joinedCircle) {
    return {
      label: `Because you joined ${joinedCircle.title}`,
      detail:
        "The app keeps your active public circle ahead of other options so it is easier to return to a shared title and checkpoint.",
    };
  }

  if (input.spotlightName && preferences.followedAuthors.includes(input.spotlightName)) {
    return {
      label: `Because you follow ${input.spotlightName}`,
      detail:
        "The app is prioritizing the recommended edition for an author you already chose to follow.",
    };
  }

  if (preferences.trackedPlannedFeatures.includes("private-audio-files")) {
    return {
      label: "Because you saved private audiobook files",
      detail:
        "The app keeps the private-audio roadmap visible because you explicitly said that future path matters to you.",
    };
  }

  if (preferences.trackedPlannedFeatures.includes("richer-document-imports")) {
    return {
      label: "Because you saved richer document imports",
      detail:
        "The app is keeping the broader import roadmap close because you marked that future path as interesting.",
    };
  }

  return {
    label: "Because the fastest path still wins",
    detail:
      "For new or reset listeners, the product keeps the shortest path into setup and playback at the top instead of asking for more decisions.",
  };
}
