import type { SocialCommunityPulseSummary } from "@/lib/backend/types";
import { describe, expect, it } from "vitest";
import {
  describeSocialCommunityEvent,
  describeSocialCommunityTimelineEvent,
  getPublicCircleDetail,
  getPublicEditionDetail,
} from "@/features/social/public-social";

const pulse: SocialCommunityPulseSummary = {
  totalSocialWorkspaces: 2,
  totalSavedEditions: 4,
  totalJoinedCircles: 3,
  totalPromotedMoments: 1,
  editionCounts: [{ editionId: "cinematic-harbor", saves: 3, reuses: 2 }],
  circleCounts: [
    { circleId: "storm-harbor-night-watch", joins: 2, reopens: 1, shares: 1 },
  ],
  momentCounts: [{ momentId: "promoted-storm-line", promotions: 1 }],
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
    metadata: null,
  },
  {
    id: "2",
    workspaceId: "workspace-2",
    kind: "circle-joined" as const,
    subjectId: "storm-harbor-night-watch",
    quantity: 1,
    occurredAt: new Date().toISOString(),
    metadata: null,
  },
  {
    id: "3",
    workspaceId: "workspace-3",
    kind: "circle-joined" as const,
    subjectId: "created-storm-line-circle",
    quantity: 1,
    occurredAt: new Date().toISOString(),
    metadata: {
      bookTitle: "Storm Harbor",
      editionId: "cinematic-harbor",
      circleId: "created-storm-line-circle",
      circleTitle: "Storm Line Circle",
      circleHost: "You",
      circleCheckpoint: "Chapter 3 and the harbor warning",
      circleVibe: "Moment-led close reading",
      circleSummary: "A listener-created circle seeded from one strong public line.",
      circleSourceMomentId: "storm-harbor-first-reveal",
    },
  },
];

describe("public social helpers", () => {
  it("builds edition detail data", () => {
    const detail = getPublicEditionDetail("cinematic-harbor", pulse, events);

    expect(detail).toMatchObject({
      edition: { id: "cinematic-harbor" },
      summary: { saves: 3, reuses: 2 },
      relatedCircleSummary: {
        totalJoins: 2,
        totalShares: 1,
        strongestCircle: {
          circle: { id: "storm-harbor-night-watch" },
          joins: 2,
          shares: 1,
        },
      },
    });
    expect(detail?.relatedCircles).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "storm-harbor-night-watch" })]),
    );
    expect(detail?.otherActiveEditions).toHaveLength(2);
  });

  it("builds circle detail data", () => {
    expect(getPublicCircleDetail("storm-harbor-night-watch", pulse, events)).toMatchObject({
      circle: { id: "storm-harbor-night-watch" },
      edition: { id: "cinematic-harbor" },
      editionSummary: { saves: 3, reuses: 2 },
      summary: { joins: 2, shares: 1 },
    });
    expect(getPublicCircleDetail("storm-harbor-night-watch", pulse, events)?.otherActiveCircles).toHaveLength(2);
  });

  it("describes community events with durable links", () => {
    expect(describeSocialCommunityEvent(events[0])).toMatchObject({
      title: "Cinematic Harbor Edition",
      href: "/social/editions/cinematic-harbor",
    });
    expect(describeSocialCommunityEvent(events[2])).toMatchObject({
      title: "Storm Line Circle",
      href: "/social/circles/created-storm-line-circle",
    });
  });

  it("builds narrative timeline copy for backend activity", () => {
    expect(describeSocialCommunityTimelineEvent(events[0])).toMatchObject({
      eyebrow: "Saved to shelf",
      title: "1 listener saved this edition",
    });
  });

  it("builds circle detail for backend-created public circles", () => {
    expect(
      getPublicCircleDetail("created-storm-line-circle", pulse, events),
    ).toMatchObject({
      circle: {
        id: "created-storm-line-circle",
        title: "Storm Line Circle",
        checkpoint: "Chapter 3 and the harbor warning",
      },
      edition: { id: "cinematic-harbor" },
      editionSummary: { saves: 3, reuses: 2 },
    });
  });
});
