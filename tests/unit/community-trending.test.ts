import { describe, expect, it } from "vitest";
import {
  getTrendingCircles,
  getTrendingEditions,
} from "@/features/discovery/community-trending";

describe("community trending helpers", () => {
  it("maps backend edition counts to featured editions", () => {
    expect(
      getTrendingEditions({
        totalSocialWorkspaces: 3,
        totalSavedEditions: 9,
        totalJoinedCircles: 4,
        totalPromotedMoments: 0,
        lastSyncedAt: "2026-03-15T10:00:00.000Z",
        editionCounts: [
          {
            editionId: "cinematic-harbor",
            saves: 5,
            reuses: 2,
          },
        ],
        circleCounts: [],
        momentCounts: [],
      }),
    ).toMatchObject([
      {
        edition: {
          id: "cinematic-harbor",
        },
        stats: {
          saves: 5,
          reuses: 2,
        },
      },
    ]);
  });

  it("maps backend circle counts to featured circles", () => {
    expect(
      getTrendingCircles({
        totalSocialWorkspaces: 3,
        totalSavedEditions: 9,
        totalJoinedCircles: 4,
        totalPromotedMoments: 0,
        lastSyncedAt: "2026-03-15T10:00:00.000Z",
        editionCounts: [],
        circleCounts: [
          {
            circleId: "observatory-late-shift",
            joins: 6,
            reopens: 3,
            shares: 1,
          },
        ],
        momentCounts: [],
      }),
    ).toMatchObject([
      {
        circle: {
          id: "observatory-late-shift",
        },
        stats: {
          joins: 6,
          shares: 1,
        },
      },
    ]);
  });
});
