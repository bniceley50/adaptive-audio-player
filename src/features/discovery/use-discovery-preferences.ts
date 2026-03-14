"use client";

import { useEffect, useState } from "react";
import {
  discoveryChangedEvent,
  readPinnedDiscoverySignal,
  readFollowedAuthors,
  readFollowedAuthorTimestamps,
  readJoinedCircles,
  readJoinedCircleTimestamps,
  readTrackedFeatureTimestamps,
  readTrackedPlannedFeatures,
} from "@/features/discovery/local-discovery";

export function useDiscoveryPreferences() {
  const [followedAuthors, setFollowedAuthors] = useState<string[]>(() =>
    typeof window === "undefined" ? [] : readFollowedAuthors(),
  );
  const [joinedCircles, setJoinedCircles] = useState<string[]>(() =>
    typeof window === "undefined" ? [] : readJoinedCircles(),
  );
  const [trackedPlannedFeatures, setTrackedPlannedFeatures] = useState<string[]>(() =>
    typeof window === "undefined" ? [] : readTrackedPlannedFeatures(),
  );
  const [followedAuthorTimestamps, setFollowedAuthorTimestamps] = useState<
    Record<string, string>
  >(() => (typeof window === "undefined" ? {} : readFollowedAuthorTimestamps()));
  const [joinedCircleTimestamps, setJoinedCircleTimestamps] = useState<Record<string, string>>(
    () => (typeof window === "undefined" ? {} : readJoinedCircleTimestamps()),
  );
  const [trackedFeatureTimestamps, setTrackedFeatureTimestamps] = useState<
    Record<string, string>
  >(() => (typeof window === "undefined" ? {} : readTrackedFeatureTimestamps()));
  const [pinnedDiscoverySignal, setPinnedDiscoverySignal] = useState(() =>
    typeof window === "undefined" ? null : readPinnedDiscoverySignal(),
  );

  useEffect(() => {
    function refresh() {
      setFollowedAuthors(readFollowedAuthors());
      setJoinedCircles(readJoinedCircles());
      setTrackedPlannedFeatures(readTrackedPlannedFeatures());
      setFollowedAuthorTimestamps(readFollowedAuthorTimestamps());
      setJoinedCircleTimestamps(readJoinedCircleTimestamps());
      setTrackedFeatureTimestamps(readTrackedFeatureTimestamps());
      setPinnedDiscoverySignal(readPinnedDiscoverySignal());
    }

    refresh();
    window.addEventListener(discoveryChangedEvent, refresh);

    return () => {
      window.removeEventListener(discoveryChangedEvent, refresh);
    };
  }, []);

  return {
    followedAuthors,
    followedAuthorTimestamps,
    joinedCircles,
    joinedCircleTimestamps,
    pinnedDiscoverySignal,
    trackedPlannedFeatures,
    trackedFeatureTimestamps,
  };
}
