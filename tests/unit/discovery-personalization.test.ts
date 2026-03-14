import { describe, expect, it } from "vitest";
import {
  getCircleDiscoveryReason,
  getEditionDiscoveryReason,
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
});
