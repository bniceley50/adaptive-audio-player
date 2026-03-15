"use client";

import { useEffect, useState } from "react";
import {
  readCircleMemberships,
  readSavedListeningEditions,
  socialStateChangedEvent,
} from "@/features/social/local-social";

export function useSocialState() {
  const [savedEditions, setSavedEditions] = useState(() =>
    typeof window === "undefined" ? [] : readSavedListeningEditions(),
  );
  const [circleMemberships, setCircleMemberships] = useState(() =>
    typeof window === "undefined" ? [] : readCircleMemberships(),
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
