# Architecture

## Status and invariant

The implemented source build is a private, single-user, local application. SQLite and contained files are authoritative; browser storage is disposable UI cache. The signed Windows desktop package described in `docs/packaging-plan.md` is still a release target, not a current runtime.

The local operating-system user and the application form the v1 trust boundary. A signed, HTTP-only workspace cookie partitions local records, but it is not an account or a claim of isolation between people sharing the same OS profile.

## Process and trust boundaries

```mermaid
flowchart LR
  Browser["Browser UI\nclient components and media element"]
  Server["Next.js server\nroute handlers and server modules"]
  Worker["Node generation worker\nscripts/job-worker.mjs"]
  Sidecar["Python Kokoro sidecar\nloopback only"]
  Database[("SQLite\nlocal authoritative rows")]
  Audio[("Generated WAV files\ncontained data root")]
  Model[("Verified Kokoro model\nlocal cache or package resource")]

  Browser -->|"same-origin JSON and range requests"| Server
  Server -->|"validated repository calls"| Database
  Server -->|"authorized range streams"| Audio
  Worker -->|"claim, lease, progress, completion"| Database
  Worker -->|"bounded text over loopback"| Sidecar
  Worker -->|"write and assemble"| Audio
  Sidecar -->|"load only after SHA-256 verification"| Model
```

`scripts/dev-with-worker.mjs` supervises the sidecar, worker, and Next.js process in development. It validates a ready Python 3.12 environment, waits for loopback health, stops the process tree when a required child exits, and does not install packages during discovery.

Boundary rules:

- The browser never opens SQLite, resolves a local path, contacts the sidecar, or reads a signing secret.
- Route handlers derive the workspace namespace from `src/lib/backend/workspace-session.ts`; request bodies do not choose it.
- State-changing routes use `src/lib/backend/csrf.ts` to enforce same-origin requests.
- The worker and Next server share SQLite and the generated-audio root. SQLite WAL mode, a busy timeout, short write transactions, and job leases coordinate them.
- The sidecar accepts loopback traffic only. It receives narration text from the local worker and returns bounded WAV data.
- Raw manuscripts, generated files, SQLite rows, local paths, the session secret, and model paths are private even though the product is single-user.

## Sources of truth

| Domain | Authoritative source | Owner | Browser exposure |
|---|---|---|---|
| Book metadata, manuscript, chapters | `synced_books` and `book_chapters` | `src/lib/backend/book-repository.ts` | Summaries are broadly used; manuscript and chapter text are returned only by the private book-detail route. |
| Import replay protection | `book_create_requests` | `src/lib/backend/book-repository.ts` | Only `replayed` and conflict outcomes are exposed. Fingerprints stay server-side. |
| Generation jobs and leases | `sync_jobs` | `src/lib/backend/generation-repository.ts` | Status DTOs only; lease timestamps and raw JSON are server concerns. |
| Current playable output | `generated_outputs` | `src/lib/backend/generation-repository.ts` | Public artifact IDs and application URLs replace filesystem paths. |
| Retained artifacts for the current generation set | `generated_output_history` | `src/lib/backend/generation-repository.ts` | Public artifact DTOs omit `assetPath` and `workspaceId`. |
| Playback progress | `book_progress` | `src/lib/backend/book-repository.ts` | Validated progress DTO with optimistic `revision`. |
| Generated audio bytes | Files below the configured data root | `src/lib/backend/audio-storage.ts` | Streamed by protected application routes with range support. |
| Worker liveness | `worker_heartbeats` | `src/lib/backend/sqlite.ts` and `scripts/job-worker.mjs` | Diagnostic status only. |
| Voice IDs | `src/lib/voices/catalog.ts` | Server-owned catalog and generation validation | Stable product IDs, display names, descriptions, and preview URLs. |
| UI preferences and bookmarks | Browser storage | `src/lib/playback/local-playback.ts` | Disposable local cache; never the durable manuscript or artifact authority. |

`synced_books` and `sync_jobs` are legacy schema names. They do not imply a cloud service or whole-library synchronization.

## Import flow

```mermaid
sequenceDiagram
  participant User
  participant ImportUI as Import page
  participant Extractor as src/lib/import/extract-text.ts
  participant BooksAPI as POST /api/books
  participant BookRepo as src/lib/backend/book-repository.ts
  participant DB as SQLite

  User->>ImportUI: choose TXT/EPUB or paste text
  ImportUI->>Extractor: validate and extract local file
  Extractor-->>ImportUI: title metadata and normalized text
  ImportUI->>ImportUI: parse and review chapters
  User->>ImportUI: confirm title and chapters
  ImportUI->>BooksAPI: title + text + Idempotency-Key
  BooksAPI->>BooksAPI: bound body, validate, parse chapters again
  BooksAPI->>BookRepo: createWorkspaceBook
  BookRepo->>DB: one immediate transaction
  DB-->>ImportUI: book summary or replay/conflict
```

TXT and EPUB parsing occurs in the browser because the selected `File` is browser-owned. The backend receives normalized text, validates it again, parses chapters again, and persists the manuscript and chapters atomically. The original TXT or EPUB file is not copied into backend storage.

## Generation flow

```mermaid
sequenceDiagram
  participant UI as Book setup
  participant API as Generation route
  participant Jobs as Generation repository
  participant Worker as Node worker
  participant TTS as Kokoro sidecar
  participant Files as Audio storage

  UI->>API: bookId and curated voiceId
  API->>API: same-origin, workspace, book, voice, limits
  API->>Jobs: enqueue queued job
  Worker->>Jobs: atomically claim job and start 45s lease
  loop while rendering
    Worker->>Jobs: renew lease and record progress
    Worker->>TTS: bounded chapter or sample text
    TTS-->>Worker: WAV bytes
    Worker->>Files: write job-scoped part
  end
  Worker->>Files: assemble final WAV
  Worker->>Jobs: complete under valid lease
  Jobs->>Jobs: publish output, artifacts, and completed state in one SQLite transaction
  UI->>API: poll job and artifact DTOs
```

