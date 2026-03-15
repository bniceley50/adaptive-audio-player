import { describe, expect, it } from "vitest";
import {
  getCircleCommunityHeat,
  getCommunityHeatBadge,
  getEditionCommunityHeat,
  getMomentCommunityHeat,
} from "@/features/social/community-heat";

describe("community heat helpers", () => {
  it("scores recent edition activity", () => {
    const heat = getEditionCommunityHeat([
      {
        id: "1",
        workspaceId: "workspace-1",
        kind: "edition-saved",
        subjectId: "cinematic-harbor",
        quantity: 2,
        occurredAt: "2026-03-15T10:00:00.000Z",
        metadata: null,
      },
      {
        id: "2",
        workspaceId: "workspace-2",
        kind: "edition-reused",
        subjectId: "cinematic-harbor",
        quantity: 1,
        occurredAt: "2026-03-15T11:00:00.000Z",
        metadata: null,
      },
    ]);

    expect(heat.get("cinematic-harbor")).toMatchObject({
      score: 11,
      lastActivityAt: "2026-03-15T11:00:00.000Z",
    });
  });

  it("scores recent circle activity and returns a badge", () => {
    const heat = getCircleCommunityHeat([
      {
        id: "1",
        workspaceId: "workspace-1",
        kind: "circle-joined",
        subjectId: "storm-harbor-night-watch",
        quantity: 1,
        occurredAt: new Date().toISOString(),
        metadata: null,
      },
    ]);

    expect(getCommunityHeatBadge(heat.get("storm-harbor-night-watch"))).toBe("Heating up");
  });

  it("scores promoted moment activity", () => {
    const heat = getMomentCommunityHeat([
      {
        id: "1",
        workspaceId: "workspace-1",
        kind: "moment-promoted",
        subjectId: "promoted-storm-line",
        quantity: 2,
        occurredAt: "2026-03-15T12:00:00.000Z",
        metadata: {
          bookTitle: "Storm Harbor",
          chapterLabel: "Chapter 5",
          quoteText: "The tide kept its promises better than people did.",
        },
      },
    ]);

    expect(heat.get("promoted-storm-line")).toMatchObject({
      score: 8,
      lastActivityAt: "2026-03-15T12:00:00.000Z",
    });
  });
});
