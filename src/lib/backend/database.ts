import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { getDatabasePath } from "./env.ts";

declare global {
  var __adaptiveAudioPlayerDb: DatabaseSync | undefined;
}

export type DatabaseMigration = Readonly<{
  version: number;
  name: string;
  up: (database: DatabaseSync) => void;
}>;

export const currentDatabaseSchemaVersion = 2;

function readUserVersion(database: DatabaseSync) {
  const row = database.prepare("pragma user_version").get() as
    | { user_version: number }
    | undefined;
  const version = row?.user_version;

  if (!Number.isSafeInteger(version) || version === undefined || version < 0) {
    throw new Error("The database contains an invalid schema version.");
  }

  return version;
}

function addColumnIfMissing(
  database: DatabaseSync,
  table: string,
  column: string,
  alterSql: string,
) {
  const columns = database
    .prepare(`pragma table_info(${JSON.stringify(table)})`)
    .all() as Array<{ name: string }>;

  if (!columns.some((candidate) => candidate.name === column)) {
    database.exec(alterSql);
  }
}

function createCurrentSchemaBaseline(database: DatabaseSync) {
  database.exec(`
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
      social_state_json text,
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
      attempt_count integer not null default 0,
      last_heartbeat_at text,
      lease_expires_at text,
      foreign key (workspace_id) references workspaces(id) on delete cascade
    );

    create table if not exists book_chapters (
      workspace_id text not null,
      book_id text not null,
      chapter_index integer not null,
      chapter_id text not null,
      title text not null,
      text text not null,
      primary key (workspace_id, book_id, chapter_index),
      unique (workspace_id, book_id, chapter_id),
      foreign key (workspace_id, book_id)
        references synced_books(workspace_id, book_id) on delete cascade
    );

    create table if not exists book_create_requests (
      workspace_id text not null,
      idempotency_key text not null,
      request_fingerprint text not null,
      book_id text not null,
      created_at text not null,
      primary key (workspace_id, idempotency_key),
      foreign key (workspace_id, book_id)
        references synced_books(workspace_id, book_id) on delete cascade
    );

    create table if not exists book_progress (
      workspace_id text not null,
      book_id text not null,
      artifact_id text not null,
      position_seconds real not null check(position_seconds >= 0),
      duration_seconds real not null check(
        duration_seconds > 0 and duration_seconds <= 604800
      ),
      speed real not null check(speed >= 0.25 and speed <= 4),
      chapter_index integer check(chapter_index is null or chapter_index >= 0),
      revision integer not null check(revision >= 1),
      updated_at text not null,
      primary key (workspace_id, book_id),
      foreign key (workspace_id, book_id)
        references synced_books(workspace_id, book_id) on delete cascade,
      check(position_seconds <= duration_seconds)
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

    create table if not exists social_activity_events (
      id text primary key,
      workspace_id text not null,
      kind text not null,
      subject_id text not null,
      quantity integer not null default 1,
      occurred_at text not null,
      metadata_json text,
      foreign key (workspace_id) references workspaces(id) on delete cascade
    );

    create table if not exists public_social_circles (
      id text primary key,
      owner_workspace_id text not null,
      edition_id text not null,
      title text not null,
      host text not null,
      book_title text not null,
      member_count integer not null default 1,
      checkpoint text not null,
      vibe text not null,
      summary text not null,
      source_moment_id text,
      moderation_status text not null default 'active',
      report_count integer not null default 0,
      last_reported_at text,
      created_at text not null,
      updated_at text not null,
      foreign key (owner_workspace_id) references workspaces(id) on delete cascade
    );

    create table if not exists public_social_moments (
      id text primary key,
      owner_workspace_id text not null,
      book_id text not null,
      edition_id text,
      circle_id text,
      book_title text not null,
      chapter_index integer not null,
      chapter_label text not null,
      progress_seconds real not null,
      quote_text text not null,
      moderation_status text not null default 'active',
      report_count integer not null default 0,
      last_reported_at text,
      promoted_at text not null,
      updated_at text not null,
      foreign key (owner_workspace_id) references workspaces(id) on delete cascade
    );

    create table if not exists public_social_reports (
      id text primary key,
      reporter_workspace_id text not null,
      content_kind text not null,
      content_id text not null,
      reason text not null,
      created_at text not null,
      unique (reporter_workspace_id, content_kind, content_id),
      foreign key (reporter_workspace_id) references workspaces(id) on delete cascade
    );
  `);

  addColumnIfMissing(
    database,
    "workspaces",
    "user_id",
    "alter table workspaces add column user_id text references users(id) on delete set null",
  );
  addColumnIfMissing(
    database,
    "users",
    "session_version",
    "alter table users add column session_version integer not null default 1",
  );
  addColumnIfMissing(
    database,
    "sync_jobs",
    "error_message",
    "alter table sync_jobs add column error_message text",
  );
  addColumnIfMissing(
    database,
    "sync_jobs",
    "attempt_count",
    "alter table sync_jobs add column attempt_count integer not null default 0",
  );
  addColumnIfMissing(
    database,
    "sync_jobs",
    "last_heartbeat_at",
    "alter table sync_jobs add column last_heartbeat_at text",
  );
  addColumnIfMissing(
    database,
    "sync_jobs",
    "lease_expires_at",
    "alter table sync_jobs add column lease_expires_at text",
  );
  addColumnIfMissing(
    database,
    "account_sessions",
    "session_label",
    "alter table account_sessions add column session_label text",
  );
  addColumnIfMissing(
    database,
    "account_sessions",
    "ended_reason",
    "alter table account_sessions add column ended_reason text",
  );
  addColumnIfMissing(
    database,
    "account_sessions",
    "last_activity_path",
    "alter table account_sessions add column last_activity_path text",
  );
  addColumnIfMissing(
    database,
    "account_sessions",
    "last_activity_label",
    "alter table account_sessions add column last_activity_label text",
  );
  addColumnIfMissing(
    database,
    "synced_books",
    "cover_theme",
    "alter table synced_books add column cover_theme text",
  );
  addColumnIfMissing(
    database,
    "synced_books",
    "cover_label",
    "alter table synced_books add column cover_label text",
  );
  addColumnIfMissing(
    database,
    "synced_books",
    "cover_glyph",
    "alter table synced_books add column cover_glyph text",
  );
  addColumnIfMissing(
    database,
    "synced_books",
    "genre_label",
    "alter table synced_books add column genre_label text",
  );
  addColumnIfMissing(
    database,
    "workspace_defaults",
    "removed_books_json",
    "alter table workspace_defaults add column removed_books_json text",
  );
  addColumnIfMissing(
    database,
    "workspace_defaults",
    "discovery_preferences_json",
    "alter table workspace_defaults add column discovery_preferences_json text",
  );
  addColumnIfMissing(
    database,
    "workspace_defaults",
    "social_state_json",
    "alter table workspace_defaults add column social_state_json text",
  );
  addColumnIfMissing(
    database,
    "public_social_circles",
    "moderation_status",
    "alter table public_social_circles add column moderation_status text not null default 'active'",
  );
  addColumnIfMissing(
    database,
    "public_social_circles",
    "report_count",
    "alter table public_social_circles add column report_count integer not null default 0",
  );
  addColumnIfMissing(
    database,
    "public_social_circles",
    "last_reported_at",
    "alter table public_social_circles add column last_reported_at text",
  );
  addColumnIfMissing(
    database,
    "public_social_moments",
    "moderation_status",
    "alter table public_social_moments add column moderation_status text not null default 'active'",
  );
  addColumnIfMissing(
    database,
    "public_social_moments",
    "report_count",
    "alter table public_social_moments add column report_count integer not null default 0",
  );
  addColumnIfMissing(
    database,
    "public_social_moments",
    "last_reported_at",
    "alter table public_social_moments add column last_reported_at text",
  );

  database.exec(`
    create index if not exists sync_jobs_generation_claim_idx
    on sync_jobs(status, kind, lease_expires_at, created_at)
  `);
}

