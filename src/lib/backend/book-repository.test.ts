import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import * as bookRepository from "@/lib/backend/book-repository";
import {
  getDatabase,
  resetDatabaseForTests,
} from "@/lib/backend/database";
import * as generationRepository from "@/lib/backend/generation-repository";
import * as sqliteCompatibility from "@/lib/backend/sqlite";

describe("book repository boundary", () => {
  const createdDirs: string[] = [];

  afterEach(() => {
    resetDatabaseForTests();

    for (const dir of createdDirs.splice(0, createdDirs.length)) {
      rmSync(dir, { recursive: true, force: true });
    }

    delete process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH;
  });

  function useTemporaryDatabase() {
    const tempDir = mkdtempSync(path.join(tmpdir(), "adaptive-book-repo-"));
    createdDirs.push(tempDir);
    process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH = path.join(
      tempDir,
      "library.sqlite",
    );
  }

  function seedBook(input: {
    workspaceId: string;
    bookId: string;
    title: string;
    manuscript: string;
    chapterTitle: string;
    chapterText: string;
  }) {
    const database = getDatabase();
    const timestamp = "2026-07-19T12:00:00.000Z";
    database
      .prepare(
        `
          insert into workspaces (
            id, created_at, updated_at, last_synced_at
          ) values (?, ?, ?, null)
          on conflict(id) do nothing
        `,
      )
      .run(input.workspaceId, timestamp, timestamp);
    database
      .prepare(
        `
          insert into synced_books (
            workspace_id,
            book_id,
            title,
            chapter_count,
            updated_at,
            draft_text
          ) values (?, ?, ?, 1, ?, ?)
        `,
      )
      .run(
        input.workspaceId,
        input.bookId,
        input.title,
        timestamp,
        input.manuscript,
      );
    database
      .prepare(
        `
          insert into book_chapters (
            workspace_id,
            book_id,
            chapter_index,
            chapter_id,
            title,
            text
          ) values (?, ?, 0, ?, ?, ?)
        `,
      )
      .run(
        input.workspaceId,
        input.bookId,
        `${input.bookId}-chapter-1`,
        input.chapterTitle,
        input.chapterText,
      );
  }

  it("preserves the established sqlite.ts book export surface", () => {
    const compatibilityExports = [
      "createWorkspaceBook",
      "deleteWorkspaceBook",
      "getSyncedBookDisplayMeta",
      "getSyncedBookDraftText",
      "getSyncedBookTitle",
      "getWorkspaceBook",
      "getWorkspaceBookProgress",
      "listWorkspaceBooks",
      "saveWorkspaceBookProgress",
    ] as const;

    for (const exportName of compatibilityExports) {
      expect(sqliteCompatibility[exportName]).toBe(bookRepository[exportName]);
    }
  });

  it("creates, replays, and maps a manuscript with ordered chapters", () => {
    useTemporaryDatabase();
    const input = {
      workspaceId: "workspace-create",
      idempotencyKey: "create-request-1",
      requestFingerprint: "request-fingerprint-1",
      title: "Repository Manuscript",
      text: "Chapter One\nFirst text\n\nChapter Two\nSecond text",
      chapters: [
        { id: "chapter-1", title: "Chapter One", text: "First text", order: 0 },
        { id: "chapter-2", title: "Chapter Two", text: "Second text", order: 1 },
      ],
    };

    const created = bookRepository.createWorkspaceBook(input);
    expect(created.status).toBe("created");
    expect(bookRepository.createWorkspaceBook(input)).toEqual({
      status: "replayed",
      book: created.book,
    });
    expect(bookRepository.listWorkspaceBooks(input.workspaceId)).toEqual([
      created.book,
    ]);
    expect(
      bookRepository.getWorkspaceBook(
        input.workspaceId,
        created.book?.bookId ?? "",
      ),
    ).toEqual({
      ...created.book,
      manuscript: input.text,
      chapters: input.chapters,
    });
  });

  it("keeps same-ID books, manuscripts, chapters, and deletion workspace-scoped", () => {
    useTemporaryDatabase();
    seedBook({
      workspaceId: "workspace-one",
      bookId: "shared-book-id",
      title: "Workspace One Book",
      manuscript: "Private manuscript one",
      chapterTitle: "One",
      chapterText: "Private chapter one",
    });
    seedBook({
      workspaceId: "workspace-two",
      bookId: "shared-book-id",
      title: "Workspace Two Book",
      manuscript: "Private manuscript two",
      chapterTitle: "Two",
      chapterText: "Private chapter two",
    });
    expect(
      bookRepository.getWorkspaceBook("workspace-one", "shared-book-id"),
    ).toMatchObject({
      title: "Workspace One Book",
      manuscript: "Private manuscript one",
      chapters: [{ title: "One", text: "Private chapter one" }],
    });
    expect(
      bookRepository.getWorkspaceBook("workspace-two", "shared-book-id"),
    ).toMatchObject({
      title: "Workspace Two Book",
      manuscript: "Private manuscript two",
      chapters: [{ title: "Two", text: "Private chapter two" }],
    });

    expect(
      bookRepository.deleteWorkspaceBook("workspace-one", "shared-book-id"),
    ).toMatchObject({ ok: true, workspaceId: "workspace-one" });
    expect(
      bookRepository.getWorkspaceBook("workspace-one", "shared-book-id"),
    ).toBeNull();
    expect(
      bookRepository.getWorkspaceBook("workspace-two", "shared-book-id"),
    ).toMatchObject({
      title: "Workspace Two Book",
      manuscript: "Private manuscript two",
    });
  });

  it("keeps progress artifact validation scoped and revisions optimistic", () => {
    useTemporaryDatabase();
    seedBook({
      workspaceId: "workspace-progress",
      bookId: "book-progress",
      title: "Progress Book",
      manuscript: "Progress manuscript",
      chapterTitle: "Progress Chapter",
      chapterText: "Progress text",
    });
    seedBook({
      workspaceId: "workspace-foreign",
      bookId: "book-progress",
      title: "Foreign Book",
      manuscript: "Foreign manuscript",
      chapterTitle: "Foreign Chapter",
      chapterText: "Foreign text",
    });

    const job = generationRepository.enqueueGenerationJob({
      workspaceId: "workspace-progress",
      kind: "sample-generation",
      bookId: "book-progress",
      narratorId: "marlowe",
      mode: "classic",
      chapterCount: 1,
    });
    expect(generationRepository.claimNextGenerationJob()?.id).toBe(job?.id);
    expect(
      generationRepository.completeGenerationJob(
        job?.id ?? "",
        "workspace-progress",
        {
          assetPath: "generated-audio/workspace-progress/progress.wav",
          mimeType: "audio/wav",
          provider: "kokoro-local",
        },
      ),
    ).toMatchObject({ ok: true });
    const artifact = generationRepository.getGenerationArtifactForJob(
      job?.id ?? "",
      "workspace-progress",
    );

    expect(
      bookRepository.saveWorkspaceBookProgress({
        workspaceId: "workspace-foreign",
        bookId: "book-progress",
        artifactId: artifact?.id ?? "",
        positionSeconds: 5,
        durationSeconds: 30,
        speed: 1,
        chapterIndex: null,
        expectedRevision: 0,
      }),
    ).toEqual({ status: "artifact-not-current" });

    const firstWrite = bookRepository.saveWorkspaceBookProgress({
      workspaceId: "workspace-progress",
      bookId: "book-progress",
      artifactId: artifact?.id ?? "",
      positionSeconds: 10,
      durationSeconds: 30,
      speed: 1.25,
      chapterIndex: null,
      expectedRevision: 0,
      now: "2026-07-19T13:00:00.000Z",
    });
    expect(firstWrite).toMatchObject({
      status: "updated",
      progress: { revision: 1, positionSeconds: 10 },
    });
    expect(
      bookRepository.saveWorkspaceBookProgress({
        workspaceId: "workspace-progress",
        bookId: "book-progress",
        artifactId: artifact?.id ?? "",
        positionSeconds: 20,
        durationSeconds: 30,
        speed: 1.25,
        chapterIndex: null,
        expectedRevision: 0,
      }),
    ).toEqual({ status: "conflict", currentRevision: 1 });
    expect(
      bookRepository.getWorkspaceBookProgress(
        "workspace-progress",
        "book-progress",
      ),
    ).toMatchObject({ revision: 1, positionSeconds: 10 });
    expect(
      bookRepository.getWorkspaceBookProgress(
        "workspace-foreign",
        "book-progress",
      ),
    ).toBeNull();
  });
});
