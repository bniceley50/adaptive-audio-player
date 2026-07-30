import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

import { getDatabase } from "./database.ts";
import {
  cleanupGenerationAssetsForBookDeletion,
  getGenerationArtifactById,
  getGenerationOutputForBookKind,
  type GenerationArtifactCleanupFailure,
} from "./generation-repository.ts";
import type {
  GenerationArtifactSummary,
  GenerationOutputSummary,
  SyncedBookDisplayMeta,
} from "./types.ts";

export type DeleteWorkspaceBookResult =
  | {
      ok: true;
      workspaceId: string;
      bookId: string;
      deletedFiles: number;
      missingFiles: number;
    }
  | {
      ok: false;
      code: "artifact-cleanup-failed" | "database-cleanup-failed";
      message: string;
      workspaceId: string;
      bookId: string;
      failures: GenerationArtifactCleanupFailure[];
    };

export type WorkspaceBookSummary = {
  bookId: string;
  title: string;
  chapterCount: number;
  updatedAt: string;
};

export type WorkspaceBookDetail = WorkspaceBookSummary & {
  manuscript: string;
  chapters: Array<{
    id: string;
    title: string;
    text: string;
    order: number;
  }>;
};

export type WorkspaceBookProgress = {
  bookId: string;
  artifactId: string;
  positionSeconds: number;
  durationSeconds: number;
  speed: number;
  chapterIndex: number | null;
  revision: number;
  updatedAt: string;
};

export type SaveWorkspaceBookProgressResult =
  | { status: "updated"; progress: WorkspaceBookProgress }
  | { status: "conflict"; currentRevision: number }
  | { status: "book-not-found" }
  | { status: "artifact-not-current" }
  | { status: "invalid-chapter" };

export type CreateWorkspaceBookResult =
  | {
      status: "created" | "replayed";
      book: WorkspaceBookSummary;
    }
  | {
      status: "idempotency-conflict";
      book: null;
    };

function ensureWorkspace(
  database: DatabaseSync,
  workspaceId: string,
  timestamp: string,
) {
  database
    .prepare(
      `
        insert into workspaces (id, created_at, updated_at, last_synced_at)
        values (?, ?, ?, null)
        on conflict(id) do update set updated_at = excluded.updated_at
      `,
    )
    .run(workspaceId, timestamp, timestamp);
}

function toWorkspaceBookSummary(row: {
  book_id: string;
  title: string;
  chapter_count: number;
  updated_at: string;
}): WorkspaceBookSummary {
  return {
    bookId: row.book_id,
    title: row.title,
    chapterCount: row.chapter_count,
    updatedAt: row.updated_at,
  };
}

export function getSyncedBookTitle(workspaceId: string, bookId: string) {
  const row = getDatabase()
    .prepare(
      `
        select title
        from synced_books
        where workspace_id = ?
          and book_id = ?
      `,
    )
    .get(workspaceId, bookId) as { title: string } | undefined;

  return row?.title ?? null;
}

