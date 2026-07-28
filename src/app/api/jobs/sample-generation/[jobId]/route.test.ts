import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { POST } from "@/app/api/jobs/sample-generation/route";
import { GET } from "@/app/api/jobs/sample-generation/[jobId]/route";
import {
  enqueueGenerationJob,
  getDatabase,
  getGenerationJob,
  listRecentGenerationJobsForBook,
  resetDatabaseForTests,
} from "@/lib/backend/sqlite";
import { createSignedWorkspaceCookieValue } from "@/lib/backend/workspace-session";

function seedStoredBook(
  workspaceId: string,
  input: {
    bookId?: string;
    chapterCount?: number;
    text?: string;
  } = {},
) {
  const database = getDatabase();
  const bookId = input.bookId ?? "book-1";
  const timestamp = "2026-07-18T12:00:00.000Z";
  database
    .prepare(
      `
        insert into workspaces (id, created_at, updated_at, last_synced_at)
        values (?, ?, ?, null)
        on conflict(id) do nothing
      `,
    )
    .run(workspaceId, timestamp, timestamp);
  database
    .prepare(
      `
        insert into synced_books (
          workspace_id, book_id, title, chapter_count, updated_at, draft_text
        ) values (?, ?, ?, ?, ?, ?)
      `,
    )
    .run(
      workspaceId,
      bookId,
      "Storm Harbor",
      input.chapterCount ?? 2,
      timestamp,
      input.text ?? "Chapter 1\nStorm Harbor\n\nChapter 2\nThe tide came in.",
    );
}

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

    seedStoredBook("workspace-jobs", { text: "Chapter 1\nStorm Harbor" });

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

  it("does not require a legacy account session for local job status", async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "adaptive-audio-player-"));
    createdDirs.push(tempDir);
    process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH = path.join(tempDir, "library.sqlite");

    seedStoredBook("workspace-jobs", { text: "Chapter 1\nStorm Harbor" });

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
          cookie: [
            `adaptive-audio-player.workspace=${createSignedWorkspaceCookieValue("workspace-jobs")}`,
            "adaptive-audio-player.account=stale-legacy-session",
          ].join("; "),
        },
      }),
      { params: Promise.resolve({ jobId: job?.id ?? "" }) },
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      job: Record<string, unknown>;
    };
    expect(payload).toMatchObject({
      job: expect.objectContaining({
        id: job?.id,
        kind: "sample-generation",
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
});

describe("sample generation enqueue route", () => {
  const createdDirs: string[] = [];

  afterEach(() => {
    resetDatabaseForTests();

    for (const dir of createdDirs.splice(0, createdDirs.length)) {
      rmSync(dir, { recursive: true, force: true });
    }

    delete process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH;
  });

  function useTemporaryDatabase() {
    const tempDir = mkdtempSync(path.join(tmpdir(), "adaptive-audio-player-"));
    createdDirs.push(tempDir);
    process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH = path.join(tempDir, "library.sqlite");
  }

  async function postSample(input: {
    workspaceId: string;
    body: Record<string, unknown>;
  }) {
    return POST(
      new Request("http://localhost/api/jobs/sample-generation", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: [
            `adaptive-audio-player.workspace=${createSignedWorkspaceCookieValue(input.workspaceId)}`,
            "adaptive-audio-player.account=stale-legacy-session",
          ].join("; "),
          host: "localhost",
          origin: "http://localhost",
        },
        body: JSON.stringify(input.body),
      }),
    );
  }

  it("enqueues server-resolved input without a legacy account session", async () => {
    useTemporaryDatabase();
    seedStoredBook("workspace-jobs");

    const response = await postSample({
      workspaceId: "workspace-jobs",
      body: {
        bookId: " BOOK-1 ",
        narratorId: " SLOANE ",
        mode: "immersive",
      },
    });
    const payload = (await response.json()) as {
      job?: { id?: string };
      [key: string]: unknown;
    };

    expect(response.status).toBe(201);
    expect(payload).toMatchObject({
      ok: true,
      job: {
        bookId: "book-1",
        chapterCount: 2,
        kind: "sample-generation",
        mode: "classic",
        narratorId: "sloane",
        status: "queued",
      },
    });
    expect(payload).not.toHaveProperty("workspaceId");
    expect(payload.job).not.toHaveProperty("workspaceId");
    expect(JSON.stringify(payload)).not.toMatch(/assetPath|chapterAssetPaths|private manuscript/i);

    const storedJob = getGenerationJob(payload.job?.id ?? "", "workspace-jobs");
    expect(storedJob).toMatchObject({
      workspaceId: "workspace-jobs",
      bookId: "book-1",
      narratorId: "sloane",
      mode: "classic",
      chapterCount: 2,
    });
  });

  it("rejects an unknown book without creating a job", async () => {
    useTemporaryDatabase();
    seedStoredBook("workspace-jobs");

    const response = await postSample({
      workspaceId: "workspace-jobs",
      body: { bookId: "book-missing", narratorId: "marlowe" },
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "This book is not available for generation.",
    });
    expect(
      listRecentGenerationJobsForBook("workspace-jobs", "book-missing"),
    ).toEqual([]);
  });

  it("rejects a book from another workspace without leaking or creating data", async () => {
    useTemporaryDatabase();
    seedStoredBook("workspace-owner");

    const response = await postSample({
      workspaceId: "workspace-other",
      body: { bookId: "book-1", narratorId: "marlowe" },
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "This book is not available for generation.",
    });
    expect(listRecentGenerationJobsForBook("workspace-owner", "book-1")).toEqual(
      [],
    );
    expect(listRecentGenerationJobsForBook("workspace-other", "book-1")).toEqual(
      [],
    );
  });

  it("rejects a voice outside the server-owned catalog without creating a job", async () => {
    useTemporaryDatabase();
    seedStoredBook("workspace-jobs");

    const response = await postSample({
      workspaceId: "workspace-jobs",
      body: { bookId: "book-1", narratorId: "uploaded-clone" },
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Choose an available narrator before generating audio.",
    });
    expect(listRecentGenerationJobsForBook("workspace-jobs", "book-1")).toEqual(
      [],
    );
  });

  it.each([
    {
      label: "oversized manuscript",
      chapterCount: 2,
      text: "a".repeat(1_000_001),
      error: "This book is too long to generate. Shorten it before continuing.",
    },
    {
      label: "excessive chapter count",
      chapterCount: 301,
      text: "Chapter 1\nStored text",
      error: "This book's chapters could not be prepared for generation.",
    },
  ])("rejects a stored $label without creating a job", async (input) => {
    useTemporaryDatabase();
    seedStoredBook("workspace-jobs", input);

    const response = await postSample({
      workspaceId: "workspace-jobs",
      body: { bookId: "book-1", narratorId: "marlowe" },
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: input.error });
    expect(listRecentGenerationJobsForBook("workspace-jobs", "book-1")).toEqual(
      [],
    );
  });

  it("rejects a duplicate active sample without creating another job", async () => {
    useTemporaryDatabase();
    seedStoredBook("workspace-jobs");
    const existingJob = enqueueGenerationJob({
      workspaceId: "workspace-jobs",
      kind: "sample-generation",
      bookId: "book-1",
      narratorId: "marlowe",
      mode: "classic",
      chapterCount: 2,
    });

    const response = await postSample({
      workspaceId: "workspace-jobs",
      body: { bookId: "book-1", narratorId: "marlowe" },
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Audio generation is already in progress for this book.",
    });
    expect(listRecentGenerationJobsForBook("workspace-jobs", "book-1")).toEqual([
      expect.objectContaining({ id: existingJob?.id }),
    ]);
  });
});
