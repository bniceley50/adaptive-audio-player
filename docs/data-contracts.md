# Data Contracts

## Contract layers

The same concept has different shapes at different trust boundaries. These layers must not be collapsed:

1. SQLite rows are private persistence details.
2. Server domain records may contain workspace identity, manuscript text, raw generation metadata, and contained relative paths.
3. Route DTOs are explicit browser contracts and contain only what that screen needs.
4. Browser storage contains disposable preferences or cache and is never a durable backend record.

`src/lib/backend/book-repository.ts`, `src/lib/backend/generation-repository.ts`, and `src/lib/backend/public-generation.ts` own the conversions between these layers. `src/lib/client/books-api.ts` and `src/lib/playback/local-playback.ts` validate browser-facing responses again before the UI trusts them.

## Identity and local namespace

- `workspaceId` is an opaque local partition ID created by `src/lib/backend/workspace-session.ts` and carried in a signed, HTTP-only cookie.
- A request body must never select or override `workspaceId`.
- The cookie is integrity-protected with HMAC-SHA256, `SameSite=Lax`, secure in production, and valid for one year.
- A workspace is not an account, identity, cloud tenant, or shared-device security boundary.
- `bookId`, `chapterId`, `jobId`, and `artifactId` use generated, prefix-qualified IDs and are always resolved together with the active workspace at server boundaries.

## Authoritative persistence contracts

The current schema version is 2. Active tables are:

| Table | Contract | Owner |
|---|---|---|
| `workspaces` | Local namespace and timestamps; no user relation. | `src/lib/backend/book-repository.ts` and workspace-cookie creation |
| `synced_books` | Book summary plus private normalized manuscript text in `draft_text`. The name is legacy; no cloud sync is implied. | `src/lib/backend/book-repository.ts` |
| `book_chapters` | Ordered chapter ID, title, and private text for a book. | `src/lib/backend/book-repository.ts` |
| `book_create_requests` | Idempotency key, request fingerprint, and resulting book ID. | `src/lib/backend/book-repository.ts` |
| `sync_jobs` | Generation queue, status, error, attempt, heartbeat, lease, and private stats JSON. The name is legacy. | `src/lib/backend/generation-repository.ts` |
| `generated_outputs` | One current output JSON record per workspace, book, and generation kind. | `src/lib/backend/generation-repository.ts` |
| `generated_output_history` | Artifact rows retained for the current generation set, including chapter artifacts. | `src/lib/backend/generation-repository.ts` |
| `book_progress` | One durable progress row per book, tied to the current artifact and guarded by a revision. | `src/lib/backend/book-repository.ts` |
| `worker_heartbeats` | Local worker liveness and last-job diagnostics. | `src/lib/backend/sqlite.ts` and `scripts/job-worker.mjs` |

Retired account, profile, snapshot, and community tables are removed by migration version 2 and are not valid v1 contracts.

## Core server and browser shapes

### Book summary

Server type: `WorkspaceBookSummary` in `src/lib/backend/book-repository.ts`.

```ts
type BookSummary = {
  bookId: string;
  title: string;
  chapterCount: number;
  updatedAt: string;
};
```

The library DTO extends this with bounded activity:

- at most 10 recent job status summaries per book;
- current public output identity and URL without provider, narrator, mode, workspace, or storage path;
- current progress without its internal revision.

### Book detail

Server and browser shape: `WorkspaceBookDetail` and `BookDetail`.

```ts
type BookDetail = BookSummary & {
  manuscript: string;
  chapters: Array<{
    id: string;
    title: string;
    text: string;
    order: number;
  }>;
};
```

This is intentionally private browser data used by setup and playback. The route uses `Cache-Control: no-store`. It must not be logged, placed in URLs, included in screenshots, or copied into durable browser storage.

### Book progress

Canonical server type: `WorkspaceBookProgress` in `src/lib/backend/book-repository.ts`. Browser parser: `BookProgress` in `src/lib/playback/local-playback.ts`.

