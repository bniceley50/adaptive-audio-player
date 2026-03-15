"use client";

import { useEffect, useState } from "react";
import {
  readCircleMemberships,
  readCreatedSocialCircles,
  readPromotedSocialMoments,
  readSavedListeningEditions,
  socialStateChangedEvent,
} from "@/features/social/local-social";
import type { SyncedSocialState } from "@/lib/types/social";

export function useSocialState(initialSocialState: SyncedSocialState | null = null) {
  const [savedEditions, setSavedEditions] = useState(() =>
    initialSocialState?.savedEditions ??
    (typeof window === "undefined" ? [] : readSavedListeningEditions()),
  );
  const [circleMemberships, setCircleMemberships] = useState(() =>
    initialSocialState?.circleMemberships ??
    (typeof window === "undefined" ? [] : readCircleMemberships()),
  );
  const [createdCircles, setCreatedCircles] = useState(() =>
    initialSocialState?.createdCircles ??
    (typeof window === "undefined" ? [] : readCreatedSocialCircles()),
  );
  const [promotedMoments, setPromotedMoments] = useState(() =>
    initialSocialState?.promotedMoments ??
    (typeof window === "undefined" ? [] : readPromotedSocialMoments()),
  );

  useEffect(() => {
    function refresh() {
      setSavedEditions(readSavedListeningEditions());
      setCircleMemberships(readCircleMemberships());
      setCreatedCircles(readCreatedSocialCircles());
      setPromotedMoments(readPromotedSocialMoments());
    }

    refresh();
    window.addEventListener(socialStateChangedEvent, refresh);

    return () => {
      window.removeEventListener(socialStateChangedEvent, refresh);
    };
  }, []);

  return {
    savedEditions,
    circleMemberships,
    createdCircles,
    promotedMoments,
  };
}
