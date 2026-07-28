import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { GET, PUT } from "@/app/api/books/[bookId]/progress/route";
import { writeGeneratedAudioAsset } from "@/lib/backend/audio-storage";
import {
  claimNextGenerationJob,
  completeGenerationJob,
  createWorkspaceBook,
  deleteWorkspaceBook,
  enqueueGenerationJob,
  getDatabase,
  listGenerationOutputHistoryForBook,
  resetDatabaseForTests,
} from "@/lib/backend/sqlite";
import { createSignedWorkspaceCookieValue } from "@/lib/backend/workspace-session";

const origin = "http://127.0.0.1:3100";

function workspaceCookie(workspaceId: string) {
  return `adaptive-audio-player.workspace=${createSignedWorkspaceCookieValue(workspaceId)}`;
}

function createBook(workspaceId: string, title = "Progress Harbor") {
  const result = createWorkspaceBook({
    workspaceId,
    idempotencyKey: `create-${title.toLowerCase().replaceAll(" ", "-")}`,
    requestFingerprint: `${workspaceId}:${title}`,
    title,
    text: "Chapter 1\nThe tide turned.\nChapter 2\nThe harbor cleared.",
    chapters: [
      {
        id: "chapter-1",
        title: "Chapter 1",
        text: "The tide turned.",
        order: 0,
      },
      {
        id: "chapter-2",
        title: "Chapter 2",
        text: "The harbor cleared.",
        order: 1,
      },
    ],
  });
  if (result.status !== "created") {
    throw new Error("Expected a new book fixture.");
  }

  return result.book;
}

function recordCurrentArtifact(workspaceId: string, bookId: string, label: string) {
  const asset = writeGeneratedAudioAsset({
    workspaceId,
    bookId,
    kind: "sample-generation",
    extension: "wav",
    data: Buffer.from(`RIFF-${label}`),
  });
  const job = enqueueGenerationJob({
    workspaceId,
    bookId,
    kind: "sample-generation",
    narratorId: "sloane",
    mode: "narration",
  });
  if (!job || claimNextGenerationJob()?.id !== job.id) {
    throw new Error("Expected the artifact job to start.");
  }

  const completion = completeGenerationJob(job.id, workspaceId, {
    assetPath: asset.relativePath,
    mimeType: "audio/wav",
    provider: "mock",
  });
  if (!completion.ok) {
    throw new Error("Expected the artifact job to complete.");
  }

  const artifact = listGenerationOutputHistoryForBook(workspaceId, bookId, 10).find(
    (candidate) => candidate.jobId === job.id && !candidate.isChapterArtifact,
  );
  if (!artifact) {
    throw new Error("Expected a current artifact fixture.");
  }

  return artifact;
}

type ProgressBody = {
  artifactId: string;
  positionSeconds: number;
  durationSeconds: number;
  speed: number;
  chapterIndex: number | null;
  revision: number;
};

function validProgress(artifactId: string): ProgressBody {
  return {
    artifactId,
    positionSeconds: 12.5,
    durationSeconds: 120.25,
    speed: 1.25,
    chapterIndex: 0,
    revision: 0,
  };
}

function requestProgress(input: {
  method: "GET" | "PUT";
  workspaceId: string;
  bookId: string;
  body?: unknown;
  rawBody?: string;
  contentType?: string;
  requestOrigin?: string;
}) {
  const headers = new Headers({ cookie: workspaceCookie(input.workspaceId) });
  if (input.method === "PUT") {
    headers.set("host", "127.0.0.1:3100");
    headers.set("origin", input.requestOrigin ?? origin);
    headers.set("content-type", input.contentType ?? "application/json");
  }

  const request = new Request(
    `${origin}/api/books/${input.bookId}/progress`,
    {
      method: input.method,
      headers,
      body:
        input.method === "PUT"
          ? input.rawBody ?? JSON.stringify(input.body)
          : undefined,
    },
  );
  const context = { params: Promise.resolve({ bookId: input.bookId }) };

  return input.method === "GET" ? GET(request, context) : PUT(request, context);
}

function countRows(sql: string, ...values: Array<string | number>) {
  return Number(
    (getDatabase().prepare(sql).get(...values) as { count: number }).count,
  );
}

