import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { POST } from "@/app/api/social/report/route";
import {
  resetDatabaseForTests,
  syncWorkspaceLibrarySnapshot,
} from "@/lib/backend/sqlite";
import { createSignedWorkspaceCookieValue } from "@/lib/backend/workspace-session";

describe("social report route", () => {
  const createdDirs: string[] = [];

  afterEach(() => {
    resetDatabaseForTests();
    for (const dir of createdDirs.splice(0, createdDirs.length)) {
      rmSync(dir, { recursive: true, force: true });
    }
    delete process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH;
  });

  function createWorkspaceCookie(workspaceId: string) {
    syncWorkspaceLibrarySnapshot(workspaceId, {
      libraryBooks: [],
      draftTexts: [],
      listeningProfiles: [],
      defaultListeningProfile: null,
      sampleRequest: null,
      playbackStates: [],
      playbackDefaults: null,
      discoveryPreferences: null,
      socialState: null,
      syncedAt: "2026-03-15T13:00:00.000Z",
    });

    return `adaptive-audio-player.workspace=${createSignedWorkspaceCookieValue(workspaceId)}`;
  }

  it("reports a public circle for review", async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "adaptive-audio-player-"));
    createdDirs.push(tempDir);
    process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH = path.join(tempDir, "library.sqlite");

    const cookie = createWorkspaceCookie("workspace-report");
    const request = new Request("http://127.0.0.1:3100/api/social/report", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        host: "127.0.0.1:3100",
        origin: "http://127.0.0.1:3100",
        cookie,
      },
      body: JSON.stringify({
        contentKind: "circle",
        contentId: "storm-harbor-night-watch",
        reason: "needs-review",
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      contentKind: "circle",
      contentId: "storm-harbor-night-watch",
      reportCount: 1,
    });
  });

  it("deduplicates repeat reports from the same workspace", async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "adaptive-audio-player-"));
    createdDirs.push(tempDir);
    process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH = path.join(tempDir, "library.sqlite");

    const cookie = createWorkspaceCookie("workspace-report");
    const request = new Request("http://127.0.0.1:3100/api/social/report", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        host: "127.0.0.1:3100",
        origin: "http://127.0.0.1:3100",
        cookie,
      },
      body: JSON.stringify({
        contentKind: "moment",
        contentId: "storm-harbor-first-reveal",
        reason: "spam",
      }),
    });

    const firstResponse = await POST(request.clone());
    const secondResponse = await POST(request);

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    await expect(secondResponse.json()).resolves.toEqual({
      ok: true,
      contentKind: "moment",
      contentId: "storm-harbor-first-reveal",
      reportCount: 1,
    });
  });

  it("rejects invalid report reasons", async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "adaptive-audio-player-"));
    createdDirs.push(tempDir);
    process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH = path.join(tempDir, "library.sqlite");

    const cookie = createWorkspaceCookie("workspace-report");
    const response = await POST(
      new Request("http://127.0.0.1:3100/api/social/report", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          host: "127.0.0.1:3100",
          origin: "http://127.0.0.1:3100",
          cookie,
        },
        body: JSON.stringify({
          contentKind: "circle",
          contentId: "storm-harbor-night-watch",
          reason: "unknown",
        }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Pick a valid report reason.",
    });
  });

  it("rejects unknown content ids", async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "adaptive-audio-player-"));
    createdDirs.push(tempDir);
    process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH = path.join(tempDir, "library.sqlite");

    const cookie = createWorkspaceCookie("workspace-report");
    const response = await POST(
      new Request("http://127.0.0.1:3100/api/social/report", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          host: "127.0.0.1:3100",
          origin: "http://127.0.0.1:3100",
          cookie,
        },
        body: JSON.stringify({
          contentKind: "moment",
          contentId: "missing-moment",
          reason: "needs-review",
        }),
      }),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "That public content is no longer available.",
    });
  });
});