function removeLegacySingleUserSchema(database: DatabaseSync) {
  database.exec(`
    drop table if exists public_social_reports;
    drop table if exists public_social_moments;
    drop table if exists public_social_circles;
    drop table if exists social_activity_events;
    drop table if exists workspace_defaults;
    drop table if exists synced_playback_states;
    drop table if exists synced_profiles;
    drop table if exists account_sessions;

    create table workspaces_v2 (
      id text primary key,
      created_at text not null,
      updated_at text not null,
      last_synced_at text
    );

    insert into workspaces_v2 (id, created_at, updated_at, last_synced_at)
    select id, created_at, updated_at, last_synced_at
    from workspaces;

    drop table workspaces;
    alter table workspaces_v2 rename to workspaces;
    drop table if exists users;
  `);
}

export const legacySingleUserSchemaCleanupMigration: DatabaseMigration = {
  version: 2,
  name: "remove legacy account, social, and snapshot schema",
  up: removeLegacySingleUserSchema,
};

export const databaseSchemaBaselineMigration: DatabaseMigration = {
  version: 1,
  name: "current schema baseline",
  up: createCurrentSchemaBaseline,
};

const databaseMigrations: readonly DatabaseMigration[] = [
  databaseSchemaBaselineMigration,
  legacySingleUserSchemaCleanupMigration,
];

