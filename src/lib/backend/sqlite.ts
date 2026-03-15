import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { getDatabasePath } from "./env.ts";
import type {
  BackendAccountSession,
  BackendUser,
  EndedAccountSessionSummary,
  GenerationArtifactSummary,
  GenerationOutputSummary,
  GenerationJobKind,
  LibrarySyncSnapshot,
  SyncedBookDisplayMeta,
  SyncJobSummary,
  UserAccountSessionSummary,
  UserWorkspaceSummary,
  WorkspaceSyncSummary,
  WorkerHeartbeatSummary,
} from "./types.ts";

declare global {
  var __adaptiveAudioPlayerDb: DatabaseSync | undefined;
}

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

function buildPlayerResumePath(
  bookId: string | null,
  artifactKind: GenerationJobKind | null,
) {
  if (!bookId) {
    return null;
  }

  if (artifactKind === "full-book-generation") {
    return `/player/${bookId}?artifact=full`;
  }

  if (artifactKind === "sample-generation") {
    return `/player/${bookId}?artifact=sample`;
  }

  return `/player/${bookId}`;
}

function ensureDbSchema(db: DatabaseSync) {
  db.exec(`
    pragma journal_mode = wal;
    pragma busy_timeout = 3000;
    pragma foreign_keys = on;

    create table if not exists users (
      id text primary key,
      email text not null unique,
      display_name text not null,
      session_version integer not null default 1,
      created_at text not null,
      updated_at text not null
    );

    create table if not exists workspaces (
      id text primary key,
      user_id text,
      created_at text not null,
      updated_at text not null,
      last_synced_at text,
      foreign key (user_id) references users(id) on delete set null
    );

    create table if not exists account_sessions (
      id text primary key,
      user_id text not null,
      session_label text,
      last_activity_path text,
      last_activity_label text,
      expires_at text not null,
      last_used_at text not null,
      revoked_at text,
      ended_reason text,
      created_at text not null,
      foreign key (user_id) references users(id) on delete cascade
    );

    create table if not exists synced_books (
      workspace_id text not null,
      book_id text not null,
      title text not null,
      chapter_count integer not null,
      updated_at text not null,
      draft_text text not null,
      cover_theme text,
      cover_label text,
      cover_glyph text,
      genre_label text,
      primary key (workspace_id, book_id),
      foreign key (workspace_id) references workspaces(id) on delete cascade
    );

    create table if not exists synced_profiles (
      workspace_id text not null,
      book_id text not null,
      narrator_id text not null,
      narrator_name text not null,
      mode text not null,
      primary key (workspace_id, book_id),
      foreign key (workspace_id) references workspaces(id) on delete cascade
    );

    create table if not exists synced_playback_states (
      workspace_id text not null,
      book_id text not null,
      state_json text not null,
      updated_at text not null,
      primary key (workspace_id, book_id),
      foreign key (workspace_id) references workspaces(id) on delete cascade
    );

    create table if not exists workspace_defaults (
      workspace_id text primary key,
      default_profile_json text,
      playback_defaults_json text,
      sample_request_json text,
      removed_books_json text,
      discovery_preferences_json text,
      updated_at text not null,
      foreign key (workspace_id) references workspaces(id) on delete cascade
    );

    create table if not exists generated_outputs (
      workspace_id text not null,
      book_id text not null,
      kind text not null,
      output_json text not null,
      updated_at text not null,
      primary key (workspace_id, book_id, kind),
      foreign key (workspace_id) references workspaces(id) on delete cascade
    );

    create table if not exists generated_output_history (
      id text primary key,
      workspace_id text not null,
      book_id text not null,
      kind text not null,
      job_id text not null,
      output_json text not null,
      created_at text not null,
      foreign key (workspace_id) references workspaces(id) on delete cascade,
      foreign key (job_id) references sync_jobs(id) on delete cascade
    );

    create table if not exists sync_jobs (
      id text primary key,
      workspace_id text not null,
      kind text not null,
      status text not null,
      stats_json text,
      error_message text,
      created_at text not null,
      completed_at text,
      foreign key (workspace_id) references workspaces(id) on delete cascade
    );

    create table if not exists worker_heartbeats (
      worker_name text primary key,
      status text not null,
      started_at text not null,
      last_heartbeat_at text not null,
      last_job_id text,
      last_job_kind text,
      last_job_status text
    );
  `);

  const workspaceColumns = db
    .prepare("pragma table_info(workspaces)")
    .all() as Array<{ name: string }>;
  const hasUserId = workspaceColumns.some((column) => column.name === "user_id");

  if (!hasUserId) {
    db.exec("alter table workspaces add column user_id text references users(id) on delete set null");
  }

  const userColumns = db
    .prepare("pragma table_info(users)")
    .all() as Array<{ name: string }>;
  const hasSessionVersion = userColumns.some(
    (column) => column.name === "session_version",
  );

  if (!hasSessionVersion) {
    db.exec("alter table users add column session_version integer not null default 1");
  }

  const syncJobColumns = db
    .prepare("pragma table_info(sync_jobs)")
    .all() as Array<{ name: string }>;
  const hasErrorMessage = syncJobColumns.some(
    (column) => column.name === "error_message",
  );

  if (!hasErrorMessage) {
    db.exec("alter table sync_jobs add column error_message text");
  }

  const accountSessionColumns = db
    .prepare("pragma table_info(account_sessions)")
    .all() as Array<{ name: string }>;
  const hasSessionLabel = accountSessionColumns.some(
    (column) => column.name === "session_label",
  );

  if (!hasSessionLabel) {
    db.exec("alter table account_sessions add column session_label text");
  }

  const hasEndedReason = accountSessionColumns.some(
    (column) => column.name === "ended_reason",
  );

  if (!hasEndedReason) {
    db.exec("alter table account_sessions add column ended_reason text");
  }

  const hasLastActivityPath = accountSessionColumns.some(
    (column) => column.name === "last_activity_path",
  );

  if (!hasLastActivityPath) {
    db.exec("alter table account_sessions add column last_activity_path text");
  }

  const hasLastActivityLabel = accountSessionColumns.some(
    (column) => column.name === "last_activity_label",
  );

  if (!hasLastActivityLabel) {
    db.exec("alter table account_sessions add column last_activity_label text");
  }

  const syncedBookColumns = db
    .prepare("pragma table_info(synced_books)")
    .all() as Array<{ name: string }>;
  const hasCoverTheme = syncedBookColumns.some(
    (column) => column.name === "cover_theme",
  );

  if (!hasCoverTheme) {
    db.exec("alter table synced_books add column cover_theme text");
  }

  const hasCoverLabel = syncedBookColumns.some(
    (column) => column.name === "cover_label",
  );

  if (!hasCoverLabel) {
    db.exec("alter table synced_books add column cover_label text");
  }

  const hasCoverGlyph = syncedBookColumns.some(
    (column) => column.name === "cover_glyph",
  );

  if (!hasCoverGlyph) {
    db.exec("alter table synced_books add column cover_glyph text");
  }

  const hasGenreLabel = syncedBookColumns.some(
    (column) => column.name === "genre_label",
  );

  if (!hasGenreLabel) {
    db.exec("alter table synced_books add column genre_label text");
  }

  const workspaceDefaultsColumns = db
    .prepare("pragma table_info(workspace_defaults)")
    .all() as Array<{ name: string }>;
  const hasRemovedBooksJson = workspaceDefaultsColumns.some(
    (column) => column.name === "removed_books_json",
  );

  if (!hasRemovedBooksJson) {
    db.exec("alter table workspace_defaults add column removed_books_json text");
  }

  const hasDiscoveryPreferencesJson = workspaceDefaultsColumns.some(
    (column) => column.name === "discovery_preferences_json",
  );

  if (!hasDiscoveryPreferencesJson) {
    db.exec(
      "alter table workspace_defaults add column discovery_preferences_json text",
    );
  }
}

