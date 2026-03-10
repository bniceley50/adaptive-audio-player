import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { GET } from "@/app/api/jobs/sample-generation/[jobId]/route";
import {
  createAccountSession,
  enqueueGenerationJob,
  linkWorkspaceToUser,
  resetDatabaseForTests,
  syncWorkspaceLibrarySnapshot,
  upsertUserByEmail,
} from "@/lib/backend/sqlite";
import {
  createSignedAccountSession,
  createSignedWorkspaceCookieValue,
} from "@/lib/backend/workspace-session";

describe("sample generation job route", () => {
  const createdDirs: string[] = [];

  afterEach(() => {
    resetDatabaseForTests();

    for (const dir of createdDirs.splice(0, createdDirs.length)) {
      rmSync(dir, { recursive: true, force: true });
    }

    delete process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH;
  });

  it("returns the sample generation job for the active workspace", async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "adaptive-audio-player-"));
    createdDirs.push(tempDir);
    process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH = path.join(tempDir, "library.sqlite");

    syncWorkspaceLibrarySnapshot("workspace-jobs", {
      libraryBooks: [
        {
          bookId: "book-1",
          title: "Storm Harbor",
          chapterCount: 2,
          updatedAt: "2026-03-08T12:00:00.000Z",
        },
      ],
      draftTexts: [{ bookId: "book-1", text: "Chapter 1\nStorm Harbor" }],
      listeningProfiles: [],
      defaultListeningProfile: null,
      sampleRequest: null,
      playbackStates: [],
      playbackDefaults: null,
      syncedAt: "2026-03-08T12:01:00.000Z",
    });

    const job = enqueueGenerationJob({
      workspaceId: "workspace-jobs",
      kind: "sample-generation",
      bookId: "book-1",
      narratorId: "sloane",
      mode: "immersive",
    });

    const response = await GET(
      new Request(`http://localhost/api/jobs/sample-generation/${job?.id}` as string, {
        headers: {
          cookie: `adaptive-audio-player.workspace=${createSignedWorkspaceCookieValue("workspace-jobs")}`,
        },
      }),
      { params: Promise.resolve({ jobId: job?.id ?? "" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      job: expect.objectContaining({
        id: job?.id,
        kind: "sample-generation",
        bookId: "book-1",
      }),
    });
  });

  it("rejects access when the signed-in account does not own the linked workspace", async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "adaptive-audio-player-"));
    createdDirs.push(tempDir);
    process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH = path.join(tempDir, "library.sqlite");

    syncWorkspaceLibrarySnapshot("workspace-jobs", {
      libraryBooks: [
        {
          bookId: "book-1",
          title: "Storm Harbor",
          chapterCount: 2,
          updatedAt: "2026-03-08T12:00:00.000Z",
        },
      ],
      draftTexts: [{ bookId: "book-1", text: "Chapter 1\nStorm Harbor" }],
      listeningProfiles: [],
      defaultListeningProfile: null,
      sampleRequest: null,
      playbackStates: [],
      playbackDefaults: null,
      syncedAt: "2026-03-08T12:01:00.000Z",
    });

    const job = enqueueGenerationJob({
      workspaceId: "workspace-jobs",
      kind: "sample-generation",
      bookId: "book-1",
      narratorId: "sloane",
      mode: "immersive",
    });

    const owner = upsertUserByEmail({
      email: "owner@example.com",
      displayName: "Owner",
    });
    const intruder = upsertUserByEmail({
      email: "intruder@example.com",
      displayName: "Intruder",
    });
    linkWorkspaceToUser("workspace-jobs", owner.id);

    const intruderSession = createAccountSession(
      intruder.id,
      new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      "Test browser",
    );

    const response = await GET(
      new Request(`http://localhost/api/jobs/sample-generation/${job?.id}` as string, {
        headers: {
          cookie: [
            `adaptive-audio-player.workspace=${createSignedWorkspaceCookieValue("workspace-jobs")}`,
            `adaptive-audio-player.account=${createSignedAccountSession(
              intruder.id,
              intruderSession?.id ?? "",
            )}`,
          ].join("; "),
        },
      }),
      { params: Promise.resolve({ jobId: job?.id ?? "" }) },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "This workspace belongs to another account.",
    });
  });
});