export function createWorkspaceBook(input: {
  workspaceId: string;
  idempotencyKey: string;
  requestFingerprint: string;
  title: string;
  text: string;
  chapters: Array<{
    id: string;
    title: string;
    text: string;
    order: number;
  }>;
}): CreateWorkspaceBookResult {
  const database = getDatabase();
  const timestamp = new Date().toISOString();

  database.exec("begin immediate");

  try {
    ensureWorkspace(database, input.workspaceId, timestamp);

    const existingRequest = database
      .prepare(
        `
          select
            book_create_requests.request_fingerprint,
            synced_books.book_id,
            synced_books.title,
            synced_books.chapter_count,
            synced_books.updated_at
          from book_create_requests
          join synced_books
            on synced_books.workspace_id = book_create_requests.workspace_id
           and synced_books.book_id = book_create_requests.book_id
          where book_create_requests.workspace_id = ?
            and book_create_requests.idempotency_key = ?
        `,
      )
      .get(input.workspaceId, input.idempotencyKey) as
      | {
          request_fingerprint: string;
          book_id: string;
          title: string;
          chapter_count: number;
          updated_at: string;
        }
      | undefined;

    if (existingRequest) {
      database.exec("commit");

      if (existingRequest.request_fingerprint !== input.requestFingerprint) {
        return { status: "idempotency-conflict", book: null };
      }

      return {
        status: "replayed",
        book: toWorkspaceBookSummary(existingRequest),
      };
    }

    const bookId = `book-${randomUUID()}`;
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
          )
          values (?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        input.workspaceId,
        bookId,
        input.title,
        input.chapters.length,
        timestamp,
        input.text,
      );

    const insertChapter = database.prepare(
      `
        insert into book_chapters (
          workspace_id,
          book_id,
          chapter_index,
          chapter_id,
          title,
          text
        )
        values (?, ?, ?, ?, ?, ?)
      `,
    );
    for (const chapter of input.chapters) {
      insertChapter.run(
        input.workspaceId,
        bookId,
        chapter.order,
        chapter.id,
        chapter.title,
        chapter.text,
      );
    }

    database
      .prepare(
        `
          insert into book_create_requests (
            workspace_id,
            idempotency_key,
            request_fingerprint,
            book_id,
            created_at
          )
          values (?, ?, ?, ?, ?)
        `,
      )
      .run(
        input.workspaceId,
        input.idempotencyKey,
        input.requestFingerprint,
        bookId,
        timestamp,
      );

    database.exec("commit");

    return {
      status: "created",
      book: {
        bookId,
        title: input.title,
        chapterCount: input.chapters.length,
        updatedAt: timestamp,
      },
    };
  } catch (error) {
    database.exec("rollback");
    throw error;
  }
}

export function listWorkspaceBooks(workspaceId: string): WorkspaceBookSummary[] {
  const rows = getDatabase()
    .prepare(
      `
        select book_id, title, chapter_count, updated_at
        from synced_books
        where workspace_id = ?
        order by updated_at desc, book_id asc
      `,
    )
    .all(workspaceId) as Array<{
    book_id: string;
    title: string;
    chapter_count: number;
    updated_at: string;
  }>;

  return rows.map(toWorkspaceBookSummary);
}

export function getWorkspaceBook(
  workspaceId: string,
  bookId: string,
): WorkspaceBookDetail | null {
  const database = getDatabase();
  const bookRow = database
    .prepare(
      `
        select book_id, title, chapter_count, updated_at, draft_text
        from synced_books
        where workspace_id = ? and book_id = ?
      `,
    )
    .get(workspaceId, bookId) as
    | {
        book_id: string;
        title: string;
        chapter_count: number;
        updated_at: string;
        draft_text: string;
      }
    | undefined;
  if (!bookRow) {
    return null;
  }

  const chapterRows = database
    .prepare(
      `
        select chapter_id, title, text, chapter_index
        from book_chapters
        where workspace_id = ? and book_id = ?
        order by chapter_index
      `,
    )
    .all(workspaceId, bookId) as Array<{
    chapter_id: string;
    title: string;
    text: string;
    chapter_index: number;
  }>;

  return {
    ...toWorkspaceBookSummary(bookRow),
    manuscript: bookRow.draft_text,
    chapters: chapterRows.map((chapter) => ({
      id: chapter.chapter_id,
      title: chapter.title,
      text: chapter.text,
      order: chapter.chapter_index,
    })),
  };
}

function mapWorkspaceBookProgressRow(row: {
  book_id: string;
  artifact_id: string;
  position_seconds: number;
  duration_seconds: number;
  speed: number;
  chapter_index: number | null;
  revision: number;
  updated_at: string;
}): WorkspaceBookProgress {
  return {
    bookId: row.book_id,
    artifactId: row.artifact_id,
    positionSeconds: Number(row.position_seconds),
    durationSeconds: Number(row.duration_seconds),
    speed: Number(row.speed),
    chapterIndex:
      row.chapter_index === null ? null : Number(row.chapter_index),
    revision: Number(row.revision),
    updatedAt: row.updated_at,
  };
}