function sleepSync(milliseconds: number) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function isSqliteLockedError(error: unknown) {
  return (
    error instanceof Error &&
    /database is locked|SQLITE_BUSY/i.test(error.message)
  );
}

function ensureDbSchemaWithRetry(db: DatabaseSync) {
  const maxAttempts = 4;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      ensureDbSchema(db);
      return;
    } catch (error) {
      if (!isSqliteLockedError(error) || attempt === maxAttempts) {
        throw error;
      }

      sleepSync(50 * attempt);
    }
  }
}

export function resetDatabaseForTests() {
  globalThis.__adaptiveAudioPlayerDb = undefined;
}

export function getDatabase() {
  if (globalThis.__adaptiveAudioPlayerDb) {
    return globalThis.__adaptiveAudioPlayerDb;
  }

  const dbPath = getDatabasePath();
  const dbDir = path.dirname(dbPath);
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  const db = new DatabaseSync(dbPath);
  ensureDbSchemaWithRetry(db);
  globalThis.__adaptiveAudioPlayerDb = db;
  return db;
}

function ensureWorkspace(db: DatabaseSync, workspaceId: string, timestamp: string) {
  db.prepare(
    `
      insert into workspaces (id, user_id, created_at, updated_at, last_synced_at)
      values (?, null, ?, ?, null)
      on conflict(id) do update set updated_at = excluded.updated_at
    `,
  ).run(workspaceId, timestamp, timestamp);
}

export function upsertUserByEmail(input: {
  email: string;
  displayName: string;
}): BackendUser {
  const db = getDatabase();
  const timestamp = new Date().toISOString();
  const normalizedEmail = input.email.trim().toLowerCase();
  const normalizedDisplayName = input.displayName.trim() || normalizedEmail.split("@")[0] || "Listener";
  const existingUser = db
    .prepare(
      `
        select id, email, display_name, created_at, updated_at
        , session_version
        from users
        where email = ?
      `,
    )
    .get(normalizedEmail) as
    | {
        id: string;
        email: string;
        display_name: string;
        created_at: string;
        updated_at: string;
        session_version: number;
      }
    | undefined;

  if (existingUser) {
    db.prepare(
      `
        update users
        set display_name = ?, updated_at = ?
        where id = ?
      `,
    ).run(normalizedDisplayName, timestamp, existingUser.id);

    return {
      id: existingUser.id,
      email: existingUser.email,
      displayName: normalizedDisplayName,
      sessionVersion: existingUser.session_version,
      createdAt: existingUser.created_at,
      updatedAt: timestamp,
    };
  }

  const nextUser: BackendUser = {
    id: `user-${randomUUID()}`,
    email: normalizedEmail,
    displayName: normalizedDisplayName,
    sessionVersion: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  db.prepare(
    `
      insert into users (id, email, display_name, session_version, created_at, updated_at)
      values (?, ?, ?, ?, ?, ?)
    `,
  ).run(
    nextUser.id,
    nextUser.email,
    nextUser.displayName,
    nextUser.sessionVersion,
    nextUser.createdAt,
    nextUser.updatedAt,
  );

  return nextUser;
}

export function getUserById(userId: string): BackendUser | null {
  const db = getDatabase();
  const user = db
    .prepare(
      `
        select id, email, display_name, created_at, updated_at
        , session_version
        from users
        where id = ?
      `,
    )
    .get(userId) as
    | {
        id: string;
        email: string;
        display_name: string;
        created_at: string;
        updated_at: string;
        session_version: number;
      }
    | undefined;

  if (!user) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    sessionVersion: user.session_version,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  };
}