describe("book progress route", () => {
  const createdDirectories: string[] = [];

  function configureTestDatabase() {
    const directory = mkdtempSync(
      path.join(process.cwd(), ".adaptive-book-progress-route-"),
    );
    createdDirectories.push(directory);
    process.env.ADAPTIVE_AUDIO_PLAYER_DATA_ROOT = directory;
    process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH = path.join(
      directory,
      "library.sqlite",
    );
  }

  afterEach(() => {
    resetDatabaseForTests();
    for (const directory of createdDirectories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
    delete process.env.ADAPTIVE_AUDIO_PLAYER_DATA_ROOT;
    delete process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH;
  });

  it("stores and reads one small revisioned progress DTO without changing the book or jobs", async () => {
    configureTestDatabase();
    const workspaceId = "workspace-progress";
    const book = createBook(workspaceId);
    const artifact = recordCurrentArtifact(workspaceId, book.bookId, "current");
    const db = getDatabase();
    const bookBefore = db
      .prepare(
        `select title, chapter_count, updated_at, draft_text
         from synced_books where workspace_id = ? and book_id = ?`,
      )
      .get(workspaceId, book.bookId);
    const jobCountBefore = countRows(
      "select count(*) as count from sync_jobs where workspace_id = ?",
      workspaceId,
    );

    const putResponse = await requestProgress({
      method: "PUT",
      workspaceId,
      bookId: book.bookId.toUpperCase(),
      body: validProgress(artifact.id.toUpperCase()),
    });

    expect(putResponse.status).toBe(200);
    expect(putResponse.headers.get("cache-control")).toBe("no-store");
    const payload = (await putResponse.json()) as {
      progress: Record<string, unknown>;
    };
    expect(payload).toEqual({
      progress: {
        bookId: book.bookId,
        artifactId: artifact.id,
        positionSeconds: 12.5,
        durationSeconds: 120.25,
        speed: 1.25,
        chapterIndex: 0,
        revision: 1,
        updatedAt: expect.any(String),
      },
    });
    expect(Number.isNaN(Date.parse(String(payload.progress.updatedAt)))).toBe(false);

    const stored = db
      .prepare(
        `select workspace_id, book_id, artifact_id, position_seconds,
                duration_seconds, speed, chapter_index, revision, updated_at
         from book_progress where workspace_id = ? and book_id = ?`,
      )
      .get(workspaceId, book.bookId);
    expect(stored).toEqual({
      workspace_id: workspaceId,
      book_id: book.bookId,
      artifact_id: artifact.id,
      position_seconds: 12.5,
      duration_seconds: 120.25,
      speed: 1.25,
      chapter_index: 0,
      revision: 1,
      updated_at: payload.progress.updatedAt,
    });
    expect(
      (db.prepare("pragma table_info(book_progress)").all() as Array<{ name: string }>).map(
        (column) => column.name,
      ),
    ).toEqual([
      "workspace_id",
      "book_id",
      "artifact_id",
      "position_seconds",
      "duration_seconds",
      "speed",
      "chapter_index",
      "revision",
      "updated_at",
    ]);
    expect(
      db
        .prepare(
          `select title, chapter_count, updated_at, draft_text
           from synced_books where workspace_id = ? and book_id = ?`,
        )
        .get(workspaceId, book.bookId),
    ).toEqual(bookBefore);
    expect(
      countRows(
        "select count(*) as count from sync_jobs where workspace_id = ?",
        workspaceId,
      ),
    ).toBe(jobCountBefore);
    expect(
      db
        .prepare(
          "select count(*) as count from sqlite_schema where type = 'table' and name = ?",
        )
        .get("synced_playback_states"),
    ).toEqual({ count: 0 });

    const getResponse = await requestProgress({
      method: "GET",
      workspaceId,
      bookId: book.bookId,
    });
    expect(getResponse.status).toBe(200);
    expect(getResponse.headers.get("cache-control")).toBe("no-store");
    await expect(getResponse.json()).resolves.toEqual(payload);
  });

  it("returns null for an existing book that has no explicit progress", async () => {
    configureTestDatabase();
    const book = createBook("workspace-empty");

    const response = await requestProgress({
      method: "GET",
      workspaceId: "workspace-empty",
      bookId: book.bookId,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ progress: null });
  });

  it("does not require a legacy account session for local progress access", async () => {
    configureTestDatabase();
    const book = createBook("workspace-local-progress");
    const request = new Request(`${origin}/api/books/${book.bookId}/progress`, {
      headers: {
        cookie: [
          workspaceCookie("workspace-local-progress"),
          "adaptive-audio-player.account=stale-legacy-session",
        ].join("; "),
      },
    });

    const response = await GET(request, {
      params: Promise.resolve({ bookId: book.bookId }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ progress: null });
  });

  it("cascades progress with its book without deleting another book's row", async () => {
    configureTestDatabase();
    const workspaceId = "workspace-delete-progress";
    const deletedBook = createBook(workspaceId, "Deleted Progress Book");
    const keptBook = createBook(workspaceId, "Kept Progress Book");
    const deletedArtifact = recordCurrentArtifact(
      workspaceId,
      deletedBook.bookId,
      "deleted-progress",
    );
    const keptArtifact = recordCurrentArtifact(
      workspaceId,
      keptBook.bookId,
      "kept-progress",
    );

    for (const [bookId, artifactId] of [
      [deletedBook.bookId, deletedArtifact.id],
      [keptBook.bookId, keptArtifact.id],
    ]) {
      const response = await requestProgress({
        method: "PUT",
        workspaceId,
        bookId,
        body: validProgress(artifactId),
      });
      expect(response.status).toBe(200);
    }

    expect(deleteWorkspaceBook(workspaceId, deletedBook.bookId)).toMatchObject({
      ok: true,
    });
    expect(
      countRows(
        "select count(*) as count from book_progress where workspace_id = ? and book_id = ?",
        workspaceId,
        deletedBook.bookId,
      ),
    ).toBe(0);
    expect(
      countRows(
        "select count(*) as count from book_progress where workspace_id = ? and book_id = ?",
        workspaceId,
        keptBook.bookId,
      ),
    ).toBe(1);
  });

  it("advances revisions atomically and rejects a stale writer", async () => {
    configureTestDatabase();
    const workspaceId = "workspace-revision";
    const book = createBook(workspaceId);
    const artifact = recordCurrentArtifact(workspaceId, book.bookId, "revision");
    const firstBody = validProgress(artifact.id);

    const firstResponse = await requestProgress({
      method: "PUT",
      workspaceId,
      bookId: book.bookId,
      body: firstBody,
    });
    expect(firstResponse.status).toBe(200);

    const staleResponse = await requestProgress({
      method: "PUT",
      workspaceId,
      bookId: book.bookId,
      body: { ...firstBody, positionSeconds: 40 },
    });
    expect(staleResponse.status).toBe(409);
    await expect(staleResponse.json()).resolves.toEqual({
      error: "Progress changed. Reload it before saving again.",
      currentRevision: 1,
    });

    const secondResponse = await requestProgress({
      method: "PUT",
      workspaceId,
      bookId: book.bookId,
      body: { ...firstBody, positionSeconds: 40, revision: 1 },
    });
    expect(secondResponse.status).toBe(200);
    await expect(secondResponse.json()).resolves.toMatchObject({
      progress: { positionSeconds: 40, revision: 2 },
    });

    expect(
      getDatabase()
        .prepare(
          "select position_seconds, revision from book_progress where workspace_id = ? and book_id = ?",
        )
        .get(workspaceId, book.bookId),
    ).toEqual({ position_seconds: 40, revision: 2 });
  });

  it("makes missing and foreign books indistinguishable without writing progress", async () => {
    configureTestDatabase();
    createBook("workspace-owner", "Owner Book");
    const foreignBook = createBook("workspace-foreign", "Foreign Secret Book");
    const foreignArtifact = recordCurrentArtifact(
      "workspace-foreign",
      foreignBook.bookId,
      "foreign",
    );
    const expected = { error: "Book not found." };

    for (const bookId of [foreignBook.bookId, "book-missing"]) {
      const getResponse = await requestProgress({
        method: "GET",
        workspaceId: "workspace-owner",
        bookId,
      });
      expect(getResponse.status).toBe(404);
      await expect(getResponse.json()).resolves.toEqual(expected);

      const putResponse = await requestProgress({
        method: "PUT",
        workspaceId: "workspace-owner",
        bookId,
        body: validProgress(foreignArtifact.id),
      });
      expect(putResponse.status).toBe(404);
      await expect(putResponse.json()).resolves.toEqual(expected);
    }

    expect(countRows("select count(*) as count from book_progress")).toBe(0);
  });

  it("rejects stale, missing, cross-book, and cross-workspace artifacts identically", async () => {
    configureTestDatabase();
    const workspaceId = "workspace-artifact";
    const book = createBook(workspaceId, "Current Book");
    const oldArtifact = recordCurrentArtifact(workspaceId, book.bookId, "old");
    const currentArtifact = recordCurrentArtifact(workspaceId, book.bookId, "current");
    const otherBook = createBook(workspaceId, "Other Book");
    const otherArtifact = recordCurrentArtifact(workspaceId, otherBook.bookId, "other");
    const foreignBook = createBook("workspace-elsewhere", "Elsewhere Book");
    const foreignArtifact = recordCurrentArtifact(
      "workspace-elsewhere",
      foreignBook.bookId,
      "elsewhere",
    );
    const expected = {
      error: "This audio version is no longer current. Reopen the player.",
    };

    for (const artifactId of [
      oldArtifact.id,
      "artifact-00000000-0000-4000-8000-000000000000",
      otherArtifact.id,
      foreignArtifact.id,
    ]) {
      const response = await requestProgress({
        method: "PUT",
        workspaceId,
        bookId: book.bookId,
        body: validProgress(artifactId),
      });
      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toEqual(expected);
    }

    const currentResponse = await requestProgress({
      method: "PUT",
      workspaceId,
      bookId: book.bookId,
      body: validProgress(currentArtifact.id),
    });
    expect(currentResponse.status).toBe(200);
    expect(countRows("select count(*) as count from book_progress")).toBe(1);
  });

  it.each([
    ["negative position", { positionSeconds: -1 }],
    ["position beyond duration", { positionSeconds: 121 }],
    ["zero duration", { durationSeconds: 0 }],
    ["excessive duration", { durationSeconds: 604_801 }],
    ["speed below the media bound", { speed: 0.24 }],
    ["speed above the media bound", { speed: 4.01 }],
    ["negative chapter", { chapterIndex: -1 }],
    ["fractional chapter", { chapterIndex: 0.5 }],
    ["chapter outside this book", { chapterIndex: 2 }],
    ["negative revision", { revision: -1 }],
    ["fractional revision", { revision: 0.5 }],
  ])("rejects %s", async (_label, override) => {
    configureTestDatabase();
    const workspaceId = "workspace-bounds";
    const book = createBook(workspaceId);
    const artifact = recordCurrentArtifact(workspaceId, book.bookId, "bounds");

    const response = await requestProgress({
      method: "PUT",
      workspaceId,
      bookId: book.bookId,
      body: { ...validProgress(artifact.id), ...override },
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid progress payload.",
    });
    expect(countRows("select count(*) as count from book_progress")).toBe(0);
  });

  it("rejects malformed, oversized, non-JSON, and manuscript-bearing bodies", async () => {
    configureTestDatabase();
    const workspaceId = "workspace-payload";
    const book = createBook(workspaceId);
    const artifact = recordCurrentArtifact(workspaceId, book.bookId, "payload");

    const cases = [
      {
        rawBody: "{not-json",
        expectedStatus: 400,
        expectedError: "Invalid progress payload.",
      },
      {
        body: { ...validProgress(artifact.id), manuscript: "private text" },
        expectedStatus: 400,
        expectedError: "Invalid progress payload.",
      },
      {
        body: validProgress(artifact.id),
        contentType: "text/plain",
        expectedStatus: 415,
        expectedError: "Progress updates must use JSON.",
      },
      {
        rawBody: JSON.stringify({ padding: "x".repeat(4_200) }),
        expectedStatus: 413,
        expectedError: "Progress request is too large.",
      },
    ];

    for (const testCase of cases) {
      const response = await requestProgress({
        method: "PUT",
        workspaceId,
        bookId: book.bookId,
        body: testCase.body,
        rawBody: testCase.rawBody,
        contentType: testCase.contentType,
      });
      expect(response.status).toBe(testCase.expectedStatus);
      await expect(response.json()).resolves.toEqual({
        error: testCase.expectedError,
      });
    }

    expect(countRows("select count(*) as count from book_progress")).toBe(0);
  });

  it("rejects a cross-origin write before parsing or persistence", async () => {
    configureTestDatabase();
    const workspaceId = "workspace-csrf";
    const book = createBook(workspaceId);
    const artifact = recordCurrentArtifact(workspaceId, book.bookId, "csrf");

    const response = await requestProgress({
      method: "PUT",
      workspaceId,
      bookId: book.bookId,
      body: validProgress(artifact.id),
      requestOrigin: "https://attacker.example",
    });

    expect(response.status).toBe(403);
    expect(countRows("select count(*) as count from book_progress")).toBe(0);
  });
});
