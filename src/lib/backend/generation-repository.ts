import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

import { deleteGeneratedAudioAssetWithResult } from "./audio-storage.ts";
import { getDatabase } from "./database.ts";
import {
  FAST_NARRATION_ENGINE_ID,
  getNarrationEngineDefinition,
  type NarrationEngineId,
} from "../narration/engines.ts";
import type {
  GenerationChapterTiming,
  GenerationArtifactSummary,
  GenerationJobKind,
  GenerationOutputProvider,
  GenerationOutputSummary,
  SyncJobSummary,
} from "./types.ts";

type SyncJobRow = {
  id: string;
  workspace_id: string;
  kind: string;
  status: string;
  stats_json: string | null;
  created_at: string;
  completed_at: string | null;
  error_message: string | null;
  book_title: string | null;
  playable_artifact_kind: string | null;
};

type GenerationJobLeaseOptions = {
  now?: string;
};

type StoredGenerationOutputRow = {
  output_json: string;
};

export type GenerationArtifactCleanupFailure = {
  assetPath: string;
  status: "rejected" | "failed";
  message: string;
};

const generationJobLeaseDurationMs = 45_000;
const generationJobHistoryRetentionMs = 30 * 24 * 60 * 60 * 1_000;
const maxAutomaticGenerationJobAttempts = 3;
const replacementQueuedMessage =
  "Generation stopped because the worker heartbeat expired. A replacement job was queued automatically.";

function ensureWorkspace(db: DatabaseSync, workspaceId: string, timestamp: string) {
  db.prepare(
    `
      insert into workspaces (id, created_at, updated_at, last_synced_at)
      values (?, ?, ?, null)
      on conflict(id) do update set updated_at = excluded.updated_at
    `,
  ).run(workspaceId, timestamp, timestamp);
}

function mapSyncJobRows(rows: SyncJobRow[]): SyncJobSummary[] {
  return rows.map((row) => {
    const stats = row.stats_json
        ? (JSON.parse(row.stats_json) as {
            books?: number;
            profiles?: number;
            playbackStates?: number;
            bookId?: string;
            narratorId?: string;
            engineId?: string;
            mode?: string;
            chapterCount?: number;
            totalChapters?: number;
            completedChapters?: number;
            currentChapterIndex?: number | null;
            currentChapterTitle?: string | null;
          })
      : null;
    const totalChapters =
      typeof stats?.totalChapters === "number"
        ? stats.totalChapters
        : typeof stats?.chapterCount === "number"
          ? stats.chapterCount
          : null;
    const completedChapters =
      typeof stats?.completedChapters === "number" ? stats.completedChapters : null;
    const renderProgress =
      row.kind === "full-book-generation" &&
      totalChapters !== null &&
      completedChapters !== null
        ? {
            totalChapters,
            completedChapters,
            currentChapterIndex:
              typeof stats?.currentChapterIndex === "number"
                ? stats.currentChapterIndex
                : null,
            currentChapterTitle:
              typeof stats?.currentChapterTitle === "string"
                ? stats.currentChapterTitle
                : null,
          }
        : null;

    const playableArtifactKind =
      row.playable_artifact_kind === "full-book-generation" ||
      row.playable_artifact_kind === "sample-generation"
        ? row.playable_artifact_kind
        : null;
    const resumePath =
      stats?.bookId && playableArtifactKind === "full-book-generation"
        ? `/player/${stats.bookId}?artifact=full`
        : stats?.bookId && playableArtifactKind === "sample-generation"
          ? `/player/${stats.bookId}?artifact=sample`
          : stats?.bookId
            ? `/books/${stats.bookId}`
            : null;

    return {
      id: row.id,
      workspaceId: row.workspace_id,
      kind: row.kind,
      status: row.status,
      createdAt: row.created_at,
      completedAt: row.completed_at,
      errorMessage: row.error_message,
      books: stats?.books ?? 0,
      profiles: stats?.profiles ?? 0,
      playbackStates: stats?.playbackStates ?? 0,
      bookId: stats?.bookId ?? null,
      bookTitle: row.book_title ?? null,
      narratorId: stats?.narratorId ?? null,
      engineId:
        getNarrationEngineDefinition(stats?.engineId)?.id ??
        FAST_NARRATION_ENGINE_ID,
      mode: stats?.mode ?? null,
      chapterCount: stats?.chapterCount ?? null,
      renderProgress,
      playableArtifactKind,
      resumePath,
    };
  });
}

function getJobById(
  jobId: string,
  workspaceId?: string | null,
): SyncJobSummary | null {
  const db = getDatabase();
  const row = db
    .prepare(
      `
        select id, workspace_id, kind, status, stats_json, created_at, completed_at, error_message
             ,
             (
               select synced_books.title
               from synced_books
               where synced_books.workspace_id = sync_jobs.workspace_id
                 and synced_books.book_id = json_extract(sync_jobs.stats_json, '$.bookId')
               limit 1
             ) as book_title,
             (
               select generated_outputs.kind
               from generated_outputs
               where generated_outputs.workspace_id = sync_jobs.workspace_id
                 and generated_outputs.book_id = json_extract(sync_jobs.stats_json, '$.bookId')
                 and json_extract(generated_outputs.output_json, '$.assetPath') != ''
               order by case generated_outputs.kind
                 when 'full-book-generation' then 0
                 when 'sample-generation' then 1
                 else 2
               end asc
               limit 1
             ) as playable_artifact_kind
        from sync_jobs
        where id = ?
          ${workspaceId ? "and workspace_id = ?" : ""}
        limit 1
      `,
    )
    .get(...(workspaceId ? [jobId, workspaceId] : [jobId])) as SyncJobRow | undefined;

  if (!row) {
    return null;
  }

  return mapSyncJobRows([row])[0] ?? null;
}

