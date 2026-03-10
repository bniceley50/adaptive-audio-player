import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { GET } from "@/app/api/jobs/book/[bookId]/route";
import {
  completeGenerationJob,
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

describe("book jobs route", () => {
  const createdDirs: string[] = [];

  afterEach(() => {
    resetDatabaseForTests();

    for (const dir of createdDirs.splice(0, createdDirs.length)) {
      rmSync(dir, { recursive: true, force: true });
    }

    delete process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH;
  });

  it("returns recent jobs and outputs for the active workspace", async () => {
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

    const sampleJob = enqueueGenerationJob({
      workspaceId: "workspace-jobs",
      kind: "sample-generation",
      bookId: "book-1",
      narratorId: "sloane",
      mode: "immersive",
    });

    completeGenerationJob(sampleJob?.id ?? "", "workspace-jobs", {
      assetPath: "generated/workspace-jobs/book-1/sample.wav",
      mimeType: "audio/wav",
      provider: "mock",
    });

    const rerenderedSampleJob = enqueueGenerationJob({
      workspaceId: "workspace-jobs",
      kind: "sample-generation",
      bookId: "book-1",
      narratorId: "marlowe",
      mode: "classic",
    });

    completeGenerationJob(rerenderedSampleJob?.id ?? "", "workspace-jobs", {
      assetPath: "generated/workspace-jobs/book-1/sample-v2.wav",
      mimeType: "audio/wav",
      provider: "mock",
    });

    const response = await GET(
      new Request("http://localhost/api/jobs/book/book-1", {
        headers: {
          cookie: `adaptive-audio-player.workspace=${createSignedWorkspaceCookieValue("workspace-jobs")}`,
        },
      }),
      { params: Promise.resolve({ bookId: "book-1" }) },
    );

    expect(response.status).toBe(200);

    const payload = (await response.json()) as {
      jobs: Array<Record<string, unknown>>;
      outputs: Array<Record<string, unknown>>;
      artifacts: Array<Record<string, unknown>>;
    };

    expect(payload.jobs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: rerenderedSampleJob?.id,
          kind: "sample-generation",
          status: "completed",
          bookId: "book-1",
        }),
        expect.objectContaining({
          id: sampleJob?.id,
          kind: "sample-generation",
          status: "completed",
          bookId: "book-1",
        }),
      ]),
    );
    expect(payload.outputs).toEqual([
      expect.objectContaining({
        kind: "sample-generation",
        bookId: "book-1",
        narratorId: "marlowe",
        mode: "classic",
      }),
    ]);
    expect(payload.artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          jobId: rerenderedSampleJob?.id,
          kind: "sample-generation",
        }),
        expect.objectContaining({
          jobId: sampleJob?.id,
          kind: "sample-generation",
        }),
      ]),
    );
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
      new Request("http://localhost/api/jobs/book/book-1", {
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
      { params: Promise.resolve({ bookId: "book-1" }) },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "This workspace belongs to another account.",
    });
  });
});
