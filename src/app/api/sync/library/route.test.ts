import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { GET, POST } from "@/app/api/sync/library/route";
import {
  createAccountSession,
  getWorkspaceLibrarySnapshot,
  getWorkspaceSyncSummary,
  getWorkspaceUser,
  linkWorkspaceToUser,
  resetDatabaseForTests,
  syncWorkspaceLibrarySnapshot,
  upsertUserByEmail,
} from "@/lib/backend/sqlite";
import {
  createSignedAccountSession,
  createSignedWorkspaceCookieValue,
} from "@/lib/backend/workspace-session";
import type { LibrarySyncSnapshot } from "@/lib/backend/types";

const validSnapshot = {
  libraryBooks: [
    {
      bookId: "book-1",
      title: "Storm Harbor",
      chapterCount: 2,
      updatedAt: "2026-03-09T10:00:00.000Z",
    },
  ],
  draftTexts: [{ bookId: "book-1", text: "Chapter 1\nStorm Harbor" }],
  listeningProfiles: [
    {
      bookId: "book-1",
      narratorId: "sloane",
      narratorName: "Sloane",
      mode: "immersive",
    },
  ],
  defaultListeningProfile: null,
  sampleRequest: null,
  playbackStates: [
    {
      bookId: "book-1",
      state: {
        currentChapterIndex: 0,
        progressSeconds: 42,
        speed: 1.15,
        isBookmarked: false,
        sleepTimerMinutes: null,
        bookmarks: [],
        updatedAt: "2026-03-09T10:01:00.000Z",
      },
    },
  ],
  playbackDefaults: {
    speed: 1.15,
    sleepTimerMinutes: 15,
  },
  discoveryPreferences: {
    followedAuthors: ["Annie Hart"],
    joinedCircles: ["circle-storm-harbor"],
    trackedPlannedFeatures: ["private-audio-files"],
    followedAuthorTimestamps: {
      "Annie Hart": "2026-03-09T09:58:00.000Z",
    },
    joinedCircleTimestamps: {
      "circle-storm-harbor": "2026-03-09T09:59:00.000Z",
    },
    trackedFeatureTimestamps: {
      "private-audio-files": "2026-03-09T10:00:00.000Z",
    },
    pinnedDiscoverySignal: {
      kind: "author",
      id: "Annie Hart",
    },
    personalizationPaused: false,
  },
  syncedAt: "2026-03-09T10:02:00.000Z",
} satisfies LibrarySyncSnapshot;