export function getGenerationJob(
  jobId: string,
  workspaceId?: string | null,
): SyncJobSummary | null {
  const job = getJobById(jobId, workspaceId);
  if (!job) {
    return null;
  }

  return job.kind === "sample-generation" || job.kind === "full-book-generation"
    ? job
    : null;
}

export function getActiveGenerationJobForBookKind(
  workspaceId: string,
  bookId: string,
  kind: GenerationJobKind,
) {
  const db = getDatabase();
  const row = db
    .prepare(
      `
        select workspace_id, kind, status,
          json_extract(stats_json, '$.bookId') as book_id
        from sync_jobs
        where workspace_id = ?
          and kind = ?
          and status in ('queued', 'running')
          and json_extract(stats_json, '$.bookId') = ?
        order by created_at desc
        limit 1
      `,
    )
    .get(workspaceId, kind, bookId) as
    | {
        workspace_id: string;
        book_id: string;
        kind: GenerationJobKind;
        status: "queued" | "running";
      }
    | undefined;

  return row
    ? {
        workspaceId: row.workspace_id,
        bookId: row.book_id,
        kind: row.kind,
        status: row.status,
      }
    : null;
}

export function enqueueGenerationJob(input: {
  workspaceId: string;
  kind: GenerationJobKind;
  bookId: string;
  narratorId: string | null;
  engineId?: NarrationEngineId;
  mode: string | null;
  chapterCount?: number | null;
}) {
  const db = getDatabase();
  const timestamp = new Date().toISOString();

  const existingJob = db
    .prepare(
      `
        select id, workspace_id, kind, status, stats_json, created_at, completed_at, error_message
             ,
             (
               select synced_books.title
               from synced_books
               where synced_books.workspace_id = sync_jobs.workspace_id
                 and synced_books.book_id = json_extract(sync_jobs.stats_json, '$.bookId')
               limit 1
             ) as book_title,
             (
               select generated_outputs.kind
               from generated_outputs
               where generated_outputs.workspace_id = sync_jobs.workspace_id
                 and generated_outputs.book_id = json_extract(sync_jobs.stats_json, '$.bookId')
                 and json_extract(generated_outputs.output_json, '$.assetPath') != ''
               order by case generated_outputs.kind
                 when 'full-book-generation' then 0
                 when 'sample-generation' then 1
                 else 2
               end asc
               limit 1
             ) as playable_artifact_kind
        from sync_jobs
        where workspace_id = ?
          and kind = ?
          and status in ('queued', 'running')
          and json_extract(stats_json, '$.bookId') = ?
          and coalesce(json_extract(stats_json, '$.narratorId'), '') = ?
          and coalesce(json_extract(stats_json, '$.engineId'), 'kokoro') = ?
          and coalesce(json_extract(stats_json, '$.mode'), '') = ?
          and coalesce(json_extract(stats_json, '$.chapterCount'), -1) = ?
        order by created_at desc
        limit 1
      `,
    )
    .get(
      input.workspaceId,
      input.kind,
      input.bookId,
      input.narratorId ?? "",
      input.engineId ?? FAST_NARRATION_ENGINE_ID,
      input.mode ?? "",
      input.chapterCount ?? -1,
    ) as SyncJobRow | undefined;

  if (existingJob) {
    return mapSyncJobRows([existingJob])[0] ?? null;
  }

  const jobId = `job-${randomUUID()}`;

  ensureWorkspace(db, input.workspaceId, timestamp);
  db.prepare(
    `
      insert into sync_jobs (id, workspace_id, kind, status, stats_json, error_message, created_at, completed_at)
      values (?, ?, ?, 'queued', ?, null, ?, null)
    `,
  ).run(
    jobId,
    input.workspaceId,
    input.kind,
    JSON.stringify({
      bookId: input.bookId,
      narratorId: input.narratorId,
      engineId: input.engineId ?? FAST_NARRATION_ENGINE_ID,
      mode: input.mode,
      chapterCount: input.chapterCount ?? null,
    }),
    timestamp,
  );

  return getGenerationJob(jobId, input.workspaceId);
}

export function updateGenerationJobProgress(
  jobId: string,
  workspaceId: string,
  progress: {
    totalChapters: number;
    completedChapters: number;
    currentChapterIndex?: number | null;
    currentChapterTitle?: string | null;
  },
) {
  const db = getDatabase();
  const { timestamp, leaseExpiresAt } = getGenerationJobLeaseWindow();
  const row = db
    .prepare(
      `
        select stats_json
        from sync_jobs
        where id = ?
          and workspace_id = ?
          and kind = 'full-book-generation'
          and status = 'running'
          and (lease_expires_at is null or lease_expires_at > ?)
        limit 1
      `,
    )
    .get(jobId, workspaceId, timestamp) as
    | { stats_json: string | null }
    | undefined;

  if (!row) {
    return getGenerationJob(jobId, workspaceId);
  }

  const stats = row.stats_json
    ? (JSON.parse(row.stats_json) as Record<string, unknown>)
    : {};

  db.prepare(
    `
      update sync_jobs
      set stats_json = ?,
          last_heartbeat_at = ?,
          lease_expires_at = ?
      where id = ?
        and workspace_id = ?
        and kind = 'full-book-generation'
        and status = 'running'
        and (lease_expires_at is null or lease_expires_at > ?)
    `,
  ).run(
    JSON.stringify({
      ...stats,
      totalChapters: Math.max(0, Math.floor(progress.totalChapters)),
      completedChapters: Math.max(0, Math.floor(progress.completedChapters)),
      currentChapterIndex:
        typeof progress.currentChapterIndex === "number"
          ? Math.max(0, Math.floor(progress.currentChapterIndex))
          : null,
      currentChapterTitle: progress.currentChapterTitle ?? null,
    }),
    timestamp,
    leaseExpiresAt,
    jobId,
    workspaceId,
    timestamp,
  );

  return getGenerationJob(jobId, workspaceId);
}

