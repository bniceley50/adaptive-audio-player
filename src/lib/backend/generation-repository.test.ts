import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  getDatabase,
  resetDatabaseForTests,
} from "@/lib/backend/database";
import * as generationRepository from "@/lib/backend/generation-repository";
import * as sqliteCompatibility from "@/lib/backend/sqlite";

describe("generation repository boundary", () => {
  const createdDirs: string[] = [];

  afterEach(() => {
    resetDatabaseForTests();

    for (const dir of createdDirs.splice(0, createdDirs.length)) {
      rmSync(dir, { recursive: true, force: true });
    }

    delete process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH;
  });

  function useTemporaryDatabase() {
    const tempDir = mkdtempSync(path.join(tmpdir(), "adaptive-generation-repo-"));
    createdDirs.push(tempDir);
    process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH = path.join(
      tempDir,
      "library.sqlite",
    );
  }

  function seedBook(workspaceId: string, bookId: string) {
    const database = getDatabase();
    const timestamp = "2026-07-19T12:00:00.000Z";
    database
      .prepare(
        `
          insert into workspaces (
            id, created_at, updated_at, last_synced_at
          ) values (?, ?, ?, null)
        `,
      )
      .run(workspaceId, timestamp, timestamp);
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
      .run(workspaceId, bookId, "Repository Book", timestamp, "Chapter 1\nText");
  }

  it("preserves the established sqlite.ts generation export surface", () => {
    const compatibilityExports = [
      "cancelGenerationJob",
      "claimNextGenerationJob",
      "completeGenerationJob",
      "enqueueGenerationJob",
      "failGenerationJob",
      "getActiveGenerationJobForBookKind",
      "getGenerationArtifactById",
      "getGenerationArtifactForJob",
      "getGenerationJob",
      "getGenerationOutputForBookKind",
      "getGenerationOutputsForBook",
      "listGenerationOutputHistoryForBook",
      "listGenerationOutputsForWorkspace",
      "listRecentGenerationJobsForBook",
      "recordGenerationJobArtifact",
      "renewGenerationJobLease",
      "retryGenerationJob",
      "updateGenerationJobProgress",
    ] as const;

    for (const exportName of compatibilityExports) {
      expect(sqliteCompatibility[exportName]).toBe(
        generationRepository[exportName],
      );
    }
  });

  it("runs the generation lifecycle directly through the focused repository", () => {
    useTemporaryDatabase();
    seedBook("workspace-generation", "book-generation");
    const queuedJob = generationRepository.enqueueGenerationJob({
      workspaceId: "workspace-generation",
      kind: "sample-generation",
      bookId: "book-generation",
      narratorId: "marlowe",
      mode: "classic",
      chapterCount: 1,
    });
    expect(queuedJob?.status).toBe("queued");

    const claimedJob = generationRepository.claimNextGenerationJob();
    expect(claimedJob).toMatchObject({
      id: queuedJob?.id,
      status: "running",
      bookId: "book-generation",
    });

    const completion = generationRepository.completeGenerationJob(
      queuedJob?.id ?? "",
      "workspace-generation",
      {
        assetPath: "generated-audio/workspace-generation/sample.wav",
        mimeType: "audio/wav",
        provider: "kokoro-local",
      },
    );
    expect(completion).toMatchObject({
      ok: true,
      job: { status: "completed" },
    });
    expect(
      generationRepository.getGenerationOutputsForBook(
        "workspace-generation",
        "book-generation",
      ),
    ).toEqual([
      expect.objectContaining({
        kind: "sample-generation",
        assetPath: "generated-audio/workspace-generation/sample.wav",
      }),
    ]);
    expect(
      generationRepository.getGenerationArtifactForJob(
        queuedJob?.id ?? "",
        "workspace-generation",
      ),
    ).toEqual(
      expect.objectContaining({
        jobId: queuedJob?.id,
        bookId: "book-generation",
      }),
    );
    expect(
      generationRepository.listRecentGenerationJobsForBook(
        "workspace-generation",
        "book-generation",
      ),
    ).toEqual([expect.objectContaining({ status: "completed" })]);
  });

  it("rolls back every completion write when artifact persistence fails", () => {
    useTemporaryDatabase();
    seedBook("workspace-rollback", "book-rollback");
    const queuedJob = generationRepository.enqueueGenerationJob({
      workspaceId: "workspace-rollback",
      kind: "sample-generation",
      bookId: "book-rollback",
      narratorId: "marlowe",
      mode: "classic",
      chapterCount: 1,
    });
    expect(generationRepository.claimNextGenerationJob()?.id).toBe(queuedJob?.id);

    getDatabase().exec(`
      create trigger fail_generation_artifact_insert
      before insert on generated_output_history
      begin
        select raise(abort, 'injected artifact persistence failure');
      end;
    `);

    expect(() =>
      generationRepository.completeGenerationJob(
        queuedJob?.id ?? "",
        "workspace-rollback",
        {
          assetPath: "generated-audio/workspace-rollback/sample.wav",
          mimeType: "audio/wav",
          provider: "kokoro-local",
        },
      ),
    ).toThrow(/injected artifact persistence failure/);

    expect(
      generationRepository.getGenerationJob(
        queuedJob?.id ?? "",
        "workspace-rollback",
      ),
    ).toMatchObject({ status: "running" });
    expect(
      generationRepository.getGenerationOutputsForBook(
        "workspace-rollback",
        "book-rollback",
      ),
    ).toEqual([]);
    expect(
      generationRepository.listGenerationOutputHistoryForBook(
        "workspace-rollback",
        "book-rollback",
      ),
    ).toEqual([]);
  });
});