function validateMigrationSequence(migrations: readonly DatabaseMigration[]) {
  for (const [index, migration] of migrations.entries()) {
    const expectedVersion = index + 1;
    if (
      migration.version !== expectedVersion ||
      !Number.isSafeInteger(migration.version) ||
      !migration.name.trim()
    ) {
      throw new Error(
        `Database migrations must use contiguous versions starting at 1; expected version ${expectedVersion}.`,
      );
    }
  }
}

function rollbackMigration(database: DatabaseSync) {
  try {
    database.exec("rollback");
  } catch {
    // The transaction may have failed before it began. Preserve the root error.
  }
}

export function migrateDatabase(
  database: DatabaseSync,
  migrations: readonly DatabaseMigration[] = databaseMigrations,
) {
  validateMigrationSequence(migrations);
  const latestVersion = migrations.length;
  let observedVersion = readUserVersion(database);

  if (observedVersion > latestVersion) {
    throw new Error(
      `Database schema version ${observedVersion} is newer than supported version ${latestVersion}.`,
    );
  }

  while (observedVersion < latestVersion) {
    const foreignKeysWereEnabled = (
      database.prepare("pragma foreign_keys").get() as { foreign_keys: number }
    ).foreign_keys === 1;

    if (foreignKeysWereEnabled) {
      database.exec("pragma foreign_keys = off");
    }

    try {
      database.exec("begin immediate");
      const currentVersion = readUserVersion(database);

      if (currentVersion > latestVersion) {
        rollbackMigration(database);
        throw new Error(
          `Database schema version ${currentVersion} is newer than supported version ${latestVersion}.`,
        );
      }

      if (currentVersion === latestVersion) {
        rollbackMigration(database);
        return;
      }

      const migration = migrations[currentVersion];
      try {
        migration.up(database);
        const foreignKeyViolations = database
          .prepare("pragma foreign_key_check")
          .all();
        if (foreignKeyViolations.length > 0) {
          throw new Error(
            `Foreign-key validation found ${foreignKeyViolations.length} violation(s).`,
          );
        }
        database.exec(`pragma user_version = ${migration.version}`);
        database.exec("commit");
        observedVersion = migration.version;
      } catch (error) {
        rollbackMigration(database);
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(
          `Database migration ${migration.version} (${migration.name}) failed: ${message}`,
          { cause: error },
        );
      }
    } finally {
      if (foreignKeysWereEnabled) {
        database.exec("pragma foreign_keys = on");
      }
    }
  }
}

function configureDatabaseConnection(database: DatabaseSync) {
  database.exec(`
    pragma journal_mode = wal;
    pragma busy_timeout = 3000;
    pragma foreign_keys = on;
  `);
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

function initializeDatabaseWithRetry(database: DatabaseSync) {
  const maxAttempts = 4;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      configureDatabaseConnection(database);
      migrateDatabase(database);
      return;
    } catch (error) {
      if (!isSqliteLockedError(error) || attempt === maxAttempts) {
        throw error;
      }

      sleepSync(50 * attempt);
    }
  }
}

function openDatabase(databasePath: string) {
  const databaseDir = path.dirname(databasePath);
  if (!existsSync(databaseDir)) {
    mkdirSync(databaseDir, { recursive: true });
  }

  const database = new DatabaseSync(databasePath);
  try {
    initializeDatabaseWithRetry(database);
    return database;
  } catch (error) {
    closeDatabase(database);
    throw error;
  }
}

function closeDatabase(database: DatabaseSync) {
  (database as DatabaseSync & { close?: () => void }).close?.();
}

export function resetDatabaseForTests() {
  if (globalThis.__adaptiveAudioPlayerDb) {
    closeDatabase(globalThis.__adaptiveAudioPlayerDb);
  }
  globalThis.__adaptiveAudioPlayerDb = undefined;
}

export function getDatabase() {
  if (!globalThis.__adaptiveAudioPlayerDb) {
    globalThis.__adaptiveAudioPlayerDb = openDatabase(getDatabasePath());
  }

  return globalThis.__adaptiveAudioPlayerDb;
}