```ts
type BookProgress = {
  bookId: string;
  artifactId: string;
  positionSeconds: number;
  durationSeconds: number;
  speed: number;
  chapterIndex: number | null;
  revision: number;
  updatedAt: string;
};
```

Writes include the expected `revision`. The server accepts only a current artifact for that book, validates duration, position, speed, and chapter bounds, and increments the revision atomically. A stale writer receives `409` and `currentRevision`.

### Generation job

The server record is still named `SyncJobSummary` in `src/lib/backend/types.ts`; the name is legacy. Generation kinds are `sample-generation` and `full-book-generation`. Active statuses are `queued`, `running`, `completed`, `failed`, and `cancelled`.

Every job route maps server records through `toPublicGenerationJob` in `src/lib/backend/public-generation.ts`. The public job shape is:

```ts
type PublicGenerationJob = {
  id: string;
  kind: string;
  status: string;
  createdAt: string;
  completedAt: string | null;
  errorMessage: string | null;
  bookId: string | null;
  bookTitle: string | null;
  narratorId: string | null;
  mode: string | null;
  chapterCount: number | null;
  renderProgress: GenerationJobProgressSummary | null;
  playableArtifactKind: GenerationJobKind | null;
  resumePath: string | null;
};
```

Lease timestamps, attempt counters, workspace identity, raw `stats_json`, worker heartbeats, manuscript snapshots, profiles, and playback-state snapshots are server-only orchestration data. Enqueue, status, book history, cancellation, and retry responses all use this explicit allowlist; none serialize the broader `SyncJobSummary` directly.

### Generation output and artifact

`GenerationOutputSummary` and `GenerationArtifactSummary` in `src/lib/backend/types.ts` are server-only because they contain:

- `workspaceId`;
- relative `assetPath` and chapter asset paths;
- internal storage and provider metadata.

`toPublicGenerationOutput` and `toPublicGenerationArtifact` in `src/lib/backend/public-generation.ts` produce browser DTOs:

```ts
type PublicGenerationOutput = {
  artifactId: string | null;
  artifactUrl: string;
  bookId: string;
  kind: "sample-generation" | "full-book-generation";
  narratorId: string | null;
  mode: string | null;
  chapterCount: number | null;
  mimeType: string;
  provider: "kokoro-local" | "openai" | "mock";
  generatedAt: string;
  jobId: string | null;
  chapterIndex: number | null;
  chapterTitle: string | null;
  chapterArtifacts: Array<{
    artifactId: string;
    artifactUrl: string;
    chapterIndex: number | null;
    chapterTitle: string | null;
  }>;
  isChapterArtifact: boolean;
  isCurrent: boolean;
};
```

`openai` and `mock` are read-only legacy compatibility values. New production output is `kokoro-local`. No browser DTO contains `assetPath`, `chapterAssetPaths`, or a resolved local path.

## HTTP route contracts

JSON errors use `{ error: string }` with optional conflict metadata. Book detail, progress, and audio routes explicitly use `Cache-Control: no-store`; other routes must not be assumed cacheable merely because they return JSON.