function getGenerationJobLeaseWindow(options: GenerationJobLeaseOptions = {}) {
  const now = options.now ? new Date(options.now) : new Date();
  if (Number.isNaN(now.getTime())) {
    throw new Error("Generation job lease timestamp must be a valid date.");
  }

  return {
    timestamp: now.toISOString(),
    leaseExpiresAt: new Date(
      now.getTime() + generationJobLeaseDurationMs,
    ).toISOString(),
  };
}

function recoverExpiredGenerationJobs(db: DatabaseSync, timestamp: string) {
  const expiredJobs = db
    .prepare(
      `
        select id, workspace_id, kind, stats_json, attempt_count
        from sync_jobs
        where kind in ('sample-generation', 'full-book-generation')
          and status = 'running'
          and (lease_expires_at is null or lease_expires_at <= ?)
        order by created_at asc
      `,
    )
    .all(timestamp) as Array<{
    id: string;
    workspace_id: string;
    kind: GenerationJobKind;
    stats_json: string | null;
    attempt_count: number;
  }>;

  for (const expiredJob of expiredJobs) {
    const attemptCount = Math.max(1, expiredJob.attempt_count);
    const canRetry = attemptCount < maxAutomaticGenerationJobAttempts;
    const errorMessage = canRetry
      ? replacementQueuedMessage
      : `Generation stopped after ${maxAutomaticGenerationJobAttempts} worker attempts expired. Retry the job to try again.`;
    const updateResult = db
      .prepare(
        `
          update sync_jobs
          set status = 'failed',
              attempt_count = ?,
              completed_at = ?,
              error_message = ?,
              lease_expires_at = null
          where id = ?
            and workspace_id = ?
            and status = 'running'
            and (lease_expires_at is null or lease_expires_at <= ?)
        `,
      )
      .run(
        attemptCount,
        timestamp,
        errorMessage,
        expiredJob.id,
        expiredJob.workspace_id,
        timestamp,
      ) as { changes?: number };

    if (Number(updateResult.changes ?? 0) !== 1) {
      throw new Error("Expired generation job could not be fenced for recovery.");
    }

    if (!canRetry) {
      continue;
    }

    db.prepare(
      `
        insert into sync_jobs (
          id,
          workspace_id,
          kind,
          status,
          stats_json,
          error_message,
          created_at,
          completed_at,
          attempt_count,
          last_heartbeat_at,
          lease_expires_at
        )
        values (?, ?, ?, 'queued', ?, null, ?, null, ?, null, null)
      `,
    ).run(
      `job-${randomUUID()}`,
      expiredJob.workspace_id,
      expiredJob.kind,
      expiredJob.stats_json,
      timestamp,
      attemptCount,
    );
  }
}

export function claimNextGenerationJob(
  options: GenerationJobLeaseOptions = {},
): SyncJobSummary | null {
  const db = getDatabase();
  const { timestamp, leaseExpiresAt } = getGenerationJobLeaseWindow(options);
  db.exec("begin immediate");

  try {
    recoverExpiredGenerationJobs(db, timestamp);
    const row = db
      .prepare(
        `
          select id, workspace_id
          from sync_jobs
          where kind in ('sample-generation', 'full-book-generation')
            and status = 'queued'
          order by created_at asc
          limit 1
        `,
      )
      .get() as { id: string; workspace_id: string } | undefined;

    if (!row) {
      db.exec("commit");
      return null;
    }

    const updateResult = db
      .prepare(
        `
          update sync_jobs
          set status = 'running',
              attempt_count = attempt_count + 1,
              last_heartbeat_at = ?,
              lease_expires_at = ?,
              completed_at = null
          where id = ?
            and workspace_id = ?
            and status = 'queued'
        `,
      )
      .run(timestamp, leaseExpiresAt, row.id, row.workspace_id) as {
      changes?: number;
    };

    if (Number(updateResult.changes ?? 0) !== 1) {
      throw new Error("Queued generation job could not be claimed atomically.");
    }

    db.exec("commit");
    return getGenerationJob(row.id, row.workspace_id);
  } catch (error) {
    db.exec("rollback");
    throw error;
  }
}

export function renewGenerationJobLease(
  jobId: string,
  workspaceId: string,
  options: GenerationJobLeaseOptions = {},
): SyncJobSummary | null {
  const db = getDatabase();
  const { timestamp, leaseExpiresAt } = getGenerationJobLeaseWindow(options);
  const result = db
    .prepare(
      `
        update sync_jobs
        set last_heartbeat_at = ?,
            lease_expires_at = ?
        where id = ?
          and workspace_id = ?
          and kind in ('sample-generation', 'full-book-generation')
          and status = 'running'
          and (lease_expires_at is null or lease_expires_at > ?)
      `,
    )
    .run(timestamp, leaseExpiresAt, jobId, workspaceId, timestamp) as {
    changes?: number;
  };

  if (Number(result.changes ?? 0) !== 1) {
    return null;
  }

  return getGenerationJob(jobId, workspaceId);
}

