"use client";

import { useEffect, useState } from "react";
import {
  readCircleMemberships,
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

  useEffect(() => {
    function refresh() {
      setSavedEditions(readSavedListeningEditions());
      setCircleMemberships(readCircleMemberships());
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
  };
}
