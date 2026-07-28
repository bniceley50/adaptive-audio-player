import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { GET } from "@/app/api/jobs/book/[bookId]/route";
import {
  claimNextGenerationJob,
  completeGenerationJob,
  enqueueGenerationJob,
  getDatabase,
  resetDatabaseForTests,
} from "@/lib/backend/sqlite";
import { createSignedWorkspaceCookieValue } from "@/lib/backend/workspace-session";

function seedStoredBook(workspaceId: string) {
  const database = getDatabase();
  const timestamp = "2026-03-08T12:00:00.000Z";
  database
    .prepare(
      `
        insert into workspaces (id, created_at, updated_at, last_synced_at)
        values (?, ?, ?, null)
      `,
    )
    .run(workspaceId, timestamp, timestamp);
  database
    .prepare(
      `
        insert into synced_books (
          workspace_id, book_id, title, chapter_count, updated_at, draft_text
        ) values (?, 'book-1', 'Storm Harbor', 2, ?, 'Chapter 1\nStorm Harbor')
      `,
    )
    .run(workspaceId, timestamp);
}

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

    seedStoredBook("workspace-jobs");

    const sampleJob = enqueueGenerationJob({
      workspaceId: "workspace-jobs",
      kind: "sample-generation",
      bookId: "book-1",
      narratorId: "sloane",
      mode: "immersive",
    });

    expect(claimNextGenerationJob()?.id).toBe(sampleJob?.id);
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

    expect(claimNextGenerationJob()?.id).toBe(rerenderedSampleJob?.id);
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
    const publicJobKeys = [
      "bookId",
      "bookTitle",
      "chapterCount",
      "completedAt",
      "createdAt",
      "engineId",
      "errorMessage",
      "id",
      "kind",
      "mode",
      "narratorId",
      "playableArtifactKind",
      "renderProgress",
      "resumePath",
      "status",
    ].sort();
    for (const job of payload.jobs) {
      expect(Object.keys(job).sort()).toEqual(publicJobKeys);
      expect(job).not.toHaveProperty("workspaceId");
      expect(job).not.toHaveProperty("books");
      expect(job).not.toHaveProperty("profiles");
      expect(job).not.toHaveProperty("playbackStates");
    }
    expect(payload.outputs).toEqual([
      expect.objectContaining({
        artifactId: expect.any(String),
        artifactUrl: expect.stringMatching(
          /^\/api\/audio\/generated\/artifacts\//,
        ),
        kind: "sample-generation",
        bookId: "book-1",
        isCurrent: true,
        narratorId: "marlowe",
        mode: "classic",
      }),
    ]);
    expect(payload.artifacts).toEqual([
      expect.objectContaining({
        artifactId: expect.any(String),
        artifactUrl: expect.stringMatching(
          /^\/api\/audio\/generated\/artifacts\//,
        ),
        isCurrent: true,
        jobId: rerenderedSampleJob?.id,
        kind: "sample-generation",
      }),
    ]);

    const currentOutput = payload.outputs[0];
    const currentArtifact = payload.artifacts.find(
      (artifact) => artifact.jobId === rerenderedSampleJob?.id,
    );
    expect(currentOutput?.artifactId).toBe(currentArtifact?.artifactId);
    expect(currentOutput?.artifactUrl).toBe(currentArtifact?.artifactUrl);

    const serializedGenerationData = JSON.stringify({
      artifacts: payload.artifacts,
      outputs: payload.outputs,
    });
    expect(serializedGenerationData).not.toContain("assetPath");
    expect(serializedGenerationData).not.toContain("chapterAssetPaths");
    expect(serializedGenerationData).not.toContain("sample.wav");
    expect(serializedGenerationData).not.toContain("sample-v2.wav");
    for (const generationRecord of [...payload.outputs, ...payload.artifacts]) {
      expect(generationRecord).not.toHaveProperty("workspaceId");
      expect(generationRecord).not.toHaveProperty("id");
    }
  });

  it("does not require a legacy account session for local job access", async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "adaptive-audio-player-"));
    createdDirs.push(tempDir);
    process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH = path.join(tempDir, "library.sqlite");

    seedStoredBook("workspace-jobs");

    const response = await GET(
      new Request("http://localhost/api/jobs/book/book-1", {
        headers: {
          cookie: [
            `adaptive-audio-player.workspace=${createSignedWorkspaceCookieValue("workspace-jobs")}`,
            "adaptive-audio-player.account=stale-legacy-session",
          ].join("; "),
        },
      }),
      { params: Promise.resolve({ bookId: "book-1" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      jobs: [],
      outputs: [],
      artifacts: [],
    });
  });
});