export function recordGenerationJobArtifact(input: {
  jobId: string;
  workspaceId?: string | null;
  assetPath: string;
  mimeType: string;
  provider: GenerationOutputProvider;
  chapterIndex?: number | null;
  chapterTitle?: string | null;
  isChapterArtifact?: boolean;
}): GenerationArtifactSummary | null {
  const job = getGenerationJob(input.jobId, input.workspaceId);
  if (!job?.bookId) {
    return null;
  }

  const createdAt = new Date().toISOString();
  const artifactId = `artifact-${randomUUID()}`;
  const output = {
    workspaceId: job.workspaceId,
    bookId: job.bookId,
    kind: job.kind as GenerationJobKind,
    narratorId: job.narratorId,
    engineId: job.engineId,
    mode: job.mode,
    chapterCount: job.chapterCount,
    assetPath: input.assetPath,
    mimeType: input.mimeType,
    provider: input.provider,
    generatedAt: createdAt,
    chapterIndex: input.chapterIndex ?? null,
    chapterTitle: input.chapterTitle ?? null,
    isChapterArtifact: input.isChapterArtifact ?? false,
  } satisfies GenerationOutputSummary;
  const db = getDatabase();

  db.prepare(
    `
      insert into generated_output_history (
        id,
        workspace_id,
        book_id,
        kind,
        job_id,
        output_json,
        created_at
      )
      values (?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    artifactId,
    job.workspaceId,
    job.bookId,
    job.kind,
    job.id,
    JSON.stringify(output),
    createdAt,
  );

  return getGenerationArtifactById(job.workspaceId, artifactId);
}

export interface GenerationJobCompletionOutput {
  assetPath: string;
  mimeType: string;
  provider: GenerationOutputProvider;
  chapterTimings?: GenerationChapterTiming[];
  chapterAssetPaths?: string[];
  chapterArtifacts?: Array<{
    assetPath: string;
    mimeType: string;
    provider: GenerationOutputProvider;
    chapterIndex: number;
    chapterTitle: string;
  }>;
  chapterIndex?: number | null;
  chapterTitle?: string | null;
  isChapterArtifact?: boolean;
}

function normalizeGenerationChapterTimings(
  value: unknown,
): GenerationChapterTiming[] | null {
  if (!Array.isArray(value) || value.length > 300) {
    return null;
  }

  const timings: GenerationChapterTiming[] = [];
  let expectedStartSeconds = 0;
  for (const [position, candidate] of value.entries()) {
    if (!candidate || typeof candidate !== "object") {
      return null;
    }
    const timing = candidate as Partial<GenerationChapterTiming>;
    const chapterTitle = timing.chapterTitle?.trim() ?? "";
    if (
      timing.chapterIndex !== position ||
      !chapterTitle ||
      chapterTitle.length > 200 ||
      !Number.isFinite(timing.startSeconds) ||
      Number(timing.startSeconds) < 0 ||
      Math.abs(Number(timing.startSeconds) - expectedStartSeconds) > 0.001 ||
      !Number.isFinite(timing.durationSeconds) ||
      Number(timing.durationSeconds) <= 0
    ) {
      return null;
    }
    const durationSeconds = Number(timing.durationSeconds);
    timings.push({
      chapterIndex: position,
      chapterTitle,
      startSeconds: expectedStartSeconds,
      durationSeconds,
    });
    expectedStartSeconds += durationSeconds;
    if (!Number.isFinite(expectedStartSeconds)) {
      return null;
    }
  }

  return timings;
}

function readGenerationAssetPaths(outputJson: string) {
  const output = JSON.parse(outputJson) as {
    assetPath?: unknown;
    chapterAssetPaths?: unknown;
  };
  if (typeof output.assetPath !== "string" || !output.assetPath.trim()) {
    throw new Error("Generation output metadata is missing its artifact path.");
  }

  const paths = [output.assetPath];
  if (output.chapterAssetPaths !== undefined) {
    if (
      !Array.isArray(output.chapterAssetPaths) ||
      output.chapterAssetPaths.some(
        (assetPath) => typeof assetPath !== "string" || !assetPath.trim(),
      )
    ) {
      throw new Error("Generation output metadata has invalid chapter artifact paths.");
    }
    paths.push(...(output.chapterAssetPaths as string[]));
  }

  return paths;
}

function collectStoredGenerationAssetPaths(rows: StoredGenerationOutputRow[]) {
  const paths = new Set<string>();
  const failures: GenerationArtifactCleanupFailure[] = [];

  for (const row of rows) {
    try {
      for (const assetPath of readGenerationAssetPaths(row.output_json)) {
        paths.add(assetPath);
      }
    } catch (error) {
      failures.push({
        assetPath: "<invalid generation output metadata>",
        status: "rejected",
        message:
          error instanceof Error
            ? error.message
            : "Generation output metadata could not be read.",
      });
    }
  }

  return { paths, failures };
}

function cleanupGeneratedAudioPaths(paths: Iterable<string>) {
  let deletedFiles = 0;
  let missingFiles = 0;
  const failures: GenerationArtifactCleanupFailure[] = [];

  for (const assetPath of new Set(paths)) {
    const result = deleteGeneratedAudioAssetWithResult(assetPath);
    if (result.status === "deleted") {
      deletedFiles += 1;
    } else if (result.status === "missing") {
      missingFiles += 1;
    } else {
      failures.push({
        assetPath,
        status: result.status,
        message: result.message,
      });
    }
  }

  return { deletedFiles, missingFiles, failures };
}

function getProtectedGenerationAssetPaths(
  db: DatabaseSync,
  workspaceId: string,
  bookId: string,
  kind?: GenerationJobKind,
) {
  const kindClause = kind ? "and kind = ?" : "";
  const rows = db
    .prepare(
      `
        select output_json
        from generated_outputs
        where not (workspace_id = ? and book_id = ? ${kindClause})
        union all
        select output_json
        from generated_output_history
        where not (workspace_id = ? and book_id = ? ${kindClause})
      `,
    )
    .all(
      ...(kind
        ? [workspaceId, bookId, kind, workspaceId, bookId, kind]
        : [workspaceId, bookId, workspaceId, bookId]),
    ) as StoredGenerationOutputRow[];

  return collectStoredGenerationAssetPaths(rows);
}

function cleanupSupersededGenerationRecords(
  db: DatabaseSync,
  job: SyncJobSummary,
  outputAsset: GenerationJobCompletionOutput,
) {
  if (!job.bookId) {
    throw new Error("Generation job cannot retain output without a book.");
  }

  const previousRows = db
    .prepare(
      `
        select output_json
        from generated_outputs
        where workspace_id = ? and book_id = ? and kind = ?
        union all
        select output_json
        from generated_output_history
        where workspace_id = ? and book_id = ? and kind = ?
      `,
    )
    .all(
      job.workspaceId,
      job.bookId,
      job.kind,
      job.workspaceId,
      job.bookId,
      job.kind,
    ) as StoredGenerationOutputRow[];
  const previous = collectStoredGenerationAssetPaths(previousRows);
  const protectedOutputs = getProtectedGenerationAssetPaths(
    db,
    job.workspaceId,
    job.bookId,
    job.kind as GenerationJobKind,
  );
  const metadataFailures = [
    ...previous.failures,
    ...protectedOutputs.failures,
  ];
  if (metadataFailures.length > 0) {
    throw new Error(
      `Generation artifact retention failed: ${metadataFailures
        .map((failure) => failure.message)
        .join("; ")}`,
    );
  }

  const retainedPaths = new Set([
    outputAsset.assetPath,
    ...(outputAsset.chapterAssetPaths ?? []),
    ...(outputAsset.chapterArtifacts ?? []).map(
      (chapterArtifact) => chapterArtifact.assetPath,
    ),
  ]);
  const pathsToDelete = [...previous.paths].filter(
    (assetPath) =>
      !retainedPaths.has(assetPath) && !protectedOutputs.paths.has(assetPath),
  );
  const cleanup = cleanupGeneratedAudioPaths(pathsToDelete);
  if (cleanup.failures.length > 0) {
    throw new Error(
      `Generation artifact retention failed: ${cleanup.failures
        .map((failure) => `${failure.assetPath}: ${failure.message}`)
        .join("; ")}`,
    );
  }

  db.prepare(
    `delete from generated_output_history
     where workspace_id = ? and book_id = ? and kind = ?`,
  ).run(job.workspaceId, job.bookId, job.kind);
  db.prepare(
    `delete from sync_jobs
     where workspace_id = ?
       and json_extract(stats_json, '$.bookId') = ?
       and status in ('completed', 'failed', 'cancelled')
       and completed_at < ?`,
  ).run(
    job.workspaceId,
    job.bookId,
    new Date(Date.now() - generationJobHistoryRetentionMs).toISOString(),
  );
}


export function cleanupGenerationAssetsForBookDeletion(
  database: DatabaseSync,
  workspaceId: string,
  bookId: string,
) {
  const targetRows = database
    .prepare(
      `
        select output_json
        from generated_outputs
        where workspace_id = ? and book_id = ?
        union all
        select output_json
        from generated_output_history
        where workspace_id = ? and book_id = ?
      `,
    )
    .all(workspaceId, bookId, workspaceId, bookId) as StoredGenerationOutputRow[];
  const targetOutputs = collectStoredGenerationAssetPaths(targetRows);
  const protectedOutputs = getProtectedGenerationAssetPaths(
    database,
    workspaceId,
    bookId,
  );
  const metadataFailures = [
    ...targetOutputs.failures,
    ...protectedOutputs.failures,
  ];

  if (metadataFailures.length > 0) {
    return {
      status: "metadata-invalid" as const,
      deletedFiles: 0,
      missingFiles: 0,
      failures: metadataFailures,
    };
  }

  const cleanup = cleanupGeneratedAudioPaths(
    [...targetOutputs.paths].filter(
      (assetPath) => !protectedOutputs.paths.has(assetPath),
    ),
  );
  if (cleanup.failures.length > 0) {
    return {
      status: "file-cleanup-failed" as const,
      ...cleanup,
    };
  }

  return {
    status: "complete" as const,
    ...cleanup,
  };
}

export type GenerationJobCompletionResult =
  | { ok: true; job: SyncJobSummary }
  | {
      ok: false;
      code: "not-found";
      message: string;
      currentStatus: null;
      job: null;
    }
  | {
      ok: false;
      code: "state-conflict";
      message: string;
      currentStatus: string;
      job: SyncJobSummary;
    };

export function completeGenerationJob(
  jobId: string,
  workspaceId: string | null | undefined,
  outputAsset: GenerationJobCompletionOutput,
): GenerationJobCompletionResult {
  const db = getDatabase();
  db.exec("begin immediate");

  try {
    const completedAt = new Date().toISOString();
    const job = getGenerationJob(jobId, workspaceId);
    if (!job) {
      db.exec("rollback");
      return {
        ok: false,
        code: "not-found",
        message: "Generation job was not found.",
        currentStatus: null,
        job: null,
      };
    }

    if (job.status !== "running") {
      db.exec("rollback");
      return {
        ok: false,
        code: "state-conflict",
        message: `Generation job cannot complete from ${job.status} status.`,
        currentStatus: job.status,
        job,
      };
    }

    const lease = db
      .prepare(
        `
          select lease_expires_at
          from sync_jobs
          where id = ?
            and workspace_id = ?
          limit 1
        `,
      )
      .get(job.id, job.workspaceId) as
      | { lease_expires_at: string | null }
      | undefined;
    if (!lease?.lease_expires_at || lease.lease_expires_at <= completedAt) {
      db.exec("rollback");
      return {
        ok: false,
        code: "state-conflict",
        message: "Generation job lease expired before completion.",
        currentStatus: job.status,
        job,
      };
    }

    if (!job.bookId) {
      throw new Error("Generation job cannot complete without a book.");
    }

    const chapterTimings =
      outputAsset.chapterTimings === undefined
        ? []
        : normalizeGenerationChapterTimings(outputAsset.chapterTimings);
    if (!chapterTimings) {
      throw new Error("Generation output has invalid chapter timing metadata.");
    }

    const latestOutput = {
      workspaceId: job.workspaceId,
      bookId: job.bookId,
      kind: job.kind as GenerationJobKind,
      narratorId: job.narratorId,
      engineId: job.engineId,
      mode: job.mode,
      chapterCount: job.chapterCount,
      assetPath: outputAsset.assetPath,
      mimeType: outputAsset.mimeType,
      provider: outputAsset.provider,
      generatedAt: completedAt,
      ...(chapterTimings.length > 0 ? { chapterTimings } : {}),
      chapterAssetPaths: outputAsset.chapterAssetPaths ?? [],
      chapterIndex: outputAsset.chapterIndex ?? null,
      chapterTitle: outputAsset.chapterTitle ?? null,
      isChapterArtifact: outputAsset.isChapterArtifact ?? false,
    } satisfies GenerationOutputSummary;

    cleanupSupersededGenerationRecords(db, job, outputAsset);

    for (const chapterArtifact of outputAsset.chapterArtifacts ?? []) {
      const chapterOutput = {
        workspaceId: job.workspaceId,
        bookId: job.bookId,
        kind: job.kind as GenerationJobKind,
        narratorId: job.narratorId,
        engineId: job.engineId,
        mode: job.mode,
        chapterCount: job.chapterCount,
        assetPath: chapterArtifact.assetPath,
        mimeType: chapterArtifact.mimeType,
        provider: chapterArtifact.provider,
        generatedAt: completedAt,
        chapterIndex: chapterArtifact.chapterIndex,
        chapterTitle: chapterArtifact.chapterTitle,
        isChapterArtifact: true,
      } satisfies GenerationOutputSummary;

      db.prepare(
        `
          insert into generated_output_history (
            id,
            workspace_id,
            book_id,
            kind,
            job_id,
            output_json,
            created_at
          )
          values (?, ?, ?, ?, ?, ?, ?)
        `,
      ).run(
        `artifact-${randomUUID()}`,
        job.workspaceId,
        job.bookId,
        job.kind,
        job.id,
        JSON.stringify(chapterOutput),
        completedAt,
      );
    }

    db.prepare(
      `
        insert into generated_outputs (
          workspace_id,
          book_id,
          kind,
          output_json,
          updated_at
        )
        values (?, ?, ?, ?, ?)
        on conflict(workspace_id, book_id, kind) do update set
          output_json = excluded.output_json,
          updated_at = excluded.updated_at
      `,
    ).run(
      job.workspaceId,
      job.bookId,
      job.kind,
      JSON.stringify(latestOutput),
      completedAt,
    );

    db.prepare(
      `
        insert into generated_output_history (
          id,
          workspace_id,
          book_id,
          kind,
          job_id,
          output_json,
          created_at
        )
        values (?, ?, ?, ?, ?, ?, ?)
      `,
    ).run(
      `artifact-${randomUUID()}`,
      job.workspaceId,
      job.bookId,
      job.kind,
      job.id,
      JSON.stringify(latestOutput),
      completedAt,
    );

    const updateResult = db
      .prepare(
        `
          update sync_jobs
          set status = 'completed',
              completed_at = ?,
              error_message = null,
              lease_expires_at = null
          where id = ?
            and workspace_id = ?
            and status = 'running'
        `,
      )
      .run(completedAt, job.id, job.workspaceId) as { changes?: number };

    if (Number(updateResult.changes ?? 0) !== 1) {
      throw new Error("Generation job state changed during completion.");
    }

    const completedJob = getGenerationJob(job.id, job.workspaceId);
    if (!completedJob || completedJob.status !== "completed") {
      throw new Error("Generation job completion could not be verified.");
    }

    db.exec("commit");
    return { ok: true, job: completedJob };
  } catch (error) {
    db.exec("rollback");
    throw error;
  }
}

export function failGenerationJob(
  jobId: string,
  workspaceId?: string | null,
  errorMessage?: string | null,
): SyncJobSummary | null {
  const job = getGenerationJob(jobId, workspaceId);
  if (!job || (job.status !== "queued" && job.status !== "running")) {
    return job;
  }

  const completedAt = new Date().toISOString();
  const db = getDatabase();
  db.prepare(
    `
      update sync_jobs
      set status = 'failed',
          completed_at = ?,
          error_message = ?,
          lease_expires_at = null
      where id = ?
        and status in ('queued', 'running')
        ${workspaceId ? "and workspace_id = ?" : ""}
    `,
  ).run(
    ...(workspaceId
      ? [completedAt, errorMessage ?? "Unknown worker failure.", jobId, workspaceId]
      : [completedAt, errorMessage ?? "Unknown worker failure.", jobId]),
  );

  return getGenerationJob(jobId, workspaceId);
}

export function retryGenerationJob(
  jobId: string,
  workspaceId?: string | null,
): SyncJobSummary | null {
  const job = getGenerationJob(jobId, workspaceId);
  if (!job || job.status !== "failed" || !job.bookId) {
    return null;
  }

  return enqueueGenerationJob({
    workspaceId: job.workspaceId,
    kind: job.kind as GenerationJobKind,
    bookId: job.bookId,
    narratorId: job.narratorId,
    engineId: job.engineId,
    mode: job.mode,
    chapterCount: job.chapterCount,
  });
}

export function cancelGenerationJob(
  jobId: string,
  workspaceId?: string | null,
): SyncJobSummary | null {
  const job = getGenerationJob(jobId, workspaceId);
  if (!job || (job.status !== "queued" && job.status !== "running")) {
    return null;
  }

  const completedAt = new Date().toISOString();
  const db = getDatabase();
  db.prepare(
    `
      update sync_jobs
      set status = 'cancelled',
          completed_at = ?,
          error_message = 'Cancelled by user.',
          lease_expires_at = null
      where id = ?
        and status in ('queued', 'running')
        ${workspaceId ? "and workspace_id = ?" : ""}
    `,
  ).run(...(workspaceId ? [completedAt, jobId, workspaceId] : [completedAt, jobId]));

  return getGenerationJob(jobId, workspaceId);
}

export function listRecentGenerationJobsForBook(
  workspaceId: string,
  bookId: string,
  limit = 10,
): SyncJobSummary[] {
  const db = getDatabase();
  const rows = db
    .prepare(
      `
        select id, workspace_id, kind, status, stats_json, created_at, completed_at, error_message
             ,
             (
               select synced_books.title
               from synced_books
               where synced_books.workspace_id = sync_jobs.workspace_id
                 and synced_books.book_id = json_extract(sync_jobs.stats_json, '$.bookId')
               limit 1
             ) as book_title,
             (
               select generated_outputs.kind
               from generated_outputs
               where generated_outputs.workspace_id = sync_jobs.workspace_id
                 and generated_outputs.book_id = json_extract(sync_jobs.stats_json, '$.bookId')
                 and json_extract(generated_outputs.output_json, '$.assetPath') != ''
               order by case generated_outputs.kind
                 when 'full-book-generation' then 0
                 when 'sample-generation' then 1
                 else 2
               end asc
               limit 1
             ) as playable_artifact_kind
        from sync_jobs
        where workspace_id = ?
          and kind in ('sample-generation', 'full-book-generation')
          and json_extract(stats_json, '$.bookId') = ?
        order by created_at desc
        limit ?
      `,
    )
    .all(workspaceId, bookId, limit) as SyncJobRow[];

  return mapSyncJobRows(rows);
}

function mapGenerationOutputRows(
  rows: Array<{
    workspace_id: string;
    book_id: string;
    kind: string;
    output_json: string;
  }>,
): GenerationOutputSummary[] {
  return rows.map((row) => {
    const output = JSON.parse(row.output_json) as Partial<GenerationOutputSummary>;
    const provider =
      output.provider === "chatterbox-local" ||
      output.provider === "kokoro-local" ||
      output.provider === "openai"
        ? output.provider
        : "mock";

    const chapterTimings = normalizeGenerationChapterTimings(
      output.chapterTimings,
    );
    return {
      workspaceId: row.workspace_id,
      bookId: row.book_id,
      kind: row.kind as GenerationJobKind,
      narratorId: output.narratorId ?? null,
      engineId:
        getNarrationEngineDefinition(output.engineId)?.id ??
        FAST_NARRATION_ENGINE_ID,
      mode: output.mode ?? null,
      chapterCount: output.chapterCount ?? null,
      assetPath: output.assetPath ?? "",
      mimeType: output.mimeType ?? "audio/wav",
      provider,
      generatedAt: output.generatedAt ?? new Date(0).toISOString(),
      ...(chapterTimings?.length ? { chapterTimings } : {}),
      chapterIndex:
        typeof output.chapterIndex === "number" ? output.chapterIndex : null,
      chapterTitle:
        typeof output.chapterTitle === "string" ? output.chapterTitle : null,
      chapterAssetPaths: Array.isArray(output.chapterAssetPaths)
        ? output.chapterAssetPaths.filter((assetPath) => typeof assetPath === "string")
        : [],
      isChapterArtifact: output.isChapterArtifact === true,
    };
  });
}

function mapGenerationArtifactRows(
  rows: Array<{
    id: string;
    job_id: string;
    workspace_id: string;
    book_id: string;
    kind: string;
    output_json: string;
  }>,
): GenerationArtifactSummary[] {
  return rows.map((row) => {
    const output = JSON.parse(row.output_json) as Partial<GenerationOutputSummary>;
    const provider =
      output.provider === "chatterbox-local" ||
      output.provider === "kokoro-local" ||
      output.provider === "openai"
        ? output.provider
        : "mock";

    const chapterTimings = normalizeGenerationChapterTimings(
      output.chapterTimings,
    );
    return {
      id: row.id,
      jobId: row.job_id,
      workspaceId: row.workspace_id,
      bookId: row.book_id,
      kind: row.kind as GenerationJobKind,
      narratorId: output.narratorId ?? null,
      engineId:
        getNarrationEngineDefinition(output.engineId)?.id ??
        FAST_NARRATION_ENGINE_ID,
      mode: output.mode ?? null,
      chapterCount: output.chapterCount ?? null,
      assetPath: output.assetPath ?? "",
      mimeType: output.mimeType ?? "audio/wav",
      provider,
      generatedAt: output.generatedAt ?? new Date(0).toISOString(),
      ...(chapterTimings?.length ? { chapterTimings } : {}),
      chapterIndex:
        typeof output.chapterIndex === "number" ? output.chapterIndex : null,
      chapterTitle:
        typeof output.chapterTitle === "string" ? output.chapterTitle : null,
      chapterAssetPaths: Array.isArray(output.chapterAssetPaths)
        ? output.chapterAssetPaths.filter((assetPath) => typeof assetPath === "string")
        : [],
      isChapterArtifact: output.isChapterArtifact === true,
    };
  });
}

export function listGenerationOutputsForWorkspace(
  workspaceId: string,
): GenerationOutputSummary[] {
  const db = getDatabase();
  const rows = db
    .prepare(
      `
        select workspace_id, book_id, kind, output_json
        from generated_outputs
        where workspace_id = ?
        order by updated_at desc
      `,
    )
    .all(workspaceId) as Array<{
    workspace_id: string;
    book_id: string;
    kind: string;
    output_json: string;
  }>;

  return mapGenerationOutputRows(rows);
}

export function getGenerationOutputsForBook(
  workspaceId: string,
  bookId: string,
): GenerationOutputSummary[] {
  const db = getDatabase();
  const rows = db
    .prepare(
      `
        select workspace_id, book_id, kind, output_json
        from generated_outputs
        where workspace_id = ?
          and book_id = ?
        order by updated_at desc
      `,
    )
    .all(workspaceId, bookId) as Array<{
    workspace_id: string;
    book_id: string;
    kind: string;
    output_json: string;
  }>;

  return mapGenerationOutputRows(rows);
}

export function listGenerationOutputHistoryForBook(
  workspaceId: string,
  bookId: string,
  limit = 12,
): GenerationArtifactSummary[] {
  const db = getDatabase();
  const rows = db
    .prepare(
      `
        select id, job_id, workspace_id, book_id, kind, output_json
        from generated_output_history
        where workspace_id = ?
          and book_id = ?
        order by created_at desc
        limit ?
      `,
    )
    .all(workspaceId, bookId, limit) as Array<{
    id: string;
    job_id: string;
    workspace_id: string;
    book_id: string;
    kind: string;
    output_json: string;
  }>;

  return mapGenerationArtifactRows(rows);
}

export function getGenerationArtifactById(
  workspaceId: string,
  artifactId: string,
): GenerationArtifactSummary | null {
  const db = getDatabase();
  const row = db
    .prepare(
      `
        select id, job_id, workspace_id, book_id, kind, output_json
        from generated_output_history
        where workspace_id = ?
          and id = ?
        limit 1
      `,
    )
    .get(workspaceId, artifactId) as
    | {
        id: string;
        job_id: string;
        workspace_id: string;
        book_id: string;
        kind: string;
        output_json: string;
      }
    | undefined;

  if (!row) {
    return null;
  }

  return mapGenerationArtifactRows([row])[0] ?? null;
}

export function getGenerationArtifactForJob(
  jobId: string,
  workspaceId?: string | null,
): GenerationArtifactSummary | null {
  const db = getDatabase();
  const row = db
    .prepare(
      `
        select id, job_id, workspace_id, book_id, kind, output_json
        from generated_output_history
        where job_id = ?
        ${workspaceId ? "and workspace_id = ?" : ""}
        order by case json_extract(output_json, '$.isChapterArtifact')
          when 1 then 1
          else 0
        end asc,
        created_at desc
        limit 1
      `,
    )
    .get(...(workspaceId ? [jobId, workspaceId] : [jobId])) as
    | {
        id: string;
        job_id: string;
        workspace_id: string;
        book_id: string;
        kind: string;
        output_json: string;
      }
    | undefined;

  if (!row) {
    return null;
  }

  return mapGenerationArtifactRows([row])[0] ?? null;
}

export function getGenerationOutputForBookKind(
  workspaceId: string,
  bookId: string,
  kind: GenerationJobKind,
): GenerationOutputSummary | null {
  return (
    getGenerationOutputsForBook(workspaceId, bookId).find(
      (output) => output.kind === kind,
    ) ?? null
  );
}
