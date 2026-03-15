import { describe, expect, it } from "vitest";
import {
  getTrendingCircles,
  getTrendingEditions,
  getTrendingMoments,
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

  it("maps backend moment counts to public moments", () => {
    expect(
      getTrendingMoments({
        totalSocialWorkspaces: 3,
        totalSavedEditions: 9,
        totalJoinedCircles: 4,
        totalPromotedMoments: 2,
        lastSyncedAt: "2026-03-15T10:00:00.000Z",
        editionCounts: [],
        circleCounts: [],
        momentCounts: [
          {
            momentId: "storm-harbor-first-reveal",
            promotions: 2,
          },
        ],
      }),
    ).toMatchObject([
      {
        moment: {
          id: "storm-harbor-first-reveal",
          bookTitle: "Storm Harbor",
        },
        stats: {
          promotions: 2,
        },
      },
    ]);
  });
});
