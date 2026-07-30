import {
  existsSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { DELETE, GET } from "@/app/api/books/[bookId]/route";
import { writeGeneratedAudioAsset } from "@/lib/backend/audio-storage";
import {
  claimNextGenerationJob,
  completeGenerationJob,
  createWorkspaceBook,
  enqueueGenerationJob,
  getDatabase,
  resetDatabaseForTests,
} from "@/lib/backend/sqlite";
import { createSignedWorkspaceCookieValue } from "@/lib/backend/workspace-session";

const origin = "http://127.0.0.1:3100";

function workspaceCookie(workspaceId: string) {
  return `adaptive-audio-player.workspace=${createSignedWorkspaceCookieValue(workspaceId)}`;
}

function createBook(
  workspaceId: string,
  title: string,
  manuscript = "Chapter 1\nA private harbor manuscript.",
) {
  const result = createWorkspaceBook({
    workspaceId,
    idempotencyKey: `create-${title.toLowerCase().replaceAll(" ", "-")}`,
    requestFingerprint: `${title}:${manuscript}`,
    title,
    text: manuscript,
    chapters: [
      {
        id: "chapter-1",
        title: "Chapter 1",
        text: manuscript.split("\n").slice(1).join("\n"),
        order: 0,
      },
    ],
  });
  if (result.status !== "created") {
    throw new Error("Expected a new book fixture.");
  }

  return result.book;
}

function requestBook(
  method: "DELETE" | "GET",
  workspaceId: string,
  bookId: string,
  requestOrigin = origin,
) {
  const headers = new Headers({ cookie: workspaceCookie(workspaceId) });
  if (method === "DELETE") {
    headers.set("host", "127.0.0.1:3100");
    headers.set("origin", requestOrigin);
  }

  const request = new Request(`${origin}/api/books/${bookId}`, {
    method,
    headers,
  });
  const context = { params: Promise.resolve({ bookId }) };

  return method === "GET" ? GET(request, context) : DELETE(request, context);
}

function countRows(sql: string, ...values: Array<string | number>) {
  return (
    getDatabase().prepare(sql).get(...values) as { count: number }
  ).count;
}

describe("book detail route", () => {
  const createdDirs: string[] = [];

  function useTemporaryDatabase() {
    const tempDir = mkdtempSync(
      path.join(process.cwd(), ".adaptive-audio-player-book-detail-"),
    );
    createdDirs.push(tempDir);
    process.env.ADAPTIVE_AUDIO_PLAYER_DATA_ROOT = tempDir;
    process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH = path.join(
      tempDir,
      "library.sqlite",
    );
    return tempDir;
  }

  function recordOutput(workspaceId: string, bookId: string) {
    const artifact = writeGeneratedAudioAsset({
      workspaceId,
      bookId,
      kind: "sample-generation",
      extension: "wav",
      data: Buffer.from(`RIFF-${bookId}`),
    });
    const job = enqueueGenerationJob({
      workspaceId,
      bookId,
      kind: "sample-generation",
      narratorId: "marlowe",
      mode: "narration",
    });
    expect(claimNextGenerationJob()?.id).toBe(job?.id);
    expect(
      completeGenerationJob(job?.id ?? "", workspaceId, {
        assetPath: artifact.relativePath,
        mimeType: "audio/wav",
        provider: "mock",
      }),
    ).toMatchObject({ ok: true });
    return artifact;
  }

  afterEach(() => {
    resetDatabaseForTests();

    for (const dir of createdDirs.splice(0, createdDirs.length)) {
      rmSync(dir, { recursive: true, force: true });
    }

    delete process.env.ADAPTIVE_AUDIO_PLAYER_DATA_ROOT;
    delete process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH;
  });

  it("returns one same-workspace manuscript and chapters without asset paths", async () => {
    useTemporaryDatabase();
    const manuscript = "Chapter 1\nThe private lighthouse stayed dark.";
    const book = createBook("workspace-owner", "Private Lighthouse", manuscript);
    const artifact = recordOutput("workspace-owner", book.bookId);

    const response = await requestBook(
      "GET",
      "workspace-owner",
      book.bookId.toUpperCase(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      book: {
        ...book,
        manuscript,
        chapters: [
          {
            id: "chapter-1",
            title: "Chapter 1",
            text: "The private lighthouse stayed dark.",
            order: 0,
          },
        ],
      },
    });
    const serializedResponse = JSON.stringify(await requestBook(
      "GET",
      "workspace-owner",
      book.bookId,
    ).then((nextResponse) => nextResponse.json()));
    expect(serializedResponse).not.toContain("assetPath");
    expect(serializedResponse).not.toContain(artifact.relativePath);
    expect(serializedResponse).not.toContain(artifact.absolutePath);
  });

  it("does not require a legacy account session for local book access", async () => {
    useTemporaryDatabase();
    const book = createBook("workspace-local", "Local Book");
    const request = new Request(`${origin}/api/books/${book.bookId}`, {
      headers: {
        cookie: [
          workspaceCookie("workspace-local"),
          "adaptive-audio-player.account=stale-legacy-session",
        ].join("; "),
      },
    });

    const response = await GET(request, {
      params: Promise.resolve({ bookId: book.bookId }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      book: { bookId: book.bookId, title: "Local Book" },
    });
  });

  it("gives foreign and missing book IDs the same response without revealing metadata", async () => {
    useTemporaryDatabase();
    const foreignBook = createBook(
      "workspace-foreign",
      "Foreign Secret Title",
      "Chapter 1\nForeign secret manuscript.",
    );

    const foreignResponse = await requestBook(
      "GET",
      "workspace-owner",
      foreignBook.bookId,
    );
    const missingResponse = await requestBook(
      "GET",
      "workspace-owner",
      "book-missing",
    );

    expect(foreignResponse.status).toBe(404);
    expect(missingResponse.status).toBe(404);
    await expect(foreignResponse.json()).resolves.toEqual({
      error: "Book not found.",
    });
    await expect(missingResponse.json()).resolves.toEqual({
      error: "Book not found.",
    });

    const deleteResponse = await requestBook(
      "DELETE",
      "workspace-owner",
      foreignBook.bookId,
    );
    expect(deleteResponse.status).toBe(200);
    await expect(deleteResponse.json()).resolves.toEqual({
      ok: true,
      deleted: false,
    });
    expect(
      countRows(
        "select count(*) as count from synced_books where workspace_id = ? and book_id = ?",
        "workspace-foreign",
        foreignBook.bookId,
      ),
    ).toBe(1);
  });

  it("deletes one book's database rows and contained files idempotently", async () => {
    useTemporaryDatabase();
    const deletedBook = createBook("workspace-delete", "Delete Me");
    const preservedBook = createBook("workspace-delete", "Keep Me");
    const deletedArtifact = recordOutput("workspace-delete", deletedBook.bookId);
    const preservedArtifact = recordOutput(
      "workspace-delete",
      preservedBook.bookId,
    );

    const response = await requestBook(
      "DELETE",
      "workspace-delete",
      deletedBook.bookId,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, deleted: true });
    expect(existsSync(deletedArtifact.absolutePath)).toBe(false);
    expect(existsSync(preservedArtifact.absolutePath)).toBe(true);

    for (const table of [
      "synced_books",
      "book_chapters",
      "book_create_requests",
      "generated_outputs",
      "generated_output_history",
    ]) {
      expect(
        countRows(
          `select count(*) as count from ${table} where workspace_id = ? and book_id = ?`,
          "workspace-delete",
          deletedBook.bookId,
        ),
      ).toBe(0);
    }
    expect(
      countRows(
        `
          select count(*) as count
          from sync_jobs
          where workspace_id = ?
            and json_extract(stats_json, '$.bookId') = ?
        `,
        "workspace-delete",
        deletedBook.bookId,
      ),
    ).toBe(0);
    expect(
      countRows(
        "select count(*) as count from synced_books where workspace_id = ? and book_id = ?",
        "workspace-delete",
        preservedBook.bookId,
      ),
    ).toBe(1);

    const replayResponse = await requestBook(
      "DELETE",
      "workspace-delete",
      deletedBook.bookId,
    );
    expect(replayResponse.status).toBe(200);
    await expect(replayResponse.json()).resolves.toEqual({
      ok: true,
      deleted: false,
    });
  });

  it("keeps failed cleanup retryable without exposing the rejected path", async () => {
    const tempDir = useTemporaryDatabase();
    const book = createBook("workspace-retry", "Retry Cleanup");
    const outsidePath = path.join(tempDir, "outside.wav");
    writeFileSync(outsidePath, "outside audio");
    getDatabase()
      .prepare(
        `
          insert into generated_outputs (
            workspace_id, book_id, kind, output_json, updated_at
          ) values (?, ?, ?, ?, ?)
        `,
      )
      .run(
        "workspace-retry",
        book.bookId,
        "sample-generation",
        JSON.stringify({ assetPath: outsidePath }),
        new Date().toISOString(),
      );

    const response = await requestBook(
      "DELETE",
      "workspace-retry",
      book.bookId,
    );

    expect(response.status).toBe(409);
    const payload = await response.json();
    expect(payload).toEqual({
      error: "Book cleanup could not finish safely. Try again.",
    });
    expect(JSON.stringify(payload)).not.toContain(outsidePath);
    expect(JSON.stringify(payload)).not.toContain("assetPath");
    expect(existsSync(outsidePath)).toBe(true);
    expect(
      countRows(
        "select count(*) as count from synced_books where workspace_id = ? and book_id = ?",
        "workspace-retry",
        book.bookId,
      ),
    ).toBe(1);
  });

  it("rejects cross-origin deletion without changing the book", async () => {
    useTemporaryDatabase();
    const book = createBook("workspace-csrf", "Protected Book");

    const response = await requestBook(
      "DELETE",
      "workspace-csrf",
      book.bookId,
      "https://attacker.example",
    );

    expect(response.status).toBe(403);
    expect(
      countRows(
        "select count(*) as count from synced_books where workspace_id = ? and book_id = ?",
        "workspace-csrf",
        book.bookId,
      ),
    ).toBe(1);
  });
});
