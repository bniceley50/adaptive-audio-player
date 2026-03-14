import { describe, expect, it } from "vitest";
import {
  getCircleDiscoveryReason,
  getEditionDiscoveryReason,
  getHomeDiscoveryReason,
  getPinnedDiscoveryReason,
} from "@/features/discovery/personalization";

describe("discovery personalization helpers", () => {
  it("explains when an edition is surfaced because of a joined circle", () => {
    expect(
      getEditionDiscoveryReason("cinematic-harbor", {
        followedAuthors: [],
        joinedCircles: ["storm-harbor-night-watch"],
        trackedPlannedFeatures: [],
      }),
    ).toMatchObject({
      label: expect.stringContaining("Night Watch Circle"),
    });
  });

  it("explains when an edition is surfaced because of a followed author", () => {
    expect(
      getEditionDiscoveryReason("night-window", {
        followedAuthors: ["Ari Kessler"],
        joinedCircles: [],
        trackedPlannedFeatures: [],
      }),
    ).toMatchObject({
      label: "Because you follow Ari Kessler",
    });
  });

  it("explains when a circle is surfaced because it was joined", () => {
    expect(
      getCircleDiscoveryReason("storm-harbor-night-watch", {
        followedAuthors: [],
        joinedCircles: ["storm-harbor-night-watch"],
        trackedPlannedFeatures: [],
      }),
    ).toMatchObject({
      label: "Because you already joined this circle",
    });
  });

  it("explains when home prefers a joined circle", () => {
    expect(
      getHomeDiscoveryReason(
        {
          hasSyncedBook: false,
          latestBookTitle: null,
          spotlightName: null,
        },
        {
          followedAuthors: [],
          joinedCircles: ["storm-harbor-night-watch"],
          trackedPlannedFeatures: [],
        },
      ),
    ).toMatchObject({
      label: expect.stringContaining("Night Watch Circle"),
    });
  });

  it("explains when home prefers resume", () => {
    expect(
      getHomeDiscoveryReason(
        {
          hasSyncedBook: true,
          latestBookTitle: "Storm Harbor",
          spotlightName: null,
        },
        {
          followedAuthors: [],
          joinedCircles: [],
          trackedPlannedFeatures: [],
        },
      ),
    ).toMatchObject({
      label: "Because you already have a live listening path",
    });
  });

  it("explains a pinned circle signal", () => {
    expect(
      getPinnedDiscoveryReason({
        kind: "circle",
        id: "storm-harbor-night-watch",
      }),
    ).toMatchObject({
      label: expect.stringContaining("Night Watch Circle"),
    });
  });
});
