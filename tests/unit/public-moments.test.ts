import { describe, expect, it } from "vitest";
import type { SocialCommunityPulseSummary } from "@/lib/backend/types";
import {
  getPublicMomentDetail,
  getPublicMomentsFeed,
} from "@/features/social/public-moments";

const pulse: SocialCommunityPulseSummary = {
  totalSocialWorkspaces: 3,
  totalSavedEditions: 8,
  totalJoinedCircles: 5,
  editionCounts: [
    { editionId: "cinematic-harbor", saves: 4, reuses: 2 },
    { editionId: "quiet-detective", saves: 2, reuses: 1 },
    { editionId: "night-window", saves: 1, reuses: 1 },
  ],
  circleCounts: [
    { circleId: "storm-harbor-night-watch", joins: 3, reopens: 1, shares: 1 },
    { circleId: "ashen-signals-close-read", joins: 2, reopens: 0, shares: 1 },
    { circleId: "observatory-late-shift", joins: 1, reopens: 1, shares: 0 },
  ],
  lastSyncedAt: "2026-03-15T12:00:00.000Z",
};

const events = [
  {
    id: "1",
    workspaceId: "workspace-1",
    kind: "edition-saved" as const,
    subjectId: "cinematic-harbor",
    quantity: 1,
    occurredAt: new Date().toISOString(),
  },
  {
    id: "2",
    workspaceId: "workspace-1",
    kind: "circle-joined" as const,
    subjectId: "storm-harbor-night-watch",
    quantity: 1,
    occurredAt: new Date().toISOString(),
  },
];

describe("public moments", () => {
  it("builds a durable moment detail", () => {
    expect(getPublicMomentDetail("storm-harbor-first-reveal", pulse, events)).toMatchObject({
      moment: { id: "storm-harbor-first-reveal" },
      edition: { id: "cinematic-harbor" },
      circle: { id: "storm-harbor-night-watch" },
      activity: {
        editionSummary: { saves: 4, reuses: 2 },
        circleSummary: { joins: 3, shares: 1 },
      },
    });
  });

  it("sorts the public moments feed by activity", () => {
    const feed = getPublicMomentsFeed(pulse, events);
    expect(feed[0]?.moment.id).toBe("storm-harbor-first-reveal");
    expect(feed).toHaveLength(3);
  });
});