export function getWorkspaceBookProgress(
  workspaceId: string,
  bookId: string,
): WorkspaceBookProgress | null {
  const row = getDatabase()
    .prepare(
      `
        select book_id, artifact_id, position_seconds, duration_seconds,
               speed, chapter_index, revision, updated_at
        from book_progress
        where workspace_id = ? and book_id = ?
      `,
    )
    .get(workspaceId, bookId) as
    | {
        book_id: string;
        artifact_id: string;
        position_seconds: number;
        duration_seconds: number;
        speed: number;
        chapter_index: number | null;
        revision: number;
        updated_at: string;
      }
    | undefined;

  return row ? mapWorkspaceBookProgressRow(row) : null;
}

function isCurrentGenerationArtifact(
  artifact: GenerationArtifactSummary,
  output: GenerationOutputSummary | null,
) {
  if (
    !output ||
    output.workspaceId !== artifact.workspaceId ||
    output.bookId !== artifact.bookId ||
    output.kind !== artifact.kind
  ) {
    return false;
  }

  if (artifact.isChapterArtifact) {
    return output.chapterAssetPaths?.includes(artifact.assetPath) === true;
  }

  return (
    output.assetPath === artifact.assetPath &&
    output.generatedAt === artifact.generatedAt
  );
}

export function saveWorkspaceBookProgress(input: {
  workspaceId: string;
  bookId: string;
  artifactId: string;
  positionSeconds: number;
  durationSeconds: number;
  speed: number;
  chapterIndex: number | null;
  expectedRevision: number;
  now?: string;
}): SaveWorkspaceBookProgressResult {
  const database = getDatabase();
  database.exec("begin immediate");

  try {
    const book = database
      .prepare(
        `
          select chapter_count
          from synced_books
          where workspace_id = ? and book_id = ?
        `,
      )
      .get(input.workspaceId, input.bookId) as
      | { chapter_count: number }
      | undefined;
    if (!book) {
      database.exec("rollback");
      return { status: "book-not-found" };
    }

    if (
      input.chapterIndex !== null &&
      input.chapterIndex >= Number(book.chapter_count)
    ) {
      database.exec("rollback");
      return { status: "invalid-chapter" };
    }

    const artifact = getGenerationArtifactById(
      input.workspaceId,
      input.artifactId,
    );
    const currentOutput = artifact
      ? getGenerationOutputForBookKind(
          input.workspaceId,
          input.bookId,
          artifact.kind,
        )
      : null;
    if (
      !artifact ||
      artifact.bookId !== input.bookId ||
      !isCurrentGenerationArtifact(artifact, currentOutput)
    ) {
      database.exec("rollback");
      return { status: "artifact-not-current" };
    }

    if (
      artifact.isChapterArtifact &&
      input.chapterIndex !== artifact.chapterIndex
    ) {
      database.exec("rollback");
      return { status: "invalid-chapter" };
    }

    const currentProgress = getWorkspaceBookProgress(
      input.workspaceId,
      input.bookId,
    );
    const currentRevision = currentProgress?.revision ?? 0;
    if (input.expectedRevision !== currentRevision) {
      database.exec("rollback");
      return { status: "conflict", currentRevision };
    }

    const nextRevision = currentRevision + 1;
    const updatedAt = input.now ?? new Date().toISOString();
    database
      .prepare(
        `
          insert into book_progress (
            workspace_id,
            book_id,
            artifact_id,
            position_seconds,
            duration_seconds,
            speed,
            chapter_index,
            revision,
            updated_at
          ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
          on conflict(workspace_id, book_id) do update set
            artifact_id = excluded.artifact_id,
            position_seconds = excluded.position_seconds,
            duration_seconds = excluded.duration_seconds,
            speed = excluded.speed,
            chapter_index = excluded.chapter_index,
            revision = excluded.revision,
            updated_at = excluded.updated_at
        `,
      )
      .run(
        input.workspaceId,
        input.bookId,
        input.artifactId,
        input.positionSeconds,
        input.durationSeconds,
        input.speed,
        input.chapterIndex,
        nextRevision,
        updatedAt,
      );

    database.exec("commit");
    return {
      status: "updated",
      progress: {
        bookId: input.bookId,
        artifactId: input.artifactId,
        positionSeconds: input.positionSeconds,
        durationSeconds: input.durationSeconds,
        speed: input.speed,
        chapterIndex: input.chapterIndex,
        revision: nextRevision,
        updatedAt,
      },
    };
  } catch (error) {
    database.exec("rollback");
    throw error;
  }
}

