"use client";

import { useEffect, useState } from "react";
import {
  discoveryChangedEvent,
  readFollowedAuthors,
  readJoinedCircles,
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

  useEffect(() => {
    function refresh() {
      setFollowedAuthors(readFollowedAuthors());
      setJoinedCircles(readJoinedCircles());
      setTrackedPlannedFeatures(readTrackedPlannedFeatures());
    }

    refresh();
    window.addEventListener(discoveryChangedEvent, refresh);

    return () => {
      window.removeEventListener(discoveryChangedEvent, refresh);
    };
  }, []);

  return {
    followedAuthors,
    joinedCircles,
    trackedPlannedFeatures,
  };
}