export function rotateUserSessionVersion(userId: string): BackendUser | null {
  const db = getDatabase();
  const timestamp = new Date().toISOString();
  const currentUser = getUserById(userId);

  if (!currentUser) {
    return null;
  }

  const nextSessionVersion = currentUser.sessionVersion + 1;
  db.prepare(
    `
      update users
      set session_version = ?, updated_at = ?
      where id = ?
    `,
  ).run(nextSessionVersion, timestamp, userId);

  return {
    ...currentUser,
    sessionVersion: nextSessionVersion,
    updatedAt: timestamp,
  };
}

function pruneInactiveAccountSessions(
  db: DatabaseSync,
  timestamp: string,
) {
  const cutoff = new Date(
    new Date(timestamp).getTime() -
      accountSessionHistoryRetentionDays * 24 * 60 * 60 * 1000,
  ).toISOString();
  db.prepare(
    `
      delete from account_sessions
      where (revoked_at is not null and revoked_at <= ?)
         or (revoked_at is null and expires_at <= ?)
    `,
  ).run(cutoff, cutoff);
}

export function createAccountSession(
  userId: string,
  expiresAt: string,
  sessionLabel?: string | null,
): BackendAccountSession | null {
  const db = getDatabase();
  const user = getUserById(userId);
  if (!user) {
    return null;
  }

  const timestamp = new Date().toISOString();
  pruneInactiveAccountSessions(db, timestamp);
  const session: BackendAccountSession = {
    id: `session-${randomUUID()}`,
    userId,
    label: sessionLabel?.trim() || null,
    lastActivityPath: null,
    lastActivityLabel: null,
    expiresAt,
    lastUsedAt: timestamp,
    revokedAt: null,
    endedReason: null,
    createdAt: timestamp,
  };

  db.prepare(
    `
      insert into account_sessions (
        id,
        user_id,
        session_label,
        last_activity_path,
        last_activity_label,
        expires_at,
        last_used_at,
        revoked_at,
        ended_reason,
        created_at
      )
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    session.id,
    session.userId,
    session.label,
    session.lastActivityPath,
    session.lastActivityLabel,
    session.expiresAt,
    session.lastUsedAt,
    session.revokedAt,
    session.endedReason,
    session.createdAt,
  );

  return session;
}

export function getAccountSessionById(sessionId: string): BackendAccountSession | null {
  const db = getDatabase();
  const session = db
    .prepare(
      `
        select id, user_id, session_label, last_activity_path, last_activity_label, expires_at, last_used_at, revoked_at, ended_reason, created_at
        from account_sessions
        where id = ?
      `,
    )
    .get(sessionId) as
    | {
        id: string;
        user_id: string;
        session_label: string | null;
        last_activity_path: string | null;
        last_activity_label: string | null;
        expires_at: string;
        last_used_at: string;
        revoked_at: string | null;
        ended_reason: string | null;
        created_at: string;
      }
    | undefined;

  if (!session) {
    return null;
  }

  return {
    id: session.id,
    userId: session.user_id,
    label: session.session_label,
    lastActivityPath: session.last_activity_path,
    lastActivityLabel: session.last_activity_label,
    expiresAt: session.expires_at,
    lastUsedAt: session.last_used_at,
    revokedAt: session.revoked_at,
    endedReason: session.ended_reason,
    createdAt: session.created_at,
  };
}

export function touchAccountSession(
  sessionId: string,
  activity?: { path?: string | null; label?: string | null },
): BackendAccountSession | null {
  const db = getDatabase();
  const session = getAccountSessionById(sessionId);
  if (!session || session.revokedAt) {
    return session;
  }

  const timestamp = new Date().toISOString();
  db.prepare(
    `
      update account_sessions
      set last_used_at = ?,
          last_activity_path = ?,
          last_activity_label = ?
      where id = ?
    `,
  ).run(
    timestamp,
    activity?.path?.trim() || session.lastActivityPath,
    activity?.label?.trim() || session.lastActivityLabel,
    sessionId,
  );

  return {
    ...session,
    lastUsedAt: timestamp,
    lastActivityPath: activity?.path?.trim() || session.lastActivityPath,
    lastActivityLabel: activity?.label?.trim() || session.lastActivityLabel,
  };
}

export function revokeAccountSession(
  sessionId: string,
  endedReason = "revoked",
): BackendAccountSession | null {
  const db = getDatabase();
  const session = getAccountSessionById(sessionId);
  if (!session) {
    return null;
  }

  const timestamp = new Date().toISOString();
  db.prepare(
    `
      update account_sessions
      set revoked_at = ?, ended_reason = ?
      where id = ?
    `,
  ).run(timestamp, endedReason, sessionId);

  return {
    ...session,
    revokedAt: timestamp,
    endedReason,
  };
}

export function revokeOtherAccountSessions(
  userId: string,
  currentSessionId: string,
) {
  const db = getDatabase();
  const timestamp = new Date().toISOString();
  const result = db.prepare(
    `
      update account_sessions
      set revoked_at = ?, ended_reason = 'signed-out-elsewhere'
      where user_id = ?
        and id != ?
        and revoked_at is null
        and expires_at > ?
    `,
  ).run(timestamp, userId, currentSessionId, timestamp) as { changes?: number };

  return Number(result.changes ?? 0);
}

export function listAccountSessionsForUser(
  userId: string,
  currentSessionId?: string | null,
  limit = 5,
): UserAccountSessionSummary[] {
  const db = getDatabase();
  const timestamp = new Date().toISOString();
  pruneInactiveAccountSessions(db, timestamp);
  const rows = db
    .prepare(
      `
        select id, session_label, last_activity_path, last_activity_label, expires_at, last_used_at, created_at
        from account_sessions
        where user_id = ?
          and revoked_at is null
          and expires_at > ?
        order by last_used_at desc, created_at desc
        limit ?
      `,
    )
    .all(userId, timestamp, limit) as Array<{
      id: string;
      session_label: string | null;
      last_activity_path: string | null;
      last_activity_label: string | null;
      expires_at: string;
      last_used_at: string;
      created_at: string;
    }>;

  return rows.map((row) => ({
    id: row.id,
    label: row.session_label,
    lastActivityPath: row.last_activity_path,
    lastActivityLabel: row.last_activity_label,
    expiresAt: row.expires_at,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
    isCurrent: row.id === currentSessionId,
  }));
}

export function listEndedAccountSessionsForUser(
  userId: string,
  limit = 3,
): EndedAccountSessionSummary[] {
  const db = getDatabase();
  const timestamp = new Date().toISOString();
  pruneInactiveAccountSessions(db, timestamp);
  const rows = db
    .prepare(
      `
        select
          id,
          session_label,
          last_activity_path,
          last_activity_label,
          coalesce(revoked_at, expires_at) as ended_at,
          coalesce(ended_reason, case when expires_at <= ? then 'expired' end) as ended_reason
        from account_sessions
        where user_id = ?
          and (
            revoked_at is not null
            or expires_at <= ?
          )
        order by coalesce(revoked_at, expires_at) desc
        limit ?
      `,
    )
    .all(timestamp, userId, timestamp, limit) as Array<{
      id: string;
      session_label: string | null;
      last_activity_path: string | null;
      last_activity_label: string | null;
      ended_at: string;
      ended_reason: string | null;
    }>;

  return rows
    .filter((row) => row.ended_reason)
    .map((row) => ({
      id: row.id,
      label: row.session_label,
      lastActivityPath: row.last_activity_path,
      lastActivityLabel: row.last_activity_label,
      endedAt: row.ended_at,
      endedReason: row.ended_reason ?? "revoked",
    }));
}

export function getSyncedBookTitle(workspaceId: string, bookId: string) {
  const db = getDatabase();
  const row = db
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

export function getSyncedBookDisplayMeta(
  workspaceId: string,
  bookId: string,
): SyncedBookDisplayMeta | null {
  const db = getDatabase();
  const row = db
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

export function linkWorkspaceToUser(workspaceId: string, userId: string) {
  const db = getDatabase();
  ensureWorkspace(db, workspaceId, new Date().toISOString());
  db.prepare(
    `
      update workspaces
      set user_id = ?, updated_at = ?
      where id = ?
    `,
  ).run(userId, new Date().toISOString(), workspaceId);
}

export function getWorkspaceUser(workspaceId: string): BackendUser | null {
  const db = getDatabase();
  const user = db
    .prepare(
      `
        select users.id, users.email, users.display_name, users.session_version, users.created_at, users.updated_at
        from workspaces
        join users on users.id = workspaces.user_id
        where workspaces.id = ?
      `,
    )
    .get(workspaceId) as
    | {
        id: string;
        email: string;
        display_name: string;
        session_version: number;
        created_at: string;
        updated_at: string;
      }
    | undefined;

  if (!user) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    sessionVersion: user.session_version,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  };
}

export function listWorkspacesForUser(
  userId: string,
  currentWorkspaceId?: string | null,
): UserWorkspaceSummary[] {
  const db = getDatabase();
  const rows = db
    .prepare(
      `
        select
          workspaces.id,
          workspaces.last_synced_at,
          workspaces.updated_at,
          (
            select count(*)
            from synced_books
            where synced_books.workspace_id = workspaces.id
          ) as synced_book_count,
          (
            select synced_books.book_id
            from synced_books
            where synced_books.workspace_id = workspaces.id
            order by synced_books.updated_at desc
            limit 1
          ) as latest_book_id,
          (
            select synced_books.title
            from synced_books
            where synced_books.workspace_id = workspaces.id
            order by synced_books.updated_at desc
            limit 1
          ) as latest_book_title,
          (
            select synced_books.cover_theme
            from synced_books
            where synced_books.workspace_id = workspaces.id
            order by synced_books.updated_at desc
            limit 1
          ) as latest_book_cover_theme,
          (
            select synced_books.cover_label
            from synced_books
            where synced_books.workspace_id = workspaces.id
            order by synced_books.updated_at desc
            limit 1
          ) as latest_book_cover_label,
          (
            select synced_books.cover_glyph
            from synced_books
            where synced_books.workspace_id = workspaces.id
            order by synced_books.updated_at desc
            limit 1
          ) as latest_book_cover_glyph,
          (
            select synced_books.genre_label
            from synced_books
            where synced_books.workspace_id = workspaces.id
            order by synced_books.updated_at desc
            limit 1
          ) as latest_book_genre_label,
          (
            select generated_outputs.kind
            from generated_outputs
            where generated_outputs.workspace_id = workspaces.id
              and generated_outputs.book_id = (
                select synced_books.book_id
                from synced_books
                where synced_books.workspace_id = workspaces.id
                order by synced_books.updated_at desc
                limit 1
              )
              and json_extract(generated_outputs.output_json, '$.assetPath') != ''
            order by case generated_outputs.kind
              when 'full-book-generation' then 0
              when 'sample-generation' then 1
              else 2
            end asc
            limit 1
          ) as latest_playable_artifact_kind,
          (
            select synced_playback_states.book_id
            from synced_playback_states
            where synced_playback_states.workspace_id = workspaces.id
            order by synced_playback_states.updated_at desc
            limit 1
          ) as latest_session_book_id,
          (
            select synced_books.title
            from synced_books
            where synced_books.workspace_id = workspaces.id
              and synced_books.book_id = (
                select synced_playback_states.book_id
                from synced_playback_states
                where synced_playback_states.workspace_id = workspaces.id
                order by synced_playback_states.updated_at desc
                limit 1
              )
            limit 1
          ) as latest_session_book_title,
          (
            select cast(json_extract(synced_playback_states.state_json, '$.currentChapterIndex') as integer)
            from synced_playback_states
            where synced_playback_states.workspace_id = workspaces.id
            order by synced_playback_states.updated_at desc
            limit 1
          ) as latest_session_chapter_index,
          (
            select cast(json_extract(synced_playback_states.state_json, '$.progressSeconds') as integer)
            from synced_playback_states
            where synced_playback_states.workspace_id = workspaces.id
            order by synced_playback_states.updated_at desc
            limit 1
          ) as latest_session_progress_seconds,
          (
            select json_extract(synced_playback_states.state_json, '$.playbackArtifactKind')
            from synced_playback_states
            where synced_playback_states.workspace_id = workspaces.id
            order by synced_playback_states.updated_at desc
            limit 1
          ) as latest_session_artifact_kind,
          (
            select synced_playback_states.updated_at
            from synced_playback_states
            where synced_playback_states.workspace_id = workspaces.id
            order by synced_playback_states.updated_at desc
            limit 1
          ) as latest_session_updated_at
        from workspaces
        where workspaces.user_id = ?
        order by coalesce(workspaces.last_synced_at, workspaces.updated_at) desc
      `,
    )
    .all(userId) as Array<{
    id: string;
    last_synced_at: string | null;
    updated_at: string;
    synced_book_count: number;
    latest_book_id: string | null;
    latest_book_title: string | null;
    latest_book_cover_theme: string | null;
    latest_book_cover_label: string | null;
    latest_book_cover_glyph: string | null;
    latest_book_genre_label: string | null;
    latest_playable_artifact_kind: GenerationJobKind | null;
    latest_session_book_id: string | null;
    latest_session_book_title: string | null;
    latest_session_chapter_index: number | null;
    latest_session_progress_seconds: number | null;
    latest_session_artifact_kind: GenerationJobKind | null;
    latest_session_updated_at: string | null;
  }>;

  return rows.map((row) => {
    const latestResumePath =
      row.latest_session_book_id
        ? buildPlayerResumePath(
            row.latest_session_book_id,
            row.latest_session_artifact_kind,
          )
        : row.latest_book_id && row.latest_playable_artifact_kind
          ? buildPlayerResumePath(
              row.latest_book_id,
              row.latest_playable_artifact_kind,
            )
          : row.latest_book_id
            ? `/books/${row.latest_book_id}`
            : null;

    return {
      workspaceId: row.id,
      syncedBookCount: Number(row.synced_book_count),
      lastSyncedAt: row.last_synced_at,
      latestBookId: row.latest_book_id,
      latestBookTitle: row.latest_book_title,
      latestBookCoverTheme: row.latest_book_cover_theme,
      latestBookCoverLabel: row.latest_book_cover_label,
      latestBookCoverGlyph: row.latest_book_cover_glyph,
      latestBookGenreLabel: row.latest_book_genre_label,
      latestPlayableArtifactKind: row.latest_playable_artifact_kind ?? null,
      latestSessionBookId: row.latest_session_book_id,
      latestSessionBookTitle: row.latest_session_book_title,
      latestSessionChapterIndex:
        row.latest_session_chapter_index === null
          ? null
          : Number(row.latest_session_chapter_index),
      latestSessionProgressSeconds:
        row.latest_session_progress_seconds === null
          ? null
          : Number(row.latest_session_progress_seconds),
      latestSessionArtifactKind:
        row.latest_session_artifact_kind === "full-book-generation" ||
        row.latest_session_artifact_kind === "sample-generation"
          ? row.latest_session_artifact_kind
          : null,
      latestSessionUpdatedAt: row.latest_session_updated_at,
      latestResumePath,
      isCurrent: row.id === currentWorkspaceId,
    };
  });
}

function deleteMissingRows(
  db: DatabaseSync,
  tableName: "synced_books" | "synced_profiles" | "synced_playback_states",
  workspaceId: string,
  nextIds: string[],
) {
  if (nextIds.length === 0) {
    db.prepare(`delete from ${tableName} where workspace_id = ?`).run(workspaceId);
    return;
  }

  const placeholders = nextIds.map(() => "?").join(", ");
  db.prepare(
    `delete from ${tableName}
     where workspace_id = ?
       and book_id not in (${placeholders})`,
  ).run(workspaceId, ...nextIds);
}

export function syncWorkspaceLibrarySnapshot(
  workspaceId: string,
  snapshot: LibrarySyncSnapshot,
): WorkspaceSyncSummary {
  const db = getDatabase();
  const timestamp = new Date().toISOString();
  const syncJobId = `sync-${randomUUID()}`;

  ensureWorkspace(db, workspaceId, timestamp);
  db.prepare(
    `
      insert into sync_jobs (id, workspace_id, kind, status, stats_json, created_at, completed_at)
      values (?, ?, 'library-sync', 'running', null, ?, null)
    `,
  ).run(syncJobId, workspaceId, timestamp);

  db.exec("begin");

  try {
    const draftTextMap = new Map(
      snapshot.draftTexts.map((draft) => [draft.bookId, draft.text]),
    );

    deleteMissingRows(
      db,
      "synced_books",
      workspaceId,
      snapshot.libraryBooks.map((book) => book.bookId),
    );

    for (const book of snapshot.libraryBooks) {
      db.prepare(
        `
          insert into synced_books (
            workspace_id,
            book_id,
            title,
            chapter_count,
            updated_at,
            draft_text,
            cover_theme,
            cover_label,
            cover_glyph,
            genre_label
          )
          values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          on conflict(workspace_id, book_id) do update set
            title = excluded.title,
            chapter_count = excluded.chapter_count,
            updated_at = excluded.updated_at,
            draft_text = excluded.draft_text,
            cover_theme = excluded.cover_theme,
            cover_label = excluded.cover_label,
            cover_glyph = excluded.cover_glyph,
            genre_label = excluded.genre_label
        `,
      ).run(
        workspaceId,
        book.bookId,
        book.title,
        book.chapterCount,
        book.updatedAt,
        draftTextMap.get(book.bookId) ?? "",
        book.coverTheme ?? null,
        book.coverLabel ?? null,
        book.coverGlyph ?? null,
        book.genreLabel ?? null,
      );
    }

    deleteMissingRows(
      db,
      "synced_profiles",
      workspaceId,
      snapshot.listeningProfiles.map((profile) => profile.bookId),
    );

    for (const profile of snapshot.listeningProfiles) {
      db.prepare(
        `
          insert into synced_profiles (
            workspace_id,
            book_id,
            narrator_id,
            narrator_name,
            mode
          )
          values (?, ?, ?, ?, ?)
          on conflict(workspace_id, book_id) do update set
            narrator_id = excluded.narrator_id,
            narrator_name = excluded.narrator_name,
            mode = excluded.mode
        `,
      ).run(
        workspaceId,
        profile.bookId,
        profile.narratorId,
        profile.narratorName,
        profile.mode,
      );
    }

    deleteMissingRows(
      db,
      "synced_playback_states",
      workspaceId,
      snapshot.playbackStates.map((entry) => entry.bookId),
    );

    for (const playbackEntry of snapshot.playbackStates) {
      db.prepare(
        `
          insert into synced_playback_states (
            workspace_id,
            book_id,
            state_json,
            updated_at
          )
          values (?, ?, ?, ?)
          on conflict(workspace_id, book_id) do update set
            state_json = excluded.state_json,
            updated_at = excluded.updated_at
        `,
      ).run(
        workspaceId,
        playbackEntry.bookId,
        JSON.stringify(playbackEntry.state),
        playbackEntry.state.updatedAt ?? snapshot.syncedAt,
      );
    }

    db.prepare(
      `
        insert into workspace_defaults (
          workspace_id,
          default_profile_json,
          playback_defaults_json,
          sample_request_json,
          removed_books_json,
          discovery_preferences_json,
          updated_at
        )
        values (?, ?, ?, ?, ?, ?, ?)
        on conflict(workspace_id) do update set
          default_profile_json = excluded.default_profile_json,
          playback_defaults_json = excluded.playback_defaults_json,
          sample_request_json = excluded.sample_request_json,
          removed_books_json = excluded.removed_books_json,
          discovery_preferences_json = excluded.discovery_preferences_json,
          updated_at = excluded.updated_at
      `,
    ).run(
      workspaceId,
      snapshot.defaultListeningProfile
        ? JSON.stringify(snapshot.defaultListeningProfile)
        : null,
      snapshot.playbackDefaults ? JSON.stringify(snapshot.playbackDefaults) : null,
      snapshot.sampleRequest ? JSON.stringify(snapshot.sampleRequest) : null,
      JSON.stringify(snapshot.removedBooks ?? []),
      snapshot.discoveryPreferences
        ? JSON.stringify(snapshot.discoveryPreferences)
        : null,
      snapshot.syncedAt,
    );

    db.prepare(
      `
        update workspaces
        set updated_at = ?, last_synced_at = ?
        where id = ?
      `,
    ).run(timestamp, snapshot.syncedAt, workspaceId);

    db.prepare(
      `
        update sync_jobs
        set status = 'completed',
            stats_json = ?,
            completed_at = ?
        where id = ?
      `,
    ).run(
      JSON.stringify({
        books: snapshot.libraryBooks.length,
        profiles: snapshot.listeningProfiles.length,
        playbackStates: snapshot.playbackStates.length,
      }),
      timestamp,
      syncJobId,
    );

    db.exec("commit");
  } catch (error) {
    db.exec("rollback");
    throw error;
  }
  const summary = getWorkspaceSyncSummary(workspaceId);
  if (!summary) {
    throw new Error("Workspace sync completed but no summary was available.");
  }

  return summary;
}

export function getWorkspaceSyncSummary(
  workspaceId: string,
): WorkspaceSyncSummary | null {
  const db = getDatabase();
  const workspaceRow = db
    .prepare(
      `
        select id, last_synced_at
        from workspaces
        where id = ?
      `,
    )
    .get(workspaceId) as { id: string; last_synced_at: string | null } | undefined;

  if (!workspaceRow) {
    return null;
  }

  const syncedBookCount = Number(
    (
      db
        .prepare(
          "select count(*) as count from synced_books where workspace_id = ?",
        )
        .get(workspaceId) as { count: number }
    ).count,
  );
  const syncedProfileCount = Number(
    (
      db
        .prepare(
          "select count(*) as count from synced_profiles where workspace_id = ?",
        )
        .get(workspaceId) as { count: number }
    ).count,
  );
  const syncedPlaybackCount = Number(
    (
      db
        .prepare(
          "select count(*) as count from synced_playback_states where workspace_id = ?",
        )
        .get(workspaceId) as { count: number }
    ).count,
  );
  const generatedOutputCount = Number(
    (
      db
        .prepare(
          "select count(*) as count from generated_outputs where workspace_id = ?",
        )
        .get(workspaceId) as { count: number }
    ).count,
  );
  const lastJob = db
    .prepare(
      `
        select id, workspace_id, status, created_at, completed_at, error_message
        from sync_jobs
        where workspace_id = ?
        order by created_at desc
        limit 1
      `,
    )
    .get(workspaceId) as SyncJobRow | undefined;

  return {
    workspaceId: workspaceRow.id,
    syncedBookCount,
    syncedProfileCount,
    syncedPlaybackCount,
    generatedOutputCount,
    lastSyncedAt: workspaceRow.last_synced_at,
    lastJobStatus: lastJob?.status ?? null,
  };
}

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

export function getWorkspaceLibrarySnapshot(workspaceId: string) {
  const db = getDatabase();
  const workspaceRow = db
    .prepare(
      `
        select id, last_synced_at
        from workspaces
        where id = ?
      `,
    )
    .get(workspaceId) as { id: string; last_synced_at: string | null } | undefined;

  if (!workspaceRow) {
    return null;
  }

  const libraryBooks = db
    .prepare(
      `
        select
          book_id,
          title,
          chapter_count,
          updated_at,
          cover_theme,
          cover_label,
          cover_glyph,
          genre_label
        from synced_books
        where workspace_id = ?
        order by updated_at desc
      `,
    )
    .all(workspaceId) as Array<{
    book_id: string;
    title: string;
    chapter_count: number;
    updated_at: string;
    cover_theme: string | null;
    cover_label: string | null;
    cover_glyph: string | null;
    genre_label: string | null;
  }>;

  const draftTexts = db
    .prepare(
      `
        select book_id, draft_text
        from synced_books
        where workspace_id = ?
      `,
    )
    .all(workspaceId) as Array<{
    book_id: string;
    draft_text: string;
  }>;

  const listeningProfiles = db
    .prepare(
      `
        select book_id, narrator_id, narrator_name, mode
        from synced_profiles
        where workspace_id = ?
      `,
    )
    .all(workspaceId) as Array<{
    book_id: string;
    narrator_id: string;
    narrator_name: string;
    mode: string;
  }>;

  const playbackStates = db
    .prepare(
      `
        select book_id, state_json
        from synced_playback_states
        where workspace_id = ?
      `,
    )
    .all(workspaceId) as Array<{
    book_id: string;
    state_json: string;
  }>;

  const workspaceDefaults = db
    .prepare(
      `
        select
          default_profile_json,
          playback_defaults_json,
          sample_request_json,
          removed_books_json,
          discovery_preferences_json
        from workspace_defaults
        where workspace_id = ?
      `,
    )
    .get(workspaceId) as
    | {
        default_profile_json: string | null;
        playback_defaults_json: string | null;
        sample_request_json: string | null;
        removed_books_json: string | null;
        discovery_preferences_json: string | null;
      }
    | undefined;

  return {
    libraryBooks: libraryBooks.map((book) => ({
      bookId: book.book_id,
      title: book.title,
      chapterCount: book.chapter_count,
      updatedAt: book.updated_at,
      coverTheme: book.cover_theme ?? undefined,
      coverLabel: book.cover_label ?? undefined,
      coverGlyph: book.cover_glyph ?? undefined,
      genreLabel: book.genre_label ?? undefined,
    })),
    removedBooks: workspaceDefaults?.removed_books_json
      ? JSON.parse(workspaceDefaults.removed_books_json)
      : [],
    draftTexts: draftTexts.map((draft) => ({
      bookId: draft.book_id,
      text: draft.draft_text,
    })),
    listeningProfiles: listeningProfiles.map((profile) => ({
      bookId: profile.book_id,
      narratorId: profile.narrator_id,
      narratorName: profile.narrator_name,
      mode: profile.mode,
    })),
    defaultListeningProfile: workspaceDefaults?.default_profile_json
      ? JSON.parse(workspaceDefaults.default_profile_json)
      : null,
    sampleRequest: workspaceDefaults?.sample_request_json
      ? JSON.parse(workspaceDefaults.sample_request_json)
      : null,
    playbackStates: playbackStates.map((entry) => ({
      bookId: entry.book_id,
      state: JSON.parse(entry.state_json),
    })),
    playbackDefaults: workspaceDefaults?.playback_defaults_json
      ? JSON.parse(workspaceDefaults.playback_defaults_json)
      : null,
    discoveryPreferences: workspaceDefaults?.discovery_preferences_json
      ? JSON.parse(workspaceDefaults.discovery_preferences_json)
      : null,
    generationOutputs: listGenerationOutputsForWorkspace(workspaceId),
    syncedAt: workspaceRow.last_synced_at ?? new Date(0).toISOString(),
  };
}

export function getSyncedBookDraftText(workspaceId: string, bookId: string): string | null {
  const db = getDatabase();
  const row = db
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

function mapSyncJobRows(rows: SyncJobRow[]): SyncJobSummary[] {
  return rows.map((row) => {
    const stats = row.stats_json
        ? (JSON.parse(row.stats_json) as {
            books?: number;
            profiles?: number;
            playbackStates?: number;
            bookId?: string;
            narratorId?: string;
            mode?: string;
            chapterCount?: number;
          })
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
      mode: stats?.mode ?? null,
      chapterCount: stats?.chapterCount ?? null,
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

export function enqueueGenerationJob(input: {
  workspaceId: string;
  kind: GenerationJobKind;
  bookId: string;
  narratorId: string | null;
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
      mode: input.mode,
      chapterCount: input.chapterCount ?? null,
    }),
    timestamp,
  );

  return getGenerationJob(jobId, input.workspaceId);
}

export function claimNextGenerationJob(): SyncJobSummary | null {
  const db = getDatabase();
  db.exec("begin immediate");

  try {
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

    db.prepare(
      `
        update sync_jobs
        set status = 'running'
        where id = ?
          and status = 'queued'
      `,
    ).run(row.id);

    db.exec("commit");
    return getGenerationJob(row.id, row.workspace_id);
  } catch (error) {
    db.exec("rollback");
    throw error;
  }
}

export function completeGenerationJob(
  jobId: string,
  workspaceId?: string | null,
  outputAsset?: {
    assetPath: string;
    mimeType: string;
    provider: "openai" | "mock";
  } | null,
): SyncJobSummary | null {
  const job = getGenerationJob(jobId, workspaceId);
  if (!job || job.status === "completed" || job.status === "failed") {
    return job;
  }

  const completedAt = new Date().toISOString();
  const db = getDatabase();
  if (job.bookId) {
    const latestOutput = {
      workspaceId: job.workspaceId,
      bookId: job.bookId,
      kind: job.kind as GenerationJobKind,
      narratorId: job.narratorId,
      mode: job.mode,
      chapterCount: job.chapterCount,
      assetPath: outputAsset?.assetPath ?? "",
      mimeType: outputAsset?.mimeType ?? "audio/wav",
      provider: outputAsset?.provider ?? "mock",
      generatedAt: completedAt,
    } satisfies GenerationOutputSummary;

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
  }
  db.prepare(
    `
      update sync_jobs
      set status = 'completed',
          completed_at = ?,
          error_message = null
      where id = ?
        ${workspaceId ? "and workspace_id = ?" : ""}
    `,
  ).run(...(workspaceId ? [completedAt, jobId, workspaceId] : [completedAt, jobId]));

  return getGenerationJob(jobId, workspaceId);
}

export function failGenerationJob(
  jobId: string,
  workspaceId?: string | null,
  errorMessage?: string | null,
): SyncJobSummary | null {
  const job = getGenerationJob(jobId, workspaceId);
  if (!job || job.status === "completed" || job.status === "failed") {
    return job;
  }

  const completedAt = new Date().toISOString();
  const db = getDatabase();
  db.prepare(
    `
      update sync_jobs
      set status = 'failed',
          completed_at = ?,
          error_message = ?
      where id = ?
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
          error_message = 'Cancelled by user.'
      where id = ?
        ${workspaceId ? "and workspace_id = ?" : ""}
    `,
  ).run(...(workspaceId ? [completedAt, jobId, workspaceId] : [completedAt, jobId]));

  return getGenerationJob(jobId, workspaceId);
}

export function listRecentSyncJobsForUser(
  userId: string,
  limit = 5,
): SyncJobSummary[] {
  const db = getDatabase();
  const rows = db
    .prepare(
      `
        select sync_jobs.id, sync_jobs.workspace_id, sync_jobs.kind, sync_jobs.status, sync_jobs.stats_json, sync_jobs.created_at, sync_jobs.completed_at, sync_jobs.error_message
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
        join workspaces on workspaces.id = sync_jobs.workspace_id
        where workspaces.user_id = ?
        order by sync_jobs.created_at desc
        limit ?
      `,
    )
    .all(userId, limit) as SyncJobRow[];

  return mapSyncJobRows(rows);
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

    return {
      workspaceId: row.workspace_id,
      bookId: row.book_id,
      kind: row.kind as GenerationJobKind,
      narratorId: output.narratorId ?? null,
      mode: output.mode ?? null,
      chapterCount: output.chapterCount ?? null,
      assetPath: output.assetPath ?? "",
      mimeType: output.mimeType ?? "audio/wav",
      provider: output.provider === "openai" ? "openai" : "mock",
      generatedAt: output.generatedAt ?? new Date(0).toISOString(),
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

    return {
      id: row.id,
      jobId: row.job_id,
      workspaceId: row.workspace_id,
      bookId: row.book_id,
      kind: row.kind as GenerationJobKind,
      narratorId: output.narratorId ?? null,
      mode: output.mode ?? null,
      chapterCount: output.chapterCount ?? null,
      assetPath: output.assetPath ?? "",
      mimeType: output.mimeType ?? "audio/wav",
      provider: output.provider === "openai" ? "openai" : "mock",
      generatedAt: output.generatedAt ?? new Date(0).toISOString(),
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
        order by created_at desc
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
const accountSessionHistoryRetentionDays = 30;