export function getSyncedBookDisplayMeta(
  workspaceId: string,
  bookId: string,
): SyncedBookDisplayMeta | null {
  const row = getDatabase()
    .prepare(
      `
        select
          book_id,
          title,
          cover_theme,
          cover_label,
          cover_glyph,
          genre_label
        from synced_books
        where workspace_id = ?
          and book_id = ?
      `,
    )
    .get(workspaceId, bookId) as
    | {
        book_id: string;
        title: string;
        cover_theme: string | null;
        cover_label: string | null;
        cover_glyph: string | null;
        genre_label: string | null;
      }
    | undefined;

  if (!row) {
    return null;
  }

  return {
    bookId: row.book_id,
    title: row.title,
    coverTheme: row.cover_theme,
    coverLabel: row.cover_label,
    coverGlyph: row.cover_glyph,
    genreLabel: row.genre_label,
  };
}

export function getSyncedBookDraftText(
  workspaceId: string,
  bookId: string,
): string | null {
  const row = getDatabase()
    .prepare(
      `
        select draft_text
        from synced_books
        where workspace_id = ?
          and book_id = ?
        limit 1
      `,
    )
    .get(workspaceId, bookId) as { draft_text: string } | undefined;

  return row?.draft_text ?? null;
}

export function deleteWorkspaceBook(
  workspaceId: string,
  bookId: string,
): DeleteWorkspaceBookResult {
  const database = getDatabase();
  database.exec("begin immediate");

  try {
    const cleanup = cleanupGenerationAssetsForBookDeletion(
      database,
      workspaceId,
      bookId,
    );
    if (cleanup.status === "metadata-invalid") {
      database.exec("rollback");
      return {
        ok: false,
        code: "artifact-cleanup-failed",
        message: "Book artifacts could not be validated for contained deletion.",
        workspaceId,
        bookId,
        failures: cleanup.failures,
      };
    }

    if (cleanup.status === "file-cleanup-failed") {
      database.exec("rollback");
      return {
        ok: false,
        code: "artifact-cleanup-failed",
        message: "One or more book artifacts could not be deleted safely.",
        workspaceId,
        bookId,
        failures: cleanup.failures,
      };
    }

    database
      .prepare(
        "delete from generated_output_history where workspace_id = ? and book_id = ?",
      )
      .run(workspaceId, bookId);
    database
      .prepare(
        "delete from generated_outputs where workspace_id = ? and book_id = ?",
      )
      .run(workspaceId, bookId);
    database
      .prepare(
        `delete from sync_jobs
         where workspace_id = ?
           and case when json_valid(stats_json)
             then json_extract(stats_json, '$.bookId')
             else null
           end = ?`,
      )
      .run(workspaceId, bookId);
    database
      .prepare("delete from synced_books where workspace_id = ? and book_id = ?")
      .run(workspaceId, bookId);

    database.exec("commit");
    return {
      ok: true,
      workspaceId,
      bookId,
      deletedFiles: cleanup.deletedFiles,
      missingFiles: cleanup.missingFiles,
    };
  } catch (error) {
    database.exec("rollback");
    return {
      ok: false,
      code: "database-cleanup-failed",
      message:
        error instanceof Error ? error.message : "Book metadata deletion failed.",
      workspaceId,
      bookId,
      failures: [],
    };
  }
}
