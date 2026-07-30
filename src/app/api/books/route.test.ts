import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { GET, POST } from "@/app/api/books/route";
import {
  claimNextGenerationJob,
  completeGenerationJob,
  enqueueGenerationJob,
  getDatabase,
  listGenerationOutputHistoryForBook,
  resetDatabaseForTests,
  saveWorkspaceBookProgress,
} from "@/lib/backend/sqlite";
import { createSignedWorkspaceCookieValue } from "@/lib/backend/workspace-session";
import { MAX_EXTRACTED_TEXT_CHARACTERS } from "@/lib/validation/import-validation";

const origin = "http://127.0.0.1:3100";
const workspaceId = "workspace-books";

function workspaceCookie(id = workspaceId) {
  return `adaptive-audio-player.workspace=${createSignedWorkspaceCookieValue(id)}`;
}

function createPostRequest({
  body,
  cookie = workspaceCookie(),
  idempotencyKey = "import-request-1",
}: {
  body: string;
  cookie?: string;
  idempotencyKey?: string;
}) {
  return new Request(`${origin}/api/books`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      host: "127.0.0.1:3100",
      origin,
      cookie,
      "idempotency-key": idempotencyKey,
    },
    body,
  });
}

function countRows(table: "synced_books" | "book_chapters" | "book_create_requests") {
  return (
    getDatabase().prepare(`select count(*) as count from ${table}`).get() as {
      count: number;
    }
  ).count;
}

