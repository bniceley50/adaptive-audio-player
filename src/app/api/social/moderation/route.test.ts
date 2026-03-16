import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { POST } from "@/app/api/social/moderation/route";
import {
  createAccountSession,
  linkWorkspaceToUser,
  listPublicSocialCirclesWithOptions,
  listPublicSocialMomentsWithOptions,
  resetDatabaseForTests,
  syncWorkspaceLibrarySnapshot,
  upsertUserByEmail,
} from "@/lib/backend/sqlite";
import {
  createSignedAccountSession,
  createSignedWorkspaceCookieValue,
} from "@/lib/backend/workspace-session";

describe("social moderation route", () => {
  const createdDirs: string[] = [];

  afterEach(() => {
    resetDatabaseForTests();
    for (const dir of createdDirs.splice(0, createdDirs.length)) {
      rmSync(dir, { recursive: true, force: true });
    }
    delete process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH;
    delete process.env.ADAPTIVE_AUDIO_PLAYER_MODERATION_REVIEWERS;
  });

  function createWorkspaceCookie(workspaceId: string) {
    return `adaptive-audio-player.workspace=${createSignedWorkspaceCookieValue(workspaceId)}`;
  }

  function seedOwnerContent(workspaceId: string) {
    syncWorkspaceLibrarySnapshot(workspaceId, {
      libraryBooks: [],
      draftTexts: [],
      listeningProfiles: [],
      defaultListeningProfile: null,
      sampleRequest: null,
      playbackStates: [],
      playbackDefaults: null,
      discoveryPreferences: null,
      socialState: {
        savedEditions: [],
        circleMemberships: [],
        createdCircles: [
          {
            id: "owned-circle",
            title: "Owned Circle",
            editionId: "cinematic-harbor",
            host: "Owner",
            bookTitle: "Storm Harbor",
            memberCount: 1,
            checkpoint: "Chapter 1",
            vibe: "Owner-managed",
            summary: "A circle owned by the current workspace.",
            sourceMomentId: null,
            createdAt: "2026-03-15T13:02:00.000Z",
          },
        ],
        promotedMoments: [
          {
            id: "owned-moment",
            bookId: "book-1",
            bookTitle: "Storm Harbor",
            chapterIndex: 0,
            chapterLabel: "Chapter 1",
            progressSeconds: 42,
            quoteText: "Owned promoted quote.",
            promotedAt: "2026-03-15T13:03:00.000Z",
            editionId: "cinematic-harbor",
            circleId: "owned-circle",
          },
        ],
      },
      syncedAt: "2026-03-15T13:04:00.000Z",
    });
  }

  it("lets the owner hide a public circle", async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "adaptive-audio-player-"));
    createdDirs.push(tempDir);
    process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH = path.join(tempDir, "library.sqlite");

    seedOwnerContent("workspace-owner");
    const cookie = createWorkspaceCookie("workspace-owner");

    const response = await POST(
      new Request("http://127.0.0.1:3100/api/social/moderation", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          host: "127.0.0.1:3100",
          origin: "http://127.0.0.1:3100",
          cookie,
        },
        body: JSON.stringify({
          contentKind: "circle",
          contentId: "owned-circle",
          action: "hide",
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      contentKind: "circle",
      contentId: "owned-circle",
      moderationStatus: "hidden",
    });

    expect(
      listPublicSocialCirclesWithOptions({
        includeHiddenOwnedByWorkspaceId: "workspace-owner",
      }).find((circle) => circle.id === "owned-circle"),
    ).toMatchObject({
      moderationStatus: "hidden",
    });
  });

  it("lets the owner restore a hidden public moment", async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "adaptive-audio-player-"));
    createdDirs.push(tempDir);
    process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH = path.join(tempDir, "library.sqlite");

    seedOwnerContent("workspace-owner");
    await POST(
      new Request("http://127.0.0.1:3100/api/social/moderation", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          host: "127.0.0.1:3100",
          origin: "http://127.0.0.1:3100",
          cookie: createWorkspaceCookie("workspace-owner"),
        },
        body: JSON.stringify({
          contentKind: "moment",
          contentId: "owned-moment",
          action: "hide",
        }),
      }),
    );

    const response = await POST(
      new Request("http://127.0.0.1:3100/api/social/moderation", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          host: "127.0.0.1:3100",
          origin: "http://127.0.0.1:3100",
          cookie: createWorkspaceCookie("workspace-owner"),
        },
        body: JSON.stringify({
          contentKind: "moment",
          contentId: "owned-moment",
          action: "restore",
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      contentKind: "moment",
      contentId: "owned-moment",
      moderationStatus: "active",
    });

    expect(
      listPublicSocialMomentsWithOptions({
        includeHiddenOwnedByWorkspaceId: "workspace-owner",
      }).find((moment) => moment.id === "owned-moment"),
    ).toMatchObject({
      moderationStatus: "active",
    });
  });

  it("rejects moderation from a different workspace", async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "adaptive-audio-player-"));
    createdDirs.push(tempDir);
    process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH = path.join(tempDir, "library.sqlite");

    seedOwnerContent("workspace-owner");
    const cookie = createWorkspaceCookie("workspace-other");

    const response = await POST(
      new Request("http://127.0.0.1:3100/api/social/moderation", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          host: "127.0.0.1:3100",
          origin: "http://127.0.0.1:3100",
          cookie,
        },
        body: JSON.stringify({
          contentKind: "circle",
          contentId: "owned-circle",
          action: "hide",
        }),
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Only the owner or an allowlisted reviewer can manage this public content.",
    });
  });

  it("lets an allowlisted reviewer moderate another workspace's content", async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "adaptive-audio-player-"));
    createdDirs.push(tempDir);
    process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH = path.join(tempDir, "library.sqlite");
    process.env.ADAPTIVE_AUDIO_PLAYER_MODERATION_REVIEWERS = "reviewer@example.com";

    seedOwnerContent("workspace-owner");
    const reviewer = upsertUserByEmail({
      email: "reviewer@example.com",
      displayName: "Reviewer",
    });
    linkWorkspaceToUser("workspace-reviewer", reviewer.id);
    const session = createAccountSession(
      reviewer.id,
      new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      "Reviewer browser",
    );

    const response = await POST(
      new Request("http://127.0.0.1:3100/api/social/moderation", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          host: "127.0.0.1:3100",
          origin: "http://127.0.0.1:3100",
          cookie: [
            createWorkspaceCookie("workspace-reviewer"),
            `adaptive-audio-player.account=${createSignedAccountSession(
              reviewer.id,
              session?.id ?? "",
            )}`,
          ].join("; "),
        },
        body: JSON.stringify({
          contentKind: "circle",
          contentId: "owned-circle",
          action: "hide",
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      contentKind: "circle",
      contentId: "owned-circle",
      moderationStatus: "hidden",
    });
  });
});