describe("sync library route", () => {
  const createdDirs: string[] = [];

  afterEach(() => {
    resetDatabaseForTests();

    for (const dir of createdDirs.splice(0, createdDirs.length)) {
      rmSync(dir, { recursive: true, force: true });
    }

    delete process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH;
  });

  it("returns the active workspace snapshot", async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "adaptive-audio-player-"));
    createdDirs.push(tempDir);
    process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH = path.join(tempDir, "library.sqlite");

    syncWorkspaceLibrarySnapshot("workspace-sync", validSnapshot);

    const response = await GET(
      new Request("http://127.0.0.1:3100/api/sync/library", {
        headers: {
          cookie: `adaptive-audio-player.workspace=${createSignedWorkspaceCookieValue("workspace-sync")}`,
        },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      workspaceId: "workspace-sync",
      summary: expect.objectContaining({
        workspaceId: "workspace-sync",
        syncedBookCount: 1,
        syncedProfileCount: 1,
        syncedPlaybackCount: 1,
      }),
      snapshot: expect.objectContaining({
        libraryBooks: [
          expect.objectContaining({
            bookId: "book-1",
            title: "Storm Harbor",
          }),
        ],
        discoveryPreferences: expect.objectContaining({
          followedAuthors: ["Annie Hart"],
          pinnedDiscoverySignal: {
            kind: "author",
            id: "Annie Hart",
          },
        }),
      }),
    });
  });

  it("rejects GET when the signed-in account does not own the linked workspace", async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "adaptive-audio-player-"));
    createdDirs.push(tempDir);
    process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH = path.join(tempDir, "library.sqlite");

    syncWorkspaceLibrarySnapshot("workspace-sync", validSnapshot);

    const owner = upsertUserByEmail({
      email: "owner@example.com",
      displayName: "Owner",
    });
    const intruder = upsertUserByEmail({
      email: "intruder@example.com",
      displayName: "Intruder",
    });
    linkWorkspaceToUser("workspace-sync", owner.id);

    const intruderSession = createAccountSession(
      intruder.id,
      new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      "Test browser",
    );

    const response = await GET(
      new Request("http://127.0.0.1:3100/api/sync/library", {
        headers: {
          cookie: [
            `adaptive-audio-player.workspace=${createSignedWorkspaceCookieValue("workspace-sync")}`,
            `adaptive-audio-player.account=${createSignedAccountSession(
              intruder.id,
              intruderSession?.id ?? "",
            )}`,
          ].join("; "),
        },
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "This workspace belongs to another account.",
    });
  });

  it("syncs a snapshot and links the workspace for the signed-in owner", async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "adaptive-audio-player-"));
    createdDirs.push(tempDir);
    process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH = path.join(tempDir, "library.sqlite");

    const user = upsertUserByEmail({
      email: "gillian@example.com",
      displayName: "Gillian",
    });
    const session = createAccountSession(
      user.id,
      new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      "Test browser",
    );

    const response = await POST(
      new Request("http://127.0.0.1:3100/api/sync/library", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          host: "127.0.0.1:3100",
          origin: "http://127.0.0.1:3100",
          cookie: [
            `adaptive-audio-player.workspace=${createSignedWorkspaceCookieValue("workspace-sync")}`,
            `adaptive-audio-player.account=${createSignedAccountSession(
              user.id,
              session?.id ?? "",
            )}`,
          ].join("; "),
        },
        body: JSON.stringify(validSnapshot),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      workspaceId: "workspace-sync",
      summary: expect.objectContaining({
        workspaceId: "workspace-sync",
        syncedBookCount: 1,
      }),
    });

    expect(getWorkspaceUser("workspace-sync")?.email).toBe("gillian@example.com");
    expect(getWorkspaceSyncSummary("workspace-sync")?.syncedBookCount).toBe(1);
    expect(getWorkspaceLibrarySnapshot("workspace-sync")).toMatchObject({
      libraryBooks: validSnapshot.libraryBooks,
      discoveryPreferences: expect.objectContaining({
        joinedCircles: ["circle-storm-harbor"],
        trackedPlannedFeatures: ["private-audio-files"],
      }),
    });
  });

  it("rejects POST when the signed-in account does not own the linked workspace", async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "adaptive-audio-player-"));
    createdDirs.push(tempDir);
    process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH = path.join(tempDir, "library.sqlite");

    syncWorkspaceLibrarySnapshot("workspace-sync", validSnapshot);

    const owner = upsertUserByEmail({
      email: "owner@example.com",
      displayName: "Owner",
    });
    const intruder = upsertUserByEmail({
      email: "intruder@example.com",
      displayName: "Intruder",
    });
    linkWorkspaceToUser("workspace-sync", owner.id);

    const intruderSession = createAccountSession(
      intruder.id,
      new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      "Test browser",
    );

    const response = await POST(
      new Request("http://127.0.0.1:3100/api/sync/library", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          host: "127.0.0.1:3100",
          origin: "http://127.0.0.1:3100",
          cookie: [
            `adaptive-audio-player.workspace=${createSignedWorkspaceCookieValue("workspace-sync")}`,
            `adaptive-audio-player.account=${createSignedAccountSession(
              intruder.id,
              intruderSession?.id ?? "",
            )}`,
          ].join("; "),
        },
        body: JSON.stringify(validSnapshot),
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "This workspace belongs to another account.",
    });
  });
});