describe("books route", () => {
  const createdDirs: string[] = [];

  function useTemporaryDatabase() {
    const tempDir = mkdtempSync(path.join(tmpdir(), "adaptive-audio-player-books-"));
    createdDirs.push(tempDir);
    process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH = path.join(tempDir, "library.sqlite");
  }

  afterEach(() => {
    resetDatabaseForTests();

    for (const dir of createdDirs.splice(0, createdDirs.length)) {
      rmSync(dir, { recursive: true, force: true });
    }

    delete process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH;
  });

  it("creates one server-identified book and lists metadata without manuscript text", async () => {
    useTemporaryDatabase();
    const manuscript = [
      "Chapter 1",
      "A lighthouse flashed over the obsidian harbor.",
      "Chapter 2",
      "The last ferry answered from beyond the fog.",
    ].join("\n");

    const createResponse = await POST(
      createPostRequest({
        body: JSON.stringify({
          bookId: "client-controlled-id",
          title: "  Storm Harbor  ",
          text: manuscript,
        }),
      }),
    );

    expect(createResponse.status).toBe(201);
    const createPayload = await createResponse.json();
    expect(createPayload).toMatchObject({
      ok: true,
      replayed: false,
      book: {
        title: "Storm Harbor",
        chapterCount: 2,
        updatedAt: expect.any(String),
      },
    });
    expect(createPayload.book.bookId).toMatch(/^book-[0-9a-f-]{36}$/);
    expect(createPayload.book.bookId).not.toBe("client-controlled-id");

    const storedBook = getDatabase()
      .prepare(
        `
          select book_id, title, chapter_count, draft_text
          from synced_books
          where workspace_id = ?
        `,
      )
      .get(workspaceId) as {
      book_id: string;
      title: string;
      chapter_count: number;
      draft_text: string;
    };
    expect(storedBook).toEqual({
      book_id: createPayload.book.bookId,
      title: "Storm Harbor",
      chapter_count: 2,
      draft_text: manuscript,
    });
    expect(
      getDatabase()
        .prepare(
          `
            select chapter_index, chapter_id, title, text
            from book_chapters
            where workspace_id = ? and book_id = ?
            order by chapter_index
          `,
        )
        .all(workspaceId, createPayload.book.bookId),
    ).toEqual([
      {
        chapter_index: 0,
        chapter_id: "chapter-1",
        title: "Chapter 1",
        text: "A lighthouse flashed over the obsidian harbor.",
      },
      {
        chapter_index: 1,
        chapter_id: "chapter-2",
        title: "Chapter 2",
        text: "The last ferry answered from beyond the fog.",
      },
    ]);

    const sampleJob = enqueueGenerationJob({
      workspaceId,
      kind: "sample-generation",
      bookId: createPayload.book.bookId,
      narratorId: "sloane",
      mode: "classic",
    });
    expect(claimNextGenerationJob()?.id).toBe(sampleJob?.id);
    expect(
      completeGenerationJob(sampleJob?.id ?? "", workspaceId, {
        assetPath: `generated/${workspaceId}/${createPayload.book.bookId}/sample.wav`,
        mimeType: "audio/wav",
        provider: "mock",
      }),
    ).toMatchObject({ ok: true });
    const sampleArtifact = listGenerationOutputHistoryForBook(
      workspaceId,
      createPayload.book.bookId,
    ).find((artifact) => !artifact.isChapterArtifact);
    expect(sampleArtifact).toBeTruthy();
    expect(
      saveWorkspaceBookProgress({
        workspaceId,
        bookId: createPayload.book.bookId,
        artifactId: sampleArtifact?.id ?? "",
        positionSeconds: 18,
        durationSeconds: 60,
        speed: 1,
        chapterIndex: 0,
        expectedRevision: 0,
      }),
    ).toMatchObject({ status: "updated" });

    const listResponse = await GET(
      new Request(`${origin}/api/books`, {
        headers: { cookie: workspaceCookie() },
      }),
    );

    expect(listResponse.status).toBe(200);
    const listPayload = await listResponse.json();
    expect(listPayload).toMatchObject({
      books: [
        {
          ...createPayload.book,
          activity: {
            jobs: [
              {
                kind: "sample-generation",
                status: "completed",
              },
            ],
            outputs: [
              {
                artifactId: sampleArtifact?.id,
                artifactUrl: `/api/audio/generated/artifacts/${sampleArtifact?.id}`,
                isCurrent: true,
                jobId: sampleJob?.id,
                kind: "sample-generation",
              },
            ],
            progress: {
              artifactId: sampleArtifact?.id,
              chapterIndex: 0,
              durationSeconds: 60,
              positionSeconds: 18,
            },
          },
        },
      ],
    });
    const serializedList = JSON.stringify(listPayload);
    expect(serializedList).not.toContain("obsidian harbor");
    expect(serializedList).not.toContain("last ferry");
    expect(serializedList).not.toContain("draft_text");
    expect(serializedList).not.toContain("text");
    expect(serializedList).not.toContain("assetPath");
    expect(serializedList).not.toContain("provider");
    expect(serializedList).not.toContain("narratorId");
    expect(serializedList).not.toContain("mode");
    expect(serializedList).not.toContain("workspaceId");
  });

  it("replays the same normalized idempotency key without writing a duplicate", async () => {
    useTemporaryDatabase();
    const body = JSON.stringify({
      title: "Idempotent Harbor",
      text: "Chapter 1\nOne durable manuscript.",
    });

    const firstResponse = await POST(
      createPostRequest({ body, idempotencyKey: " Import-Request-7 " }),
    );
    const firstPayload = await firstResponse.json();
    const replayResponse = await POST(
      createPostRequest({ body, idempotencyKey: "import-request-7" }),
    );
    const replayPayload = await replayResponse.json();

    expect(firstResponse.status).toBe(201);
    expect(replayResponse.status).toBe(200);
    expect(replayPayload).toEqual({
      ok: true,
      replayed: true,
      book: firstPayload.book,
    });
    expect(countRows("synced_books")).toBe(1);
    expect(countRows("book_chapters")).toBe(1);
    expect(countRows("book_create_requests")).toBe(1);

    const conflictResponse = await POST(
      createPostRequest({
        body: JSON.stringify({
          title: "Different Harbor",
          text: "Chapter 1\nDifferent manuscript.",
        }),
        idempotencyKey: "import-request-7",
      }),
    );

    expect(conflictResponse.status).toBe(409);
    await expect(conflictResponse.json()).resolves.toEqual({
      error: "This idempotency key was already used for a different book.",
    });
    expect(countRows("synced_books")).toBe(1);
    expect(countRows("book_chapters")).toBe(1);
  });

  it.each([
    {
      name: "empty text",
      body: JSON.stringify({ title: "Empty Harbor", text: "  \n " }),
      error: "Add book text before continuing.",
    },
    {
      name: "oversized text",
      body: JSON.stringify({
        title: "Long Harbor",
        text: "x".repeat(MAX_EXTRACTED_TEXT_CHARACTERS + 1),
      }),
      error:
        "This book is longer than 1,000,000 characters. Shorten it before continuing.",
    },
    {
      name: "more than 300 chapters",
      body: JSON.stringify({
        title: "Many Harbors",
        text: Array.from(
          { length: 301 },
          (_, index) => `Chapter ${index + 1}\nChapter body ${index + 1}.`,
        ).join("\n"),
      }),
      error:
        "This book has more than 300 chapters. Split it into smaller books before continuing.",
    },
    {
      name: "malformed JSON",
      body: "{",
      error: "Invalid book payload.",
    },
  ])("rejects $name without partial data", async ({ body, error }) => {
    useTemporaryDatabase();

    const response = await POST(createPostRequest({ body }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error });
    expect(countRows("synced_books")).toBe(0);
    expect(countRows("book_chapters")).toBe(0);
    expect(countRows("book_create_requests")).toBe(0);
  });

  it("rejects an oversized JSON envelope before buffering or writing book data", async () => {
    useTemporaryDatabase();
    const response = await POST(
      createPostRequest({
        body: JSON.stringify({
          title: "Oversized envelope",
          text: "x".repeat(6_100_001),
        }),
      }),
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      error: "Book request is too large.",
    });
    expect(countRows("synced_books")).toBe(0);
    expect(countRows("book_chapters")).toBe(0);
    expect(countRows("book_create_requests")).toBe(0);
  });

  it("does not require a legacy account session for local book access", async () => {
    useTemporaryDatabase();
    const cookie = [
      workspaceCookie(),
      "adaptive-audio-player.account=stale-legacy-session",
    ].join("; ");

    const createResponse = await POST(
      createPostRequest({
        body: JSON.stringify({
          title: "Private Harbor",
          text: "Chapter 1\nOwner-only manuscript.",
        }),
        cookie,
      }),
    );
    const listResponse = await GET(
      new Request(`${origin}/api/books`, { headers: { cookie } }),
    );

    expect(createResponse.status).toBe(201);
    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toMatchObject({
      books: [{ title: "Private Harbor" }],
    });
    expect(countRows("synced_books")).toBe(1);
  });
});
