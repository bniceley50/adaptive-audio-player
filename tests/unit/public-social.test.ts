import type { SocialCommunityPulseSummary } from "@/lib/backend/types";
import { describe, expect, it } from "vitest";
import {
  describeSocialCommunityEvent,
  getPublicCircleDetail,
  getPublicEditionDetail,
} from "@/features/social/public-social";

const pulse: SocialCommunityPulseSummary = {
  totalSocialWorkspaces: 2,
  totalSavedEditions: 4,
  totalJoinedCircles: 3,
  editionCounts: [{ editionId: "cinematic-harbor", saves: 3, reuses: 2 }],
  circleCounts: [
    { circleId: "storm-harbor-night-watch", joins: 2, reopens: 1, shares: 1 },
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
    workspaceId: "workspace-2",
    kind: "circle-joined" as const,
    subjectId: "storm-harbor-night-watch",
    quantity: 1,
    occurredAt: new Date().toISOString(),
  },
];

describe("public social helpers", () => {
  it("builds edition detail data", () => {
    expect(getPublicEditionDetail("cinematic-harbor", pulse, events)).toMatchObject({
      edition: { id: "cinematic-harbor" },
      summary: { saves: 3, reuses: 2 },
      relatedCircles: [{ id: "storm-harbor-night-watch" }],
    });
  });

  it("builds circle detail data", () => {
    expect(getPublicCircleDetail("storm-harbor-night-watch", pulse, events)).toMatchObject({
      circle: { id: "storm-harbor-night-watch" },
      edition: { id: "cinematic-harbor" },
      summary: { joins: 2, shares: 1 },
    });
  });

  it("describes community events with durable links", () => {
    expect(describeSocialCommunityEvent(events[0])).toMatchObject({
      title: "Cinematic Harbor Edition",
      href: "/social/editions/cinematic-harbor",
    });
  });
});