Sample generation accepts the requested curated voice. Full-book generation derives its voice from the current accepted sample, falling back only through the documented compatibility path. Production generation has no cloud TTS or mock-audio fallback.

Handled render failures remove files tracked during that attempt and mark the job failed. An abrupt process death may leave a job-scoped partial file that was never recorded; the filename remains attributable, but there is not yet a global startup orphan sweep.

## Playback and progress flow

```mermaid
sequenceDiagram
  participant Player
  participant JobsAPI as GET /api/jobs/book/[bookId]
  participant AudioAPI as Protected audio route
  participant ProgressAPI as /api/books/[bookId]/progress
  participant DB as SQLite
  participant File as Generated WAV

  Player->>JobsAPI: request current and retained artifact DTOs
  JobsAPI-->>Player: artifactId + artifactUrl, never assetPath
  Player->>AudioAPI: same-origin byte-range request
  AudioAPI->>DB: authorize artifact in workspace
  AudioAPI->>File: open validated contained path
  File-->>Player: 200 or 206 byte stream
  Player->>ProgressAPI: GET durable progress
  ProgressAPI->>DB: load book_progress
  Player->>Player: compare durable state with newer disposable cache
  Player->>ProgressAPI: PUT snapshot + expected revision
  ProgressAPI->>DB: validate current artifact and update atomically
  ProgressAPI-->>Player: next revision or 409 conflict
```

`src/components/player/use-media-controller.ts` owns the media element lifecycle. `src/components/player/now-playing.tsx` hydrates progress, retains bookmarks and UI preferences locally, and uses `src/lib/playback/local-playback.ts` to throttle durable progress writes.

## Deletion flow and transaction boundary

```mermaid
sequenceDiagram
  participant UI as Library UI
  participant Route as DELETE /api/books/[bookId]
  participant Repo as Book repository
  participant Files as Audio storage
  participant DB as SQLite

  UI->>Route: same-origin delete
  Route->>Repo: workspaceId + normalized bookId
  Repo->>DB: BEGIN IMMEDIATE
  Repo->>DB: collect target and protected paths
  Repo->>Files: delete only validated, unshared artifacts
  alt file validation or deletion fails
    Repo->>DB: ROLLBACK
    Route-->>UI: 409, book rows retained
  else files removed
    Repo->>DB: delete artifacts, jobs, progress, chapters, manuscript
    Repo->>DB: COMMIT
    Route-->>UI: deleted true
  end
```

SQLite makes the row deletion atomic, but the filesystem is not part of that transaction. If a database error occurs after a file has been removed, rollback preserves rows but cannot restore that file. Callers must therefore surface a missing-artifact recovery state; the architecture must not claim cross-resource atomicity until a staged-delete or recovery journal exists.

## Restart recovery

```mermaid
flowchart TD
  Start["Worker starts or polls"] --> Recover["Within BEGIN IMMEDIATE, find expired running leases"]
  Recover --> Fence["Mark each expired attempt failed"]
  Fence --> Attempts{"Fewer than 3 attempts?"}
  Attempts -->|Yes| Replace["Insert replacement queued job with same validated stats"]
  Attempts -->|No| Actionable["Remain failed with actionable retry message"]
  Replace --> Claim["Atomically claim oldest queued job"]
  Claim --> Lease["Renew 45-second lease every 10 seconds"]
  Lease --> Complete{"Completion still owns valid lease?"}
  Complete -->|Yes| Publish["Publish artifacts and completed state"]
  Complete -->|No| Reject["Reject stale completion"]
```

The supervisor stops all remaining processes when a required child exits. On the next worker poll, `src/lib/backend/generation-repository.ts` fences expired work, creates at most two automatic replacements after the original attempt, and prevents an expired worker from publishing completion.

## Migrations

`src/lib/backend/database.ts` owns schema versioning through SQLite `user_version`.

- Version 1 creates the historical baseline schema.
- Version 2 removes retired account, profile, snapshot, and community tables and rebuilds `workspaces` without `user_id`, while preserving books, chapters, create requests, jobs, outputs, artifact rows, progress, and worker heartbeats.
- Migrations are contiguous and run under `BEGIN IMMEDIATE` before repositories use the database.
- Foreign-key enforcement is temporarily disabled around a migration, `foreign_key_check` must pass before commit, and the previous enforcement setting is restored.
- A failed migration rolls back and prevents the database from opening. A database newer than the runtime is rejected.

## Retention and failure behavior

- A successful generation replaces the prior output and retained artifact set for the same workspace, book, and generation kind. Superseded unshared files are deleted before the new rows commit.
- Completed, failed, and cancelled job rows older than 30 days are pruned for that book when a later generation completes.
- Book deletion removes validated generated files and then deletes that book's artifact, job, progress, chapter, manuscript, and idempotency rows through repository-owned operations.
- Missing files never produce simulated playback. Routes return a missing-artifact response and the UI offers recovery.
- Cancellation changes eligible queued or running jobs to `cancelled`; the worker checks current state before publishing.
- Sidecar unavailability, response limits, invalid WAV data, corrupt model weights, and expired leases fail closed.

## Desktop packaging boundary

The planned desktop host will supervise the same server, worker, and sidecar boundaries, allocate authenticated ephemeral loopback ports, bundle the verified model, and keep application state inside the Windows package data container. Until that proof exists, source-development behavior must not be described as a shipped desktop runtime.