| Route | Request | Success response |
|---|---|---|
| `GET /api/books` | Signed workspace cookie if one exists. | `{ books: LibraryBookSummary[] }`; an absent workspace returns an empty list. |
| `POST /api/books` | Same-origin JSON `{ title, text }`, valid `Idempotency-Key`, maximum 6,100,000 request bytes. | `201` created or `200` replayed with `{ ok, replayed, book }`; sets a workspace cookie when needed. |
| `GET /api/books/[bookId]` | Normalized book ID and workspace cookie. | `{ book: BookDetail }`, including private text, with `no-store`. |
| `DELETE /api/books/[bookId]` | Same-origin request and workspace cookie. | `{ ok: true, deleted: boolean }`; cleanup failure is `409`. |
| `GET /api/books/[bookId]/progress` | Workspace-owned book. | `{ progress: BookProgress | null }`. |
| `PUT /api/books/[bookId]/progress` | Same-origin JSON `{ artifactId, positionSeconds, durationSeconds, speed, chapterIndex, revision }`, maximum 4,096 bytes. | `{ progress: BookProgress }`; stale revision or non-current artifact is `409`. |
| `GET` or `HEAD /api/voices/[voiceId]/preview` | Curated voice ID; preview text is server-owned. | Range-capable preview WAV response or actionable JSON error. |
| `POST /api/jobs/sample-generation` | Same-origin JSON `{ bookId, narratorId }`. | `201 { ok: true, job: PublicGenerationJob }`. |
| `POST /api/jobs/full-book-generation` | Same-origin JSON `{ bookId }`; narrator is derived from the current sample. | `201 { ok: true, job: PublicGenerationJob }`. |
| `GET /api/jobs/sample-generation/[jobId]` | Workspace-owned job. | `{ job: PublicGenerationJob }`. |
| `GET /api/jobs/full-book-generation/[jobId]` | Workspace-owned job. | `{ job: PublicGenerationJob }`. |
| `GET /api/jobs/book/[bookId]` | Workspace cookie and book ID. | `{ jobs: PublicGenerationJob[], outputs, artifacts }`; outputs and artifacts are public generation DTOs. |
| `POST /api/jobs/cancel` | Same-origin JSON `{ jobId }`. | `{ job: PublicGenerationJob }` after an eligible cancellation. |
| `POST /api/jobs/retry` | Same-origin JSON `{ jobId }`. | `{ job: PublicGenerationJob }` for the newly queued retry. |
| `GET /api/audio/generated/[bookId]?kind=...` | Workspace-owned current output. | `200` or `206` WAV stream; `416` for an invalid single range. |
| `GET /api/audio/generated/artifacts/[artifactId]` | Workspace-owned retained artifact. | `200` or `206` WAV stream without exposing its path. |

## Mutation and concurrency contracts

- State-changing routes derive workspace ownership from the signed cookie and verify same-origin headers.
- Book creation is idempotent within a workspace. Reusing a key with the same request fingerprint replays the result; reusing it for different content returns `409`.
- Import and progress request bodies are read through byte bounds before parsing.
- Generation request validation owns allowed voices, compatibility mode, book limits, and duplicate-active-job checks on the server.
- Job claim and expired-lease recovery occur inside one `BEGIN IMMEDIATE` transaction.
- Job completion requires a running job with an unexpired lease and commits output, artifact, and job state together.
- Progress uses optimistic concurrency and current-artifact validation rather than last-write-wins.

## Filesystem contract

- `src/lib/backend/audio-storage.ts` is the only module that constructs or validates generated-audio paths.
- Stored paths are contained relative paths, not browser URLs.
- Public URLs are created by `src/lib/backend/public-generation.ts` and resolve through protected application routes.
- `src/lib/backend/http-audio.ts` accepts one bounded byte range, streams only that range, and never buffers the complete book in memory.
- File deletion and SQLite commit are separate resource boundaries. Rollback cannot restore a deleted file.

## Browser cache contract

`src/lib/playback/local-playback.ts` may cache playback UI state, bookmarks, playback defaults, and pending progress. `src/lib/client/books-api.ts` may cache book summary metadata for transition UX. These caches may be discarded at any time and must never:

- become the durable manuscript store;
- promote a book to ready without a current server artifact;
- manufacture an audio URL;
- override server ownership or validation;
- be treated as a backup or multi-device record.

## Contract change rule

When a route contract changes:

1. Change the owning server domain or repository type.
2. Add or update an explicit public mapper when private fields exist.
3. Update the client parser rather than trusting raw JSON.
4. Test both required fields and forbidden private fields.
5. Update this document in the same change.
