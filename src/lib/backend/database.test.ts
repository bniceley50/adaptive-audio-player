import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it } from "vitest";

import {
  currentDatabaseSchemaVersion,
  databaseSchemaBaselineMigration,
  getDatabase,
  migrateDatabase,
  resetDatabaseForTests,
  type DatabaseMigration,
} from "@/lib/backend/database";

describe("database migrations", () => {
  const createdDirs: string[] = [];
  const currentSchemaTableNames = [
    "book_chapters",
    "book_create_requests",
    "book_progress",
    "generated_output_history",
    "generated_outputs",
    "sync_jobs",
    "synced_books",
    "worker_heartbeats",
    "workspaces",
  ];

  afterEach(() => {
    resetDatabaseForTests();

    for (const dir of createdDirs.splice(0, createdDirs.length)) {
      rmSync(dir, { recursive: true, force: true });
    }

    delete process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH;
  });

  function useTemporaryDatabase() {
    const tempDir = mkdtempSync(path.join(tmpdir(), "adaptive-audio-database-"));
    const databasePath = path.join(tempDir, "library.sqlite");
    createdDirs.push(tempDir);
    process.env.ADAPTIVE_AUDIO_PLAYER_DB_PATH = databasePath;
    return databasePath;
  }

  function readUserVersion(db: DatabaseSync) {
    return (
      db.prepare("pragma user_version").get() as { user_version: number }
    ).user_version;
  }

  function readColumnNames(db: DatabaseSync, table: string) {
    return (
      db.prepare(`pragma table_info(${table})`).all() as Array<{ name: string }>
    ).map((column) => column.name);
  }

  function closeDatabase(db: DatabaseSync) {
    (db as DatabaseSync & { close?: () => void }).close?.();
  }

  it("creates the complete current schema and records its version", () => {
    useTemporaryDatabase();

    const db = getDatabase();
    const tableNames = (
      db
        .prepare(
          `
            select name
            from sqlite_schema
            where type = 'table' and name not like 'sqlite_%'
            order by name
          `,
        )
        .all() as Array<{ name: string }>
    ).map((row) => row.name);

    expect(readUserVersion(db)).toBe(currentDatabaseSchemaVersion);
    expect(tableNames).toEqual(currentSchemaTableNames);
    expect(readColumnNames(db, "workspaces")).toEqual([
      "id",
      "created_at",
      "updated_at",
      "last_synced_at",
    ]);
    expect(
      (db.prepare("pragma foreign_keys").get() as { foreign_keys: number })
        .foreign_keys,
    ).toBe(1);
    expect(
      (db.prepare("pragma journal_mode").get() as { journal_mode: string })
        .journal_mode,
    ).toBe("wal");
  });

  it("upgrades the representative unversioned schema without losing rows", () => {
    const databasePath = useTemporaryDatabase();
    const legacyDb = new DatabaseSync(databasePath);
    legacyDb.exec(`
      create table users (
        id text primary key,
        email text not null unique,
        display_name text not null,
        created_at text not null,
        updated_at text not null
      );

      create table workspaces (
        id text primary key,
        created_at text not null,
        updated_at text not null,
        last_synced_at text
      );

      create table account_sessions (
        id text primary key,
        user_id text not null,
        expires_at text not null,
        last_used_at text not null,
        revoked_at text,
        created_at text not null
      );

      create table synced_books (
        workspace_id text not null,
        book_id text not null,
        title text not null,
        chapter_count integer not null,
        updated_at text not null,
        draft_text text not null,
        primary key (workspace_id, book_id)
      );

      create table workspace_defaults (
        workspace_id text primary key,
        default_profile_json text,
        playback_defaults_json text,
        sample_request_json text,
        updated_at text not null
      );

      create table sync_jobs (
        id text primary key,
        workspace_id text not null,
        kind text not null,
        status text not null,
        stats_json text,
        created_at text not null,
        completed_at text
      );

      create table public_social_circles (
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
        created_at text not null,
        updated_at text not null
      );

      create table public_social_moments (
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
        promoted_at text not null,
        updated_at text not null
      );

      insert into users (id, email, display_name, created_at, updated_at)
      values ('user-legacy', 'legacy@example.com', 'Legacy', '2026-01-01', '2026-01-01');

      insert into workspaces (id, created_at, updated_at, last_synced_at)
      values ('workspace-legacy', '2026-01-01', '2026-01-01', null);

      insert into sync_jobs (
        id, workspace_id, kind, status, stats_json, created_at, completed_at
      ) values (
        'job-legacy', 'workspace-legacy', 'sample-generation', 'queued', null,
        '2026-01-01', null
      );
    `);
    closeDatabase(legacyDb);

    const db = getDatabase();
    const tableNames = (
      db
        .prepare(
          `
            select name
            from sqlite_schema
            where type = 'table' and name not like 'sqlite_%'
            order by name
          `,
        )
        .all() as Array<{ name: string }>
    ).map((row) => row.name);

    expect(readUserVersion(db)).toBe(currentDatabaseSchemaVersion);
    expect(tableNames).toEqual(currentSchemaTableNames);
    expect(readColumnNames(db, "workspaces")).toEqual([
      "id",
      "created_at",
      "updated_at",
      "last_synced_at",
    ]);
    expect(readColumnNames(db, "sync_jobs")).toEqual(
      expect.arrayContaining([
        "error_message",
        "attempt_count",
        "last_heartbeat_at",
        "lease_expires_at",
      ]),
    );
    expect(readColumnNames(db, "synced_books")).toEqual(
      expect.arrayContaining([
        "cover_theme",
        "cover_label",
        "cover_glyph",
        "genre_label",
      ]),
    );
    expect(
      db
        .prepare(
          `
            select status, attempt_count, error_message
            from sync_jobs
            where id = ?
          `,
        )
        .get("job-legacy"),
    ).toEqual({
      status: "queued",
      attempt_count: 0,
      error_message: null,
    });
  });

  it("removes legacy personal data from a populated v1 database without losing core library rows", () => {
    const databasePath = useTemporaryDatabase();
    const v1Db = new DatabaseSync(databasePath);
    v1Db.exec("pragma foreign_keys = on");
    migrateDatabase(v1Db, [databaseSchemaBaselineMigration]);
    expect(readUserVersion(v1Db)).toBe(1);
    v1Db.exec(`
      insert into users (
        id, email, display_name, session_version, created_at, updated_at
      ) values (
        'user-v1', 'reader@example.com', 'Reader', 3, '2026-07-01', '2026-07-02'
      );

      insert into workspaces (
        id, user_id, created_at, updated_at, last_synced_at
      ) values (
        'workspace-v1', 'user-v1', '2026-07-01', '2026-07-02', '2026-07-03'
      );

      insert into account_sessions (
        id, user_id, expires_at, last_used_at, created_at
      ) values (
        'session-v1', 'user-v1', '2026-08-01', '2026-07-03', '2026-07-01'
      );

      insert into synced_books (
        workspace_id, book_id, title, chapter_count, updated_at, draft_text
      ) values (
        'workspace-v1', 'book-v1', 'Preserved book', 1, '2026-07-03', 'Private manuscript'
      );

      insert into synced_profiles (
        workspace_id, book_id, narrator_id, narrator_name, mode
      ) values ('workspace-v1', 'book-v1', 'legacy-voice', 'Legacy Voice', 'classic');

      insert into synced_playback_states (
        workspace_id, book_id, state_json, updated_at
      ) values ('workspace-v1', 'book-v1', '{"position":12}', '2026-07-03');

      insert into workspace_defaults (workspace_id, social_state_json, updated_at)
      values ('workspace-v1', '{"shared":true}', '2026-07-03');

      insert into sync_jobs (
        id, workspace_id, kind, status, created_at, attempt_count
      ) values (
        'job-v1', 'workspace-v1', 'full-book-generation', 'completed', '2026-07-03', 1
      );

      insert into generated_outputs (
        workspace_id, book_id, kind, output_json, updated_at
      ) values (
        'workspace-v1', 'book-v1', 'full-book-generation', '{"artifactId":"artifact-v1"}', '2026-07-03'
      );

      insert into generated_output_history (
        id, workspace_id, book_id, kind, job_id, output_json, created_at
      ) values (
        'artifact-v1', 'workspace-v1', 'book-v1', 'full-book-generation', 'job-v1',
        '{"audioPath":"generated/book-v1.wav"}', '2026-07-03'
      );

      insert into book_chapters (
        workspace_id, book_id, chapter_index, chapter_id, title, text
      ) values ('workspace-v1', 'book-v1', 0, 'chapter-v1', 'Chapter one', 'Chapter text');

      insert into book_create_requests (
        workspace_id, idempotency_key, request_fingerprint, book_id, created_at
      ) values ('workspace-v1', 'request-v1', 'fingerprint-v1', 'book-v1', '2026-07-03');

      insert into book_progress (
        workspace_id, book_id, artifact_id, position_seconds, duration_seconds,
        speed, chapter_index, revision, updated_at
      ) values (
        'workspace-v1', 'book-v1', 'artifact-v1', 42, 120, 1.25, 0, 4, '2026-07-03'
      );

      insert into worker_heartbeats (
        worker_name, status, started_at, last_heartbeat_at
      ) values ('generation-worker', 'ready', '2026-07-03', '2026-07-03');

      insert into social_activity_events (
        id, workspace_id, kind, subject_id, occurred_at
      ) values ('event-v1', 'workspace-v1', 'moment-promoted', 'moment-v1', '2026-07-03');

      insert into public_social_circles (
        id, owner_workspace_id, edition_id, title, host, book_title, checkpoint,
        vibe, summary, created_at, updated_at
      ) values (
        'circle-v1', 'workspace-v1', 'edition-v1', 'Private circle', 'Reader',
        'Preserved book', 'Chapter one', 'quiet', 'Private summary', '2026-07-03', '2026-07-03'
      );

      insert into public_social_moments (
        id, owner_workspace_id, book_id, book_title, chapter_index, chapter_label,
        progress_seconds, quote_text, promoted_at, updated_at
      ) values (
        'moment-v1', 'workspace-v1', 'book-v1', 'Preserved book', 0, 'Chapter one',
        42, 'Private quote', '2026-07-03', '2026-07-03'
      );

      insert into public_social_reports (
        id, reporter_workspace_id, content_kind, content_id, reason, created_at
      ) values ('report-v1', 'workspace-v1', 'moment', 'moment-v1', 'private reason', '2026-07-03');
    `);
    closeDatabase(v1Db);

    const migratingDb = new DatabaseSync(databasePath);
    migratingDb.exec("pragma foreign_keys = on");
    migrateDatabase(migratingDb);

    const tableNames = (
      migratingDb
        .prepare(
          `
            select name
            from sqlite_schema
            where type = 'table' and name not like 'sqlite_%'
            order by name
          `,
        )
        .all() as Array<{ name: string }>
    ).map((row) => row.name);
    expect(readUserVersion(migratingDb)).toBe(2);
    expect(tableNames).toEqual(currentSchemaTableNames);
    expect(readColumnNames(migratingDb, "workspaces")).toEqual([
      "id",
      "created_at",
      "updated_at",
      "last_synced_at",
    ]);
    expect(migratingDb.prepare("pragma foreign_key_check").all()).toEqual([]);
    expect(
      (migratingDb.prepare("pragma foreign_keys").get() as { foreign_keys: number })
        .foreign_keys,
    ).toBe(1);

    for (const table of [
      "workspaces",
      "synced_books",
      "sync_jobs",
      "generated_outputs",
      "generated_output_history",
      "book_chapters",
      "book_create_requests",
      "book_progress",
      "worker_heartbeats",
    ]) {
      expect(
        (
          migratingDb.prepare(`select count(*) as count from ${table}`).get() as {
            count: number;
          }
        ).count,
      ).toBe(1);
    }
    expect(
      migratingDb
        .prepare("select title, draft_text from synced_books where book_id = ?")
        .get("book-v1"),
    ).toEqual({ title: "Preserved book", draft_text: "Private manuscript" });
    expect(
      migratingDb
        .prepare(
          "select artifact_id, position_seconds, speed, revision from book_progress where book_id = ?",
        )
        .get("book-v1"),
    ).toEqual({
      artifact_id: "artifact-v1",
      position_seconds: 42,
      speed: 1.25,
      revision: 4,
    });
    expect(
      migratingDb
        .prepare("select output_json from generated_output_history where id = ?")
        .get("artifact-v1"),
    ).toEqual({ output_json: '{"audioPath":"generated/book-v1.wav"}' });
    closeDatabase(migratingDb);
  });

  it("rolls back a failed migration and can retry from the previous version", () => {
    const databasePath = useTemporaryDatabase();
    const db = new DatabaseSync(databasePath);
    const failingMigrations: readonly DatabaseMigration[] = [
      {
        version: 1,
        name: "stable baseline",
        up(database) {
          database.exec(`
            create table stable_records (
              id text primary key,
              value text not null
            );
            insert into stable_records (id, value) values ('stable', 'before');
          `);
        },
      },
      {
        version: 2,
        name: "injected failure",
        up(database) {
          database.exec(`
            alter table stable_records add column partial_value text;
            update stable_records set partial_value = 'must-roll-back';
            create table partial_table (id text primary key);
          `);
          throw new Error("injected migration failure");
        },
      },
    ];

    expect(() => migrateDatabase(db, failingMigrations)).toThrow(
      /injected migration failure/,
    );

    expect(readUserVersion(db)).toBe(1);
    expect(readColumnNames(db, "stable_records")).toEqual(["id", "value"]);
    expect(
      (
        db
          .prepare(
            "select count(*) as count from sqlite_schema where name = 'partial_table'",
          )
          .get() as { count: number }
      ).count,
    ).toBe(0);
    expect(db.prepare("select * from stable_records").get()).toEqual({
      id: "stable",
      value: "before",
    });

    const repairedMigrations: readonly DatabaseMigration[] = [
      failingMigrations[0],
      {
        version: 2,
        name: "repaired migration",
        up(database) {
          database.exec(
            "alter table stable_records add column migrated_value text not null default 'ready'",
          );
        },
      },
    ];

    migrateDatabase(db, repairedMigrations);
    expect(readUserVersion(db)).toBe(2);
    expect(db.prepare("select * from stable_records").get()).toEqual({
      id: "stable",
      value: "before",
      migrated_value: "ready",
    });
    closeDatabase(db);
  });

  it("reopens an up-to-date database without changing its schema or data", () => {
    useTemporaryDatabase();
    const firstDb = getDatabase();
    firstDb
      .prepare(
        `
          insert into workspaces (
            id, created_at, updated_at, last_synced_at
          ) values (?, ?, ?, null)
        `,
      )
      .run("workspace-reopen", "2026-01-01", "2026-01-01");
    const schemaBefore = firstDb
      .prepare(
        `
          select type, name, coalesce(sql, '') as sql
          from sqlite_schema
          where name not like 'sqlite_%'
          order by type, name
        `,
      )
      .all();

    resetDatabaseForTests();
    const reopenedDb = getDatabase();
    const schemaAfter = reopenedDb
      .prepare(
        `
          select type, name, coalesce(sql, '') as sql
          from sqlite_schema
          where name not like 'sqlite_%'
          order by type, name
        `,
      )
      .all();

    expect(readUserVersion(reopenedDb)).toBe(currentDatabaseSchemaVersion);
    expect(schemaAfter).toEqual(schemaBefore);
    expect(
      reopenedDb
        .prepare("select id from workspaces where id = ?")
        .get("workspace-reopen"),
    ).toEqual({ id: "workspace-reopen" });
  });
});
