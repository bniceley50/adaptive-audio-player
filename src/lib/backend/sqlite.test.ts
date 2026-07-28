import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { writeGeneratedAudioAsset } from "@/lib/backend/audio-storage";
import {
  cancelGenerationJob,
  claimNextGenerationJob,
  completeGenerationJob,
  deleteWorkspaceBook,
  enqueueGenerationJob,
  failGenerationJob,
  getGenerationArtifactForJob,
  getGenerationOutputsForBook,
  getDatabase,
  getWorkerHeartbeat,
  listGenerationOutputHistoryForBook,
  getGenerationJob,
  listRecentSyncJobsForWorkspace,
  listRecentGenerationJobsForBook,
  recordWorkerHeartbeat,
  renewGenerationJobLease,
  resetDatabaseForTests,
  retryGenerationJob,
  updateGenerationJobProgress,
} from "@/lib/backend/sqlite";

describe("backend sqlite library sync", () => {
  const createdDirs: string[] = [];

  afterEach(() => {
    resetDatabaseForTests();

    for (const dir of createdDirs.splice(0, createdDirs.length)) {
      rmSync(dir, { recursive: true, force: true });
    }

    delete process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH;
    delete process.env.ADAPTIVE_AUDIO_PLAYER_DATA_ROOT;
  });

  function useTemporaryDatabase() {
    const tempDir = mkdtempSync(path.join(tmpdir(), "adaptive-audio-player-"));
    const dataRoot = mkdtempSync(
      path.join(process.cwd(), ".adaptive-audio-sqlite-"),
    );
    createdDirs.push(tempDir);
    createdDirs.push(dataRoot);
    process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH = path.join(
      tempDir,
      "library.sqlite",
    );
    process.env.ADAPTIVE_AUDIO_PLAYER_DATA_ROOT = dataRoot;
    return tempDir;
  }

  function testOutputAsset(label: string) {
    return {
      assetPath: `generated/test/${label}.wav`,
      mimeType: "audio/wav",
      provider: "kokoro-local" as const,
    };
  }

  function seedWorkspace(workspaceId: string, lastSyncedAt: string | null) {
    const timestamp = lastSyncedAt ?? "2026-03-08T12:00:00.000Z";
    getDatabase()
      .prepare(
        `
          insert into workspaces (id, created_at, updated_at, last_synced_at)
          values (?, ?, ?, ?)
        `,
      )
      .run(workspaceId, timestamp, timestamp, lastSyncedAt);
  }

  function seedStoredBooks(
    workspaceId: string,
    books: Array<{
      bookId: string;
      chapterCount: number;
      coverGlyph?: string;
      coverLabel?: string;
      coverTheme?: string;
      draftText: string;
      genreLabel?: string;
      title: string;
      updatedAt: string;
    }>,
    lastSyncedAt: string | null,
  ) {
    const database = getDatabase();
    seedWorkspace(workspaceId, lastSyncedAt);
    const insertBook = database.prepare(
      `
        insert into synced_books (
          workspace_id, book_id, title, chapter_count, updated_at, draft_text,
          cover_theme, cover_label, cover_glyph, genre_label
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    );

    for (const book of books) {
      insertBook.run(
        workspaceId,
        book.bookId,
        book.title,
        book.chapterCount,
        book.updatedAt,
        book.draftText,
        book.coverTheme ?? null,
        book.coverLabel ?? null,
        book.coverGlyph ?? null,
        book.genreLabel ?? null,
      );
    }
  }

  function getGenerationLeaseRows(workspaceId: string) {
    return getDatabase()
      .prepare(
        `
          select id, status, attempt_count, last_heartbeat_at, lease_expires_at,
                 completed_at, error_message
          from sync_jobs
          where workspace_id = ?
            and kind in ('sample-generation', 'full-book-generation')
          order by attempt_count asc, created_at asc, id asc
        `,
      )
      .all(workspaceId) as Array<{
      id: string;
      status: string;
      attempt_count: number;
      last_heartbeat_at: string | null;
      lease_expires_at: string | null;
      completed_at: string | null;
      error_message: string | null;
    }>;
  }

  it("stores and updates worker heartbeat state", () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "adaptive-audio-player-"));
    createdDirs.push(tempDir);
    process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH = path.join(tempDir, "library.sqlite");

    recordWorkerHeartbeat({
      workerName: "generation-worker",
      status: "idle",
      now: "2026-03-10T20:00:00.000Z",
    });

    expect(getWorkerHeartbeat()).toEqual({
      workerName: "generation-worker",
      status: "idle",
      startedAt: "2026-03-10T20:00:00.000Z",
      lastHeartbeatAt: "2026-03-10T20:00:00.000Z",
      lastJobId: null,
      lastJobKind: null,
      lastJobStatus: null,
    });

    recordWorkerHeartbeat({
      workerName: "generation-worker",
      status: "processing",
      lastJobId: "job-123",
      lastJobKind: "sample-generation",
      lastJobStatus: "running",
      now: "2026-03-10T20:01:00.000Z",
    });

    expect(getWorkerHeartbeat()).toEqual({
      workerName: "generation-worker",
      status: "processing",
      startedAt: "2026-03-10T20:00:00.000Z",
      lastHeartbeatAt: "2026-03-10T20:01:00.000Z",
      lastJobId: "job-123",
      lastJobKind: "sample-generation",
      lastJobStatus: "running",
    });
  });

  it("reuses an active matching generation job instead of enqueuing a duplicate", () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "adaptive-audio-player-"));
    createdDirs.push(tempDir);
    process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH = path.join(tempDir, "library.sqlite");

    seedStoredBooks(
      "workspace-dedupe",
      [
        {
          bookId: "book-1",
          title: "Storm Harbor",
          chapterCount: 2,
          updatedAt: "2026-03-10T20:00:00.000Z",
          draftText: "Chapter 1\nStorm Harbor",
        },
      ],
      "2026-03-10T20:01:00.000Z",
    );

    const firstJob = enqueueGenerationJob({
      workspaceId: "workspace-dedupe",
      kind: "sample-generation",
      bookId: "book-1",
      narratorId: "sloane",
      mode: "immersive",
    });
    const duplicateJob = enqueueGenerationJob({
      workspaceId: "workspace-dedupe",
      kind: "sample-generation",
      bookId: "book-1",
      narratorId: "sloane",
      mode: "immersive",
    });

    expect(duplicateJob?.id).toBe(firstJob?.id);
    expect(listRecentGenerationJobsForBook("workspace-dedupe", "book-1")).toHaveLength(1);
  });

  it("lists recent generation jobs for a workspace", () => {
    useTemporaryDatabase();

    seedStoredBooks(
      "workspace-jobs",
      [
        {
          bookId: "book-1",
          title: "Storm Harbor",
          chapterCount: 2,
          updatedAt: "2026-03-08T12:00:00.000Z",
          draftText: "Chapter 1",
        },
      ],
      "2026-03-08T12:01:00.000Z",
    );

    const queuedJob = enqueueGenerationJob({
      workspaceId: "workspace-jobs",
      kind: "sample-generation",
      bookId: "book-1",
      narratorId: "sloane",
      mode: "immersive",
    });

    expect(queuedJob).toMatchObject({
      workspaceId: "workspace-jobs",
      kind: "sample-generation",
      status: "queued",
      bookId: "book-1",
      narratorId: "sloane",
      mode: "immersive",
    });

    const runningJob = claimNextGenerationJob();
    expect(runningJob?.status).toBe("running");
    expect(runningJob?.id).toBe(queuedJob?.id);
    const firstSampleAsset = writeGeneratedAudioAsset({
      workspaceId: "workspace-jobs",
      bookId: "book-1",
      kind: "sample-generation",
      extension: "wav",
      data: Buffer.from("first sample"),
    });
    const completedJob = completeGenerationJob(
      queuedJob?.id ?? "",
      "workspace-jobs",
      {
        ...testOutputAsset("book-1-sample-v1"),
        assetPath: firstSampleAsset.relativePath,
      },
    );
    expect(completedJob).toMatchObject({
      ok: true,
      job: { status: "completed" },
    });
    expect(getGenerationJob(queuedJob?.id ?? "", "workspace-jobs")?.status).toBe("completed");

    const queuedSecondSampleJob = enqueueGenerationJob({
      workspaceId: "workspace-jobs",
      kind: "sample-generation",
      bookId: "book-1",
      narratorId: "marlowe",
      mode: "classic",
    });

    claimNextGenerationJob();
    const secondSampleAsset = writeGeneratedAudioAsset({
      workspaceId: "workspace-jobs",
      bookId: "book-1",
      kind: "sample-generation",
      extension: "wav",
      data: Buffer.from("second sample"),
    });
    completeGenerationJob(queuedSecondSampleJob?.id ?? "", "workspace-jobs", {
      assetPath: secondSampleAsset.relativePath,
      mimeType: "audio/wav",
      provider: "mock",
    });

    const latestWorkspaceJobs = listRecentSyncJobsForWorkspace("workspace-jobs");
    expect(latestWorkspaceJobs[0]).toMatchObject({
      workspaceId: "workspace-jobs",
      kind: "sample-generation",
      status: "completed",
      bookId: "book-1",
      bookTitle: "Storm Harbor",
      playableArtifactKind: "sample-generation",
      resumePath: "/player/book-1?artifact=sample",
    });
    expect(getGenerationOutputsForBook("workspace-jobs", "book-1")).toEqual([
      expect.objectContaining({
        workspaceId: "workspace-jobs",
        bookId: "book-1",
        kind: "sample-generation",
        narratorId: "marlowe",
        mode: "classic",
      }),
    ]);

    const queuedFullBookJob = enqueueGenerationJob({
      workspaceId: "workspace-jobs",
      kind: "full-book-generation",
      bookId: "book-1",
      narratorId: null,
      mode: null,
      chapterCount: 2,
    });

    expect(queuedFullBookJob).toMatchObject({
      kind: "full-book-generation",
      status: "queued",
      bookId: "book-1",
      chapterCount: 2,
    });

    const runningFullBookJob = claimNextGenerationJob();
    expect(runningFullBookJob).toMatchObject({
      kind: "full-book-generation",
      status: "running",
    });
    expect(runningFullBookJob?.id).toBe(queuedFullBookJob?.id);
    expect(
      updateGenerationJobProgress(queuedFullBookJob?.id ?? "", "workspace-jobs", {
        totalChapters: 2,
        completedChapters: 1,
        currentChapterIndex: 0,
        currentChapterTitle: "Chapter 1",
      })?.renderProgress,
    ).toEqual({
      totalChapters: 2,
      completedChapters: 1,
      currentChapterIndex: 0,
      currentChapterTitle: "Chapter 1",
    });

    const completedFullBookJob = completeGenerationJob(
      queuedFullBookJob?.id ?? "",
      "workspace-jobs",
      {
        assetPath: "generated/workspace-jobs/book-1-full.wav",
        mimeType: "audio/wav",
        provider: "mock",
        chapterAssetPaths: [
          "generated/workspace-jobs/book-1-chapter-1.wav",
          "generated/workspace-jobs/book-1-chapter-2.wav",
        ],
        chapterArtifacts: [
          {
            assetPath: "generated/workspace-jobs/book-1-chapter-1.wav",
            mimeType: "audio/wav",
            provider: "mock",
            chapterIndex: 0,
            chapterTitle: "Chapter 1",
          },
          {
            assetPath: "generated/workspace-jobs/book-1-chapter-2.wav",
            mimeType: "audio/wav",
            provider: "mock",
            chapterIndex: 1,
            chapterTitle: "Chapter 2",
          },
        ],
      },
    );
    expect(completedFullBookJob).toMatchObject({
      ok: true,
      job: {
        kind: "full-book-generation",
        status: "completed",
        bookId: "book-1",
        chapterCount: 2,
      },
    });

    const bookJobs = listRecentGenerationJobsForBook("workspace-jobs", "book-1", 10);
    expect(bookJobs).toHaveLength(3);
    expect(bookJobs.map((job) => job.kind).sort()).toEqual([
      "full-book-generation",
      "sample-generation",
      "sample-generation",
    ]);
    expect(bookJobs.find((job) => job.kind === "full-book-generation")).toMatchObject({
      bookTitle: "Storm Harbor",
      playableArtifactKind: "full-book-generation",
      resumePath: "/player/book-1?artifact=full",
    });
    expect(getGenerationOutputsForBook("workspace-jobs", "book-1")).toEqual([
      expect.objectContaining({
        workspaceId: "workspace-jobs",
        bookId: "book-1",
        kind: "full-book-generation",
        chapterCount: 2,
        chapterAssetPaths: [
          "generated/workspace-jobs/book-1-chapter-1.wav",
          "generated/workspace-jobs/book-1-chapter-2.wav",
        ],
      }),
      expect.objectContaining({
        workspaceId: "workspace-jobs",
        bookId: "book-1",
        kind: "sample-generation",
        narratorId: "marlowe",
        mode: "classic",
      }),
    ]);
    const generationHistory = listGenerationOutputHistoryForBook(
      "workspace-jobs",
      "book-1",
      10,
    );
    expect(generationHistory).toHaveLength(4);
    expect(generationHistory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          jobId: queuedFullBookJob?.id,
          kind: "full-book-generation",
          isChapterArtifact: false,
        }),
        expect.objectContaining({
          jobId: queuedFullBookJob?.id,
          kind: "full-book-generation",
          chapterIndex: 0,
          chapterTitle: "Chapter 1",
          isChapterArtifact: true,
        }),
        expect.objectContaining({
          jobId: queuedFullBookJob?.id,
          kind: "full-book-generation",
          chapterIndex: 1,
          chapterTitle: "Chapter 2",
          isChapterArtifact: true,
        }),
        expect.objectContaining({
          jobId: queuedSecondSampleJob?.id,
          kind: "sample-generation",
          narratorId: "marlowe",
          mode: "classic",
        }),
      ]),
    );
    expect(getGenerationArtifactForJob(queuedFullBookJob?.id ?? "", "workspace-jobs"))
      .toEqual(
        expect.objectContaining({
          jobId: queuedFullBookJob?.id,
          kind: "full-book-generation",
          assetPath: "generated/workspace-jobs/book-1-full.wav",
          isChapterArtifact: false,
        }),
      );
    expect(getGenerationArtifactForJob(queuedSecondSampleJob?.id ?? "", "workspace-jobs"))
      .toEqual(
        expect.objectContaining({
          jobId: queuedSecondSampleJob?.id,
          kind: "sample-generation",
          narratorId: "marlowe",
          mode: "classic",
        }),
      );
    expect(getGenerationOutputsForBook("workspace-jobs", "book-1")).toHaveLength(
      2,
    );
  });

  it("rejects completion while a generation job is queued", () => {
    useTemporaryDatabase();
    const queuedJob = enqueueGenerationJob({
      workspaceId: "workspace-completion",
      kind: "sample-generation",
      bookId: "book-queued",
      narratorId: "marlowe",
      mode: "classic",
    });

    const result = completeGenerationJob(
      queuedJob?.id ?? "",
      "workspace-completion",
      testOutputAsset("book-queued"),
    );

    expect(result).toMatchObject({
      ok: false,
      code: "state-conflict",
      currentStatus: "queued",
      job: { id: queuedJob?.id, status: "queued" },
    });
    expect(getGenerationOutputsForBook("workspace-completion", "book-queued")).toEqual(
      [],
    );
    expect(
      listGenerationOutputHistoryForBook(
        "workspace-completion",
        "book-queued",
      ),
    ).toEqual([]);
    expect(
      getGenerationArtifactForJob(
        queuedJob?.id ?? "",
        "workspace-completion",
      ),
    ).toBeNull();
  });

  it("rejects completion after cancellation and leaves the job cancelled", () => {
    useTemporaryDatabase();
    const queuedJob = enqueueGenerationJob({
      workspaceId: "workspace-completion",
      kind: "sample-generation",
      bookId: "book-cancelled",
      narratorId: "marlowe",
      mode: "classic",
    });
    expect(claimNextGenerationJob()?.id).toBe(queuedJob?.id);
    expect(
      cancelGenerationJob(queuedJob?.id ?? "", "workspace-completion")?.status,
    ).toBe("cancelled");

    const result = completeGenerationJob(
      queuedJob?.id ?? "",
      "workspace-completion",
      testOutputAsset("book-cancelled"),
    );

    expect(result).toMatchObject({
      ok: false,
      code: "state-conflict",
      currentStatus: "cancelled",
      job: { id: queuedJob?.id, status: "cancelled" },
    });
    expect(
      getGenerationJob(queuedJob?.id ?? "", "workspace-completion"),
    ).toMatchObject({
      status: "cancelled",
      errorMessage: "Cancelled by user.",
    });
    expect(
      getGenerationOutputsForBook("workspace-completion", "book-cancelled"),
    ).toEqual([]);
    expect(
      listGenerationOutputHistoryForBook(
        "workspace-completion",
        "book-cancelled",
      ),
    ).toEqual([]);
  });

  it("returns a conflict for duplicate completion without duplicating history", () => {
    useTemporaryDatabase();
    const queuedJob = enqueueGenerationJob({
      workspaceId: "workspace-completion",
      kind: "sample-generation",
      bookId: "book-duplicate",
      narratorId: "marlowe",
      mode: "classic",
    });
    expect(claimNextGenerationJob()?.id).toBe(queuedJob?.id);
    const outputAsset = testOutputAsset("book-duplicate");

    expect(
      completeGenerationJob(
        queuedJob?.id ?? "",
        "workspace-completion",
        outputAsset,
      ),
    ).toMatchObject({ ok: true, job: { status: "completed" } });
    const duplicateResult = completeGenerationJob(
      queuedJob?.id ?? "",
      "workspace-completion",
      outputAsset,
    );

    expect(duplicateResult).toMatchObject({
      ok: false,
      code: "state-conflict",
      currentStatus: "completed",
      job: { id: queuedJob?.id, status: "completed" },
    });
    expect(
      listGenerationOutputHistoryForBook(
        "workspace-completion",
        "book-duplicate",
      ),
    ).toHaveLength(1);
  });

  it("rolls back every completion row when a mid-transaction write fails", () => {
    useTemporaryDatabase();
    const queuedJob = enqueueGenerationJob({
      workspaceId: "workspace-completion",
      kind: "full-book-generation",
      bookId: "book-rollback",
      narratorId: "sloane",
      mode: "classic",
      chapterCount: 1,
    });
    expect(claimNextGenerationJob()?.id).toBe(queuedJob?.id);
    getDatabase().exec(`
      create trigger reject_generation_completion
      before update of status on sync_jobs
      when new.status = 'completed'
      begin
        select raise(abort, 'injected completion failure');
      end;
    `);

    expect(() =>
      completeGenerationJob(
        queuedJob?.id ?? "",
        "workspace-completion",
        {
          ...testOutputAsset("book-rollback-full"),
          chapterAssetPaths: ["generated/test/book-rollback-chapter-1.wav"],
          chapterArtifacts: [
            {
              ...testOutputAsset("book-rollback-chapter-1"),
              chapterIndex: 0,
              chapterTitle: "Chapter 1",
            },
          ],
        },
      ),
    ).toThrow("injected completion failure");

    expect(
      getGenerationJob(queuedJob?.id ?? "", "workspace-completion")?.status,
    ).toBe("running");
    expect(
      getGenerationOutputsForBook("workspace-completion", "book-rollback"),
    ).toEqual([]);
    expect(
      listGenerationOutputHistoryForBook(
        "workspace-completion",
        "book-rollback",
      ),
    ).toEqual([]);
    expect(
      getGenerationArtifactForJob(
        queuedJob?.id ?? "",
        "workspace-completion",
      ),
    ).toBeNull();
  });

  it("commits the job, latest output, and artifact history atomically", () => {
    useTemporaryDatabase();
    const queuedJob = enqueueGenerationJob({
      workspaceId: "workspace-completion",
      kind: "full-book-generation",
      bookId: "book-atomic",
      narratorId: "sloane",
      mode: "classic",
      chapterCount: 2,
    });
    expect(claimNextGenerationJob()?.id).toBe(queuedJob?.id);

    const result = completeGenerationJob(
      queuedJob?.id ?? "",
      "workspace-completion",
      {
        ...testOutputAsset("book-atomic-full"),
        chapterAssetPaths: [
          "generated/test/book-atomic-chapter-1.wav",
          "generated/test/book-atomic-chapter-2.wav",
        ],
        chapterArtifacts: [
          {
            ...testOutputAsset("book-atomic-chapter-1"),
            chapterIndex: 0,
            chapterTitle: "Chapter 1",
          },
          {
            ...testOutputAsset("book-atomic-chapter-2"),
            chapterIndex: 1,
            chapterTitle: "Chapter 2",
          },
        ],
      },
    );

    expect(result).toMatchObject({
      ok: true,
      job: {
        id: queuedJob?.id,
        status: "completed",
        playableArtifactKind: "full-book-generation",
      },
    });
    expect(getGenerationOutputsForBook("workspace-completion", "book-atomic")).toEqual([
      expect.objectContaining({
        assetPath: "generated/test/book-atomic-full.wav",
        chapterAssetPaths: [
          "generated/test/book-atomic-chapter-1.wav",
          "generated/test/book-atomic-chapter-2.wav",
        ],
      }),
    ]);
    expect(
      listGenerationOutputHistoryForBook(
        "workspace-completion",
        "book-atomic",
      ),
    ).toHaveLength(3);
    expect(
      getGenerationArtifactForJob(
        queuedJob?.id ?? "",
        "workspace-completion",
      ),
    ).toMatchObject({
      assetPath: "generated/test/book-atomic-full.wav",
      isChapterArtifact: false,
    });
  });

  it("can fail a running generation job", () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "adaptive-audio-player-"));
    createdDirs.push(tempDir);
    process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH = path.join(tempDir, "library.sqlite");

    const queuedJob = enqueueGenerationJob({
      workspaceId: "workspace-failure",
      kind: "sample-generation",
      bookId: "book-failure",
      narratorId: "marlowe",
      mode: "ambient",
    });

    const runningJob = claimNextGenerationJob();
    expect(runningJob?.id).toBe(queuedJob?.id);
    expect(runningJob?.status).toBe("running");

    const failedJob = failGenerationJob(
      queuedJob?.id ?? "",
      "workspace-failure",
      "Sample provider timed out.",
    );
    expect(failedJob?.status).toBe("failed");
    expect(failedJob?.errorMessage).toBe("Sample provider timed out.");
    expect(getGenerationJob(queuedJob?.id ?? "", "workspace-failure")?.status).toBe(
      "failed",
    );
  });

  it("can retry a failed generation job", () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "adaptive-audio-player-"));
    createdDirs.push(tempDir);
    process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH = path.join(tempDir, "library.sqlite");

    const queuedJob = enqueueGenerationJob({
      workspaceId: "workspace-retry",
      kind: "full-book-generation",
      bookId: "book-retry",
      narratorId: null,
      mode: null,
      chapterCount: 4,
    });

    claimNextGenerationJob();
    failGenerationJob(queuedJob?.id ?? "", "workspace-retry");

    const retriedJob = retryGenerationJob(queuedJob?.id ?? "", "workspace-retry");
    expect(retriedJob).toMatchObject({
      workspaceId: "workspace-retry",
      kind: "full-book-generation",
      status: "queued",
      bookId: "book-retry",
      chapterCount: 4,
    });
    expect(retriedJob?.id).not.toBe(queuedJob?.id);
  });

  it("keeps a freshly leased generation job running", () => {
    useTemporaryDatabase();
    const claimedAt = "2026-07-18T12:00:00.000Z";
    const queuedJob = enqueueGenerationJob({
      workspaceId: "workspace-fresh-lease",
      kind: "sample-generation",
      bookId: "book-fresh-lease",
      narratorId: "marlowe",
      mode: "classic",
    });

    expect(claimNextGenerationJob({ now: claimedAt })?.id).toBe(queuedJob?.id);
    expect(
      claimNextGenerationJob({ now: "2026-07-18T12:00:30.000Z" }),
    ).toBeNull();
    expect(getGenerationLeaseRows("workspace-fresh-lease")).toEqual([
      expect.objectContaining({
        id: queuedJob?.id,
        status: "running",
        attempt_count: 1,
        last_heartbeat_at: claimedAt,
        lease_expires_at: "2026-07-18T12:00:45.000Z",
        completed_at: null,
        error_message: null,
      }),
    ]);
  });

  it("renews a running job heartbeat before its lease expires", () => {
    useTemporaryDatabase();
    const queuedJob = enqueueGenerationJob({
      workspaceId: "workspace-renew-lease",
      kind: "sample-generation",
      bookId: "book-renew-lease",
      narratorId: "marlowe",
      mode: "classic",
    });
    expect(
      claimNextGenerationJob({ now: "2026-07-18T12:00:00.000Z" })?.id,
    ).toBe(queuedJob?.id);

    expect(
      renewGenerationJobLease(
        queuedJob?.id ?? "",
        "workspace-renew-lease",
        { now: "2026-07-18T12:00:30.000Z" },
      ),
    ).toMatchObject({ id: queuedJob?.id, status: "running" });
    expect(
      claimNextGenerationJob({ now: "2026-07-18T12:01:00.000Z" }),
    ).toBeNull();
    expect(getGenerationLeaseRows("workspace-renew-lease")[0]).toMatchObject({
      attempt_count: 1,
      last_heartbeat_at: "2026-07-18T12:00:30.000Z",
      lease_expires_at: "2026-07-18T12:01:15.000Z",
    });
  });

  it("reclaims an expired job exactly once with a fenced replacement id", () => {
    useTemporaryDatabase();
    const queuedJob = enqueueGenerationJob({
      workspaceId: "workspace-expired-lease",
      kind: "full-book-generation",
      bookId: "book-expired-lease",
      narratorId: "sloane",
      mode: "classic",
      chapterCount: 2,
    });
    const original = claimNextGenerationJob({
      now: "2026-07-18T12:00:00.000Z",
    });
    expect(original?.id).toBe(queuedJob?.id);

    const replacement = claimNextGenerationJob({
      now: "2026-07-18T12:01:00.000Z",
    });
    expect(replacement).toMatchObject({
      status: "running",
      workspaceId: "workspace-expired-lease",
      kind: "full-book-generation",
      bookId: "book-expired-lease",
      chapterCount: 2,
    });
    expect(replacement?.id).not.toBe(original?.id);
    expect(
      claimNextGenerationJob({ now: "2026-07-18T12:01:00.000Z" }),
    ).toBeNull();

    const rows = getGenerationLeaseRows("workspace-expired-lease");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      id: original?.id,
      status: "failed",
      attempt_count: 1,
      completed_at: "2026-07-18T12:01:00.000Z",
      lease_expires_at: null,
      error_message:
        "Generation stopped because the worker heartbeat expired. A replacement job was queued automatically.",
    });
    expect(rows[1]).toMatchObject({
      id: replacement?.id,
      status: "running",
      attempt_count: 2,
      last_heartbeat_at: "2026-07-18T12:01:00.000Z",
      lease_expires_at: "2026-07-18T12:01:45.000Z",
    });
    expect(
      completeGenerationJob(
        original?.id ?? "",
        "workspace-expired-lease",
        testOutputAsset("stale-worker-output"),
      ),
    ).toMatchObject({
      ok: false,
      code: "state-conflict",
      currentStatus: "failed",
    });
  });

  it("rejects completion after lease expiry before recovery is claimed", () => {
    useTemporaryDatabase();
    const queuedJob = enqueueGenerationJob({
      workspaceId: "workspace-expired-completion",
      kind: "sample-generation",
      bookId: "book-expired-completion",
      narratorId: "marlowe",
      mode: "classic",
    });
    expect(
      claimNextGenerationJob({ now: "2026-07-18T12:00:00.000Z" })?.id,
    ).toBe(queuedJob?.id);

    expect(
      completeGenerationJob(
        queuedJob?.id ?? "",
        "workspace-expired-completion",
        testOutputAsset("expired-completion"),
      ),
    ).toMatchObject({
      ok: false,
      code: "state-conflict",
      currentStatus: "running",
      message: "Generation job lease expired before completion.",
    });
    expect(
      getGenerationJob(
        queuedJob?.id ?? "",
        "workspace-expired-completion",
      )?.status,
    ).toBe("running");
    expect(
      getGenerationOutputsForBook(
        "workspace-expired-completion",
        "book-expired-completion",
      ),
    ).toEqual([]);

    const replacement = claimNextGenerationJob({
      now: "2026-07-18T12:01:00.000Z",
    });
    expect(replacement).toMatchObject({
      status: "running",
      bookId: "book-expired-completion",
    });
    expect(replacement?.id).not.toBe(queuedJob?.id);
  });

  it("stops automatic recovery after three expired worker attempts", () => {
    useTemporaryDatabase();
    enqueueGenerationJob({
      workspaceId: "workspace-max-attempts",
      kind: "sample-generation",
      bookId: "book-max-attempts",
      narratorId: "marlowe",
      mode: "classic",
    });

    expect(
      claimNextGenerationJob({ now: "2026-07-18T12:00:00.000Z" }),
    ).not.toBeNull();
    expect(
      claimNextGenerationJob({ now: "2026-07-18T12:01:00.000Z" }),
    ).not.toBeNull();
    expect(
      claimNextGenerationJob({ now: "2026-07-18T12:02:00.000Z" }),
    ).not.toBeNull();
    expect(
      claimNextGenerationJob({ now: "2026-07-18T12:03:00.000Z" }),
    ).toBeNull();

    const rows = getGenerationLeaseRows("workspace-max-attempts");
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.attempt_count)).toEqual([1, 2, 3]);
    expect(rows.map((row) => row.status)).toEqual(["failed", "failed", "failed"]);
    expect(rows[2]).toMatchObject({
      completed_at: "2026-07-18T12:03:00.000Z",
      lease_expires_at: null,
      error_message:
        "Generation stopped after 3 worker attempts expired. Retry the job to try again.",
    });

    const manualRetry = retryGenerationJob(
      rows[2]?.id ?? "",
      "workspace-max-attempts",
    );
    expect(manualRetry).toMatchObject({
      status: "queued",
      bookId: "book-max-attempts",
    });
  });

  it("atomically allows only one claim for a queued job", () => {
    useTemporaryDatabase();
    const queuedJob = enqueueGenerationJob({
      workspaceId: "workspace-atomic-claim",
      kind: "sample-generation",
      bookId: "book-atomic-claim",
      narratorId: "marlowe",
      mode: "classic",
    });
    const now = "2026-07-18T12:00:00.000Z";

    const claims = [
      claimNextGenerationJob({ now }),
      claimNextGenerationJob({ now }),
    ].filter(Boolean);

    expect(claims).toHaveLength(1);
    expect(claims[0]).toMatchObject({
      id: queuedJob?.id,
      status: "running",
    });
    expect(getGenerationLeaseRows("workspace-atomic-claim")[0]).toMatchObject({
      attempt_count: 1,
      last_heartbeat_at: now,
    });
  });

  it("never recovers a user-cancelled job as worker loss", () => {
    useTemporaryDatabase();
    const queuedJob = enqueueGenerationJob({
      workspaceId: "workspace-cancelled-lease",
      kind: "sample-generation",
      bookId: "book-cancelled-lease",
      narratorId: "marlowe",
      mode: "classic",
    });
    expect(
      claimNextGenerationJob({ now: "2026-07-18T12:00:00.000Z" })?.id,
    ).toBe(queuedJob?.id);
    expect(
      cancelGenerationJob(
        queuedJob?.id ?? "",
        "workspace-cancelled-lease",
      )?.status,
    ).toBe("cancelled");
    expect(
      failGenerationJob(
        queuedJob?.id ?? "",
        "workspace-cancelled-lease",
        "Late worker failure.",
      ),
    ).toMatchObject({
      status: "cancelled",
      errorMessage: "Cancelled by user.",
    });

    expect(
      claimNextGenerationJob({ now: "2026-07-18T12:01:00.000Z" }),
    ).toBeNull();
    expect(getGenerationLeaseRows("workspace-cancelled-lease")).toEqual([
      expect.objectContaining({
        id: queuedJob?.id,
        status: "cancelled",
        attempt_count: 1,
        lease_expires_at: null,
        error_message: "Cancelled by user.",
      }),
    ]);
  });

  it("retains only the latest artifact and expires terminal generation jobs after 30 days", () => {
    useTemporaryDatabase();
    const firstAsset = writeGeneratedAudioAsset({
      workspaceId: "workspace-retention",
      bookId: "book-retention",
      kind: "sample-generation",
      extension: "wav",
      data: Buffer.from("first sample"),
    });
    const firstJob = enqueueGenerationJob({
      workspaceId: "workspace-retention",
      kind: "sample-generation",
      bookId: "book-retention",
      narratorId: "marlowe",
      mode: "classic",
    });
    expect(claimNextGenerationJob()?.id).toBe(firstJob?.id);
    expect(
      completeGenerationJob(firstJob?.id ?? "", "workspace-retention", {
        ...testOutputAsset("ignored"),
        assetPath: firstAsset.relativePath,
      }),
    ).toMatchObject({ ok: true });
    getDatabase()
      .prepare(
        "update sync_jobs set created_at = ?, completed_at = ? where id = ?",
      )
      .run(
        "2026-05-01T12:00:00.000Z",
        "2026-05-01T12:01:00.000Z",
        firstJob?.id,
      );

    const latestAsset = writeGeneratedAudioAsset({
      workspaceId: "workspace-retention",
      bookId: "book-retention",
      kind: "sample-generation",
      extension: "wav",
      data: Buffer.from("latest sample"),
    });
    const latestJob = enqueueGenerationJob({
      workspaceId: "workspace-retention",
      kind: "sample-generation",
      bookId: "book-retention",
      narratorId: "sloane",
      mode: "immersive",
    });
    expect(claimNextGenerationJob()?.id).toBe(latestJob?.id);
    expect(
      completeGenerationJob(latestJob?.id ?? "", "workspace-retention", {
        ...testOutputAsset("ignored"),
        assetPath: latestAsset.relativePath,
      }),
    ).toMatchObject({ ok: true });

    expect(existsSync(firstAsset.absolutePath)).toBe(false);
    expect(existsSync(latestAsset.absolutePath)).toBe(true);
    expect(
      listGenerationOutputHistoryForBook(
        "workspace-retention",
        "book-retention",
      ),
    ).toEqual([
      expect.objectContaining({
        jobId: latestJob?.id,
        assetPath: latestAsset.relativePath,
      }),
    ]);
    expect(
      listRecentGenerationJobsForBook(
        "workspace-retention",
        "book-retention",
      ),
    ).toEqual([expect.objectContaining({ id: latestJob?.id, status: "completed" })]);
  });

  it("deletes one book's rows and contained artifacts without touching another book", () => {
    useTemporaryDatabase();
    seedStoredBooks(
      "workspace-delete",
      [
        {
          bookId: "book-a",
          title: "Delete Me",
          chapterCount: 2,
          updatedAt: "2026-07-18T12:00:00.000Z",
          draftText: "Delete manuscript",
        },
        {
          bookId: "book-b",
          title: "Keep Me",
          chapterCount: 1,
          updatedAt: "2026-07-18T12:01:00.000Z",
          draftText: "Keep manuscript",
        },
      ],
      "2026-07-18T12:02:00.000Z",
    );
    const db = getDatabase();

    const missingAsset = writeGeneratedAudioAsset({
      workspaceId: "workspace-delete",
      bookId: "book-a",
      kind: "sample-generation",
      extension: "wav",
      data: Buffer.from("sample"),
    });
    const sampleJob = enqueueGenerationJob({
      workspaceId: "workspace-delete",
      kind: "sample-generation",
      bookId: "book-a",
      narratorId: "marlowe",
      mode: "classic",
    });
    expect(claimNextGenerationJob()?.id).toBe(sampleJob?.id);
    expect(
      completeGenerationJob(sampleJob?.id ?? "", "workspace-delete", {
        ...testOutputAsset("ignored"),
        assetPath: missingAsset.relativePath,
      }),
    ).toMatchObject({ ok: true });

    const deletedAsset = writeGeneratedAudioAsset({
      workspaceId: "workspace-delete",
      bookId: "book-a",
      kind: "full-book-generation",
      extension: "wav",
      data: Buffer.from("full book"),
    });
    const fullJob = enqueueGenerationJob({
      workspaceId: "workspace-delete",
      kind: "full-book-generation",
      bookId: "book-a",
      narratorId: "marlowe",
      mode: "classic",
      chapterCount: 2,
    });
    expect(claimNextGenerationJob()?.id).toBe(fullJob?.id);
    expect(
      completeGenerationJob(fullJob?.id ?? "", "workspace-delete", {
        ...testOutputAsset("ignored"),
        assetPath: deletedAsset.relativePath,
      }),
    ).toMatchObject({ ok: true });

    const preservedAsset = writeGeneratedAudioAsset({
      workspaceId: "workspace-delete",
      bookId: "book-b",
      kind: "sample-generation",
      extension: "wav",
      data: Buffer.from("keep sample"),
    });
    const preservedJob = enqueueGenerationJob({
      workspaceId: "workspace-delete",
      kind: "sample-generation",
      bookId: "book-b",
      narratorId: "sloane",
      mode: "immersive",
    });
    expect(claimNextGenerationJob()?.id).toBe(preservedJob?.id);
    expect(
      completeGenerationJob(preservedJob?.id ?? "", "workspace-delete", {
        ...testOutputAsset("ignored"),
        assetPath: preservedAsset.relativePath,
      }),
    ).toMatchObject({ ok: true });

    rmSync(missingAsset.absolutePath, { force: true });
    expect(deleteWorkspaceBook("workspace-delete", "book-a")).toMatchObject({
      ok: true,
      deletedFiles: 1,
      missingFiles: 1,
    });

    expect(existsSync(deletedAsset.absolutePath)).toBe(false);
    expect(existsSync(preservedAsset.absolutePath)).toBe(true);
    expect(getGenerationOutputsForBook("workspace-delete", "book-a")).toEqual([]);
    expect(
      listGenerationOutputHistoryForBook("workspace-delete", "book-a"),
    ).toEqual([]);
    expect(
      listRecentGenerationJobsForBook("workspace-delete", "book-a"),
    ).toEqual([]);
    expect(getGenerationOutputsForBook("workspace-delete", "book-b")).toEqual([
      expect.objectContaining({ assetPath: preservedAsset.relativePath }),
    ]);
    expect(
      listGenerationOutputHistoryForBook("workspace-delete", "book-b"),
    ).toHaveLength(1);
    expect(
      listRecentGenerationJobsForBook("workspace-delete", "book-b"),
    ).toHaveLength(1);

    expect(
      db
        .prepare(
          "select book_id from synced_books where workspace_id = ? order by book_id",
        )
        .all("workspace-delete"),
    ).toEqual([{ book_id: "book-b" }]);
  });

  it("rejects an out-of-root artifact path and preserves retryable book metadata", () => {
    const tempDir = useTemporaryDatabase();
    const outsidePath = path.join(tempDir, "outside.wav");
    writeFileSync(outsidePath, "outside audio");
    const queuedJob = enqueueGenerationJob({
      workspaceId: "workspace-malicious-delete",
      kind: "sample-generation",
      bookId: "book-malicious-delete",
      narratorId: "marlowe",
      mode: "classic",
    });
    expect(claimNextGenerationJob()?.id).toBe(queuedJob?.id);
    expect(
      completeGenerationJob(
        queuedJob?.id ?? "",
        "workspace-malicious-delete",
        {
          ...testOutputAsset("ignored"),
          assetPath: outsidePath,
        },
      ),
    ).toMatchObject({ ok: true });

    expect(
      deleteWorkspaceBook(
        "workspace-malicious-delete",
        "book-malicious-delete",
      ),
    ).toMatchObject({
      ok: false,
      code: "artifact-cleanup-failed",
      failures: [
        expect.objectContaining({
          assetPath: outsidePath,
          status: "rejected",
        }),
      ],
    });
    expect(existsSync(outsidePath)).toBe(true);
    expect(
      getGenerationOutputsForBook(
        "workspace-malicious-delete",
        "book-malicious-delete",
      ),
    ).toHaveLength(1);
    expect(
      listGenerationOutputHistoryForBook(
        "workspace-malicious-delete",
        "book-malicious-delete",
      ),
    ).toHaveLength(1);
    expect(
      listRecentGenerationJobsForBook(
        "workspace-malicious-delete",
        "book-malicious-delete",
      ),
    ).toHaveLength(1);
  });
});
