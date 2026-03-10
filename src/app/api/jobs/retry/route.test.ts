import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { POST } from "@/app/api/jobs/retry/route";
import {
  createAccountSession,
  enqueueGenerationJob,
  failGenerationJob,
  linkWorkspaceToUser,
  resetDatabaseForTests,
  syncWorkspaceLibrarySnapshot,
  upsertUserByEmail,
} from "@/lib/backend/sqlite";
import {
  createSignedAccountSession,
  createSignedWorkspaceCookieValue,
} from "@/lib/backend/workspace-session";

describe("retry generation job route", () => {
  const createdDirs: string[] = [];

  afterEach(() => {
    resetDatabaseForTests();

    for (const dir of createdDirs.splice(0, createdDirs.length)) {
      rmSync(dir, { recursive: true, force: true });
    }

    delete process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH;
  });

  it("requeues a failed generation job for the active workspace", async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "adaptive-audio-player-"));
    createdDirs.push(tempDir);
    process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH = path.join(tempDir, "library.sqlite");

    syncWorkspaceLibrarySnapshot("workspace-retry", {
      libraryBooks: [
        {
          bookId: "book-1",
          title: "Storm Harbor",
          chapterCount: 2,
          updatedAt: "2026-03-09T10:00:00.000Z",
        },
      ],
      draftTexts: [{ bookId: "book-1", text: "Chapter 1\nStorm Harbor" }],
      listeningProfiles: [],
      defaultListeningProfile: null,
      sampleRequest: null,
      playbackStates: [],
      playbackDefaults: null,
      syncedAt: "2026-03-09T10:01:00.000Z",
    });

    const failedJob = enqueueGenerationJob({
      workspaceId: "workspace-retry",
      kind: "sample-generation",
      bookId: "book-1",
      narratorId: "sloane",
      mode: "immersive",
    });
    failGenerationJob(failedJob?.id ?? "", "workspace-retry", "Mock failure");

    const response = await POST(
      new Request("http://127.0.0.1:3100/api/jobs/retry", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          host: "127.0.0.1:3100",
          origin: "http://127.0.0.1:3100",
          cookie: `adaptive-audio-player.workspace=${createSignedWorkspaceCookieValue("workspace-retry")}`,
        },
        body: JSON.stringify({ jobId: failedJob?.id }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      job: expect.objectContaining({
        kind: "sample-generation",
        status: "queued",
        bookId: "book-1",
      }),
    });
  });

  it("returns 404 when retrying a non-failed job in the current workspace", async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "adaptive-audio-player-"));
    createdDirs.push(tempDir);
    process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH = path.join(tempDir, "library.sqlite");

    syncWorkspaceLibrarySnapshot("workspace-retry", {
      libraryBooks: [
        {
          bookId: "book-1",
          title: "Storm Harbor",
          chapterCount: 2,
          updatedAt: "2026-03-09T10:00:00.000Z",
        },
      ],
      draftTexts: [{ bookId: "book-1", text: "Chapter 1\nStorm Harbor" }],
      listeningProfiles: [],
      defaultListeningProfile: null,
      sampleRequest: null,
      playbackStates: [],
      playbackDefaults: null,
      syncedAt: "2026-03-09T10:01:00.000Z",
    });

    const queuedJob = enqueueGenerationJob({
      workspaceId: "workspace-retry",
      kind: "sample-generation",
      bookId: "book-1",
      narratorId: "sloane",
      mode: "immersive",
    });

    const response = await POST(
      new Request("http://127.0.0.1:3100/api/jobs/retry", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          host: "127.0.0.1:3100",
          origin: "http://127.0.0.1:3100",
          cookie: `adaptive-audio-player.workspace=${createSignedWorkspaceCookieValue("workspace-retry")}`,
        },
        body: JSON.stringify({ jobId: queuedJob?.id }),
      }),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Only failed jobs in the current workspace can be retried.",
    });
  });

  it("rejects retry when the signed-in account does not own the linked workspace", async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "adaptive-audio-player-"));
    createdDirs.push(tempDir);
    process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH = path.join(tempDir, "library.sqlite");

    syncWorkspaceLibrarySnapshot("workspace-retry", {
      libraryBooks: [
        {
          bookId: "book-1",
          title: "Storm Harbor",
          chapterCount: 2,
          updatedAt: "2026-03-09T10:00:00.000Z",
        },
      ],
      draftTexts: [{ bookId: "book-1", text: "Chapter 1\nStorm Harbor" }],
      listeningProfiles: [],
      defaultListeningProfile: null,
      sampleRequest: null,
      playbackStates: [],
      playbackDefaults: null,
      syncedAt: "2026-03-09T10:01:00.000Z",
    });

    const failedJob = enqueueGenerationJob({
      workspaceId: "workspace-retry",
      kind: "sample-generation",
      bookId: "book-1",
      narratorId: "sloane",
      mode: "immersive",
    });
    failGenerationJob(failedJob?.id ?? "", "workspace-retry", "Mock failure");

    const owner = upsertUserByEmail({
      email: "owner@example.com",
      displayName: "Owner",
    });
    const intruder = upsertUserByEmail({
      email: "intruder@example.com",
      displayName: "Intruder",
    });
    linkWorkspaceToUser("workspace-retry", owner.id);

    const intruderSession = createAccountSession(
      intruder.id,
      new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      "Test browser",
    );

    const response = await POST(
      new Request("http://127.0.0.1:3100/api/jobs/retry", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          host: "127.0.0.1:3100",
          origin: "http://127.0.0.1:3100",
          cookie: [
            `adaptive-audio-player.workspace=${createSignedWorkspaceCookieValue("workspace-retry")}`,
            `adaptive-audio-player.account=${createSignedAccountSession(
              intruder.id,
              intruderSession?.id ?? "",
            )}`,
          ].join("; "),
        },
        body: JSON.stringify({ jobId: failedJob?.id }),
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "This workspace belongs to another account.",
    });
  });
});
