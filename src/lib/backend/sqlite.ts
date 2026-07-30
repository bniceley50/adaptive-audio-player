import { getDatabase, resetDatabaseForTests } from "./database.ts";
import type {
  GenerationJobKind,
  SyncJobSummary,
  WorkerHeartbeatSummary,
} from "./types.ts";
import {
  FAST_NARRATION_ENGINE_ID,
  getNarrationEngineDefinition,
} from "../narration/engines.ts";

export { getDatabase, resetDatabaseForTests };
export {
  createWorkspaceBook,
  deleteWorkspaceBook,
  getSyncedBookDisplayMeta,
  getSyncedBookDraftText,
  getSyncedBookTitle,
  getWorkspaceBook,
  getWorkspaceBookProgress,
  listWorkspaceBooks,
  saveWorkspaceBookProgress,
} from "./book-repository.ts";
export type {
  CreateWorkspaceBookResult,
  DeleteWorkspaceBookResult,
  SaveWorkspaceBookProgressResult,
  WorkspaceBookDetail,
  WorkspaceBookProgress,
  WorkspaceBookSummary,
} from "./book-repository.ts";
export {
  cancelGenerationJob,
  claimNextGenerationJob,
  completeGenerationJob,
  enqueueGenerationJob,
  failGenerationJob,
  getActiveGenerationJobForBookKind,
  getGenerationArtifactById,
  getGenerationArtifactForJob,
  getGenerationJob,
  getGenerationOutputForBookKind,
  getGenerationOutputsForBook,
  listGenerationOutputHistoryForBook,
  listGenerationOutputsForWorkspace,
  listRecentGenerationJobsForBook,
  recordGenerationJobArtifact,
  renewGenerationJobLease,
  retryGenerationJob,
  updateGenerationJobProgress,
} from "./generation-repository.ts";
export type {
  GenerationArtifactCleanupFailure,
  GenerationJobCompletionOutput,
  GenerationJobCompletionResult,
} from "./generation-repository.ts";

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

export function recordWorkerHeartbeat(input: {
  workerName: string;
  status: "idle" | "processing" | "stopped";
  lastJobId?: string | null;
  lastJobKind?: GenerationJobKind | null;
  lastJobStatus?: "running" | "completed" | "failed" | null;
  now?: string;
}) {
  const db = getDatabase();
  const timestamp = input.now ?? new Date().toISOString();

  db.prepare(
    `
      insert into worker_heartbeats (
        worker_name,
        status,
        started_at,
        last_heartbeat_at,
        last_job_id,
        last_job_kind,
        last_job_status
      )
      values (?, ?, ?, ?, ?, ?, ?)
      on conflict(worker_name) do update set
        status = excluded.status,
        last_heartbeat_at = excluded.last_heartbeat_at,
        last_job_id = excluded.last_job_id,
        last_job_kind = excluded.last_job_kind,
        last_job_status = excluded.last_job_status
    `,
  ).run(
    input.workerName,
    input.status,
    timestamp,
    timestamp,
    input.lastJobId ?? null,
    input.lastJobKind ?? null,
    input.lastJobStatus ?? null,
  );
}

export function getWorkerHeartbeat(
  workerName = "generation-worker",
): WorkerHeartbeatSummary | null {
  const db = getDatabase();
  const row = db
    .prepare(
      `
        select
          worker_name,
          status,
          started_at,
          last_heartbeat_at,
          last_job_id,
          last_job_kind,
          last_job_status
        from worker_heartbeats
        where worker_name = ?
      `,
    )
    .get(workerName) as
    | {
        worker_name: string;
        status: "idle" | "processing" | "stopped";
        started_at: string;
        last_heartbeat_at: string;
        last_job_id: string | null;
        last_job_kind: GenerationJobKind | null;
        last_job_status: "running" | "completed" | "failed" | null;
      }
    | undefined;

  if (!row) {
    return null;
  }

  return {
    workerName: row.worker_name,
    status: row.status,
    startedAt: row.started_at,
    lastHeartbeatAt: row.last_heartbeat_at,
    lastJobId: row.last_job_id,
    lastJobKind: row.last_job_kind,
    lastJobStatus: row.last_job_status,
  };
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

export function listRecentSyncJobsForWorkspace(
  workspaceId: string,
  limit = 5,
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
        order by created_at desc
        limit ?
      `,
    )
    .all(workspaceId, limit) as SyncJobRow[];

  return mapSyncJobRows(rows);
}
