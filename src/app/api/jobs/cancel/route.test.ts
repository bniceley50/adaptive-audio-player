import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { POST } from "@/app/api/jobs/cancel/route";
import {
  enqueueGenerationJob,
  getDatabase,
  resetDatabaseForTests,
} from "@/lib/backend/sqlite";
import { createSignedWorkspaceCookieValue } from "@/lib/backend/workspace-session";

function seedStoredBook(workspaceId: string) {
  const database = getDatabase();
  const timestamp = "2026-03-09T10:00:00.000Z";
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

describe("cancel generation job route", () => {
  const createdDirs: string[] = [];

  afterEach(() => {
    resetDatabaseForTests();

    for (const dir of createdDirs.splice(0, createdDirs.length)) {
      rmSync(dir, { recursive: true, force: true });
    }

    delete process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH;
  });

  it("cancels a queued generation job for the active workspace", async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "adaptive-audio-player-"));
    createdDirs.push(tempDir);
    process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH = path.join(tempDir, "library.sqlite");

    seedStoredBook("workspace-cancel");

    const queuedJob = enqueueGenerationJob({
      workspaceId: "workspace-cancel",
      kind: "sample-generation",
      bookId: "book-1",
      narratorId: "sloane",
      mode: "immersive",
    });

    const response = await POST(
      new Request("http://127.0.0.1:3100/api/jobs/cancel", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          host: "127.0.0.1:3100",
          origin: "http://127.0.0.1:3100",
          cookie: `adaptive-audio-player.workspace=${createSignedWorkspaceCookieValue("workspace-cancel")}`,
        },
        body: JSON.stringify({ jobId: queuedJob?.id }),
      }),
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      job: Record<string, unknown>;
    };
    expect(payload).toMatchObject({
      job: expect.objectContaining({
        kind: "sample-generation",
        status: "cancelled",
        bookId: "book-1",
      }),
    });
    expect(Object.keys(payload.job).sort()).toEqual(
      [
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
      ].sort(),
    );
    expect(payload.job).not.toHaveProperty("workspaceId");
    expect(payload.job).not.toHaveProperty("books");
    expect(payload.job).not.toHaveProperty("profiles");
    expect(payload.job).not.toHaveProperty("playbackStates");
  });

  it("returns 404 when cancelling a non-active job in the current workspace", async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "adaptive-audio-player-"));
    createdDirs.push(tempDir);
    process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH = path.join(tempDir, "library.sqlite");

    seedStoredBook("workspace-cancel");

    const completedJob = enqueueGenerationJob({
      workspaceId: "workspace-cancel",
      kind: "sample-generation",
      bookId: "book-1",
      narratorId: "sloane",
      mode: "immersive",
    });

    const firstResponse = await POST(
      new Request("http://127.0.0.1:3100/api/jobs/cancel", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          host: "127.0.0.1:3100",
          origin: "http://127.0.0.1:3100",
          cookie: `adaptive-audio-player.workspace=${createSignedWorkspaceCookieValue("workspace-cancel")}`,
        },
        body: JSON.stringify({ jobId: completedJob?.id }),
      }),
    );

    expect(firstResponse.status).toBe(200);

    const secondResponse = await POST(
      new Request("http://127.0.0.1:3100/api/jobs/cancel", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          host: "127.0.0.1:3100",
          origin: "http://127.0.0.1:3100",
          cookie: `adaptive-audio-player.workspace=${createSignedWorkspaceCookieValue("workspace-cancel")}`,
        },
        body: JSON.stringify({ jobId: completedJob?.id }),
      }),
    );

    expect(secondResponse.status).toBe(404);
    await expect(secondResponse.json()).resolves.toEqual({
      error: "Only queued or running jobs in the current workspace can be cancelled.",
    });
  });

  it("does not require a legacy account session for local cancellation", async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "adaptive-audio-player-"));
    createdDirs.push(tempDir);
    process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH = path.join(tempDir, "library.sqlite");

    seedStoredBook("workspace-cancel");

    const queuedJob = enqueueGenerationJob({
      workspaceId: "workspace-cancel",
      kind: "sample-generation",
      bookId: "book-1",
      narratorId: "sloane",
      mode: "immersive",
    });

    const response = await POST(
      new Request("http://127.0.0.1:3100/api/jobs/cancel", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          host: "127.0.0.1:3100",
          origin: "http://127.0.0.1:3100",
          cookie: [
            `adaptive-audio-player.workspace=${createSignedWorkspaceCookieValue("workspace-cancel")}`,
            "adaptive-audio-player.account=stale-legacy-session",
          ].join("; "),
        },
        body: JSON.stringify({ jobId: queuedJob?.id }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      job: expect.objectContaining({
        id: queuedJob?.id,
        status: "cancelled",
      }),
    });
  });
});
