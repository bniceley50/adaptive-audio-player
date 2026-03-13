# Data Contracts

These are the canonical product contracts that future work should reuse instead
of redefining in page files.

## Core reading and listening

### Book

Current root types:
- `src/lib/types/models.ts`
- `src/lib/library/local-library.ts`
- `src/lib/backend/types.ts`

Practical contract:
- `bookId`
- `title`
- `chapterCount`
- `updatedAt`
- optional identity metadata:
  - `coverTheme`
  - `coverLabel`
  - `coverGlyph`
  - `genreLabel`

Rule:
- route files should consume a normalized book shape, not invent their own
  title/cover fallbacks independently

### Chapter

Canonical type:
- `src/lib/types/models.ts`

Fields:
- `id`
- `title`
- `text`
- `order`

### Listening profile

Canonical local type:
- `LocalListeningProfile` in `src/lib/library/local-library.ts`

Fields:
- `bookId`
- `narratorId`
- `narratorName`
- `mode`

Meaning:
- one book-specific listening edition

### Default listening profile

Backed by:
- local default taste storage
- backend sync snapshot `defaultListeningProfile`

Rule:
- default taste is weaker than a saved book-specific taste
- recent taste is weaker than both

### Playback state

Canonical types:
- `PersistedPlaybackState` in `src/lib/playback/local-playback.ts`
- `SyncedPlaybackStateRecord` in `src/lib/backend/types.ts`

Required behaviors:
- compare local and backend freshness
- prefer the newest trusted state
- preserve:
  - chapter index
  - progress seconds
  - speed
  - sleep timer
  - playback artifact kind

### Playback defaults

Canonical type:
- `PlaybackDefaults` in `src/lib/playback/local-playback.ts`

Rule:
- immediate local changes should feel instant
- workspace/account transitions should reset to the synced snapshot

## Generation and render history

### Sample request

Canonical type:
- `LocalSampleRequest` in `src/lib/library/local-library.ts`

Fields:
- `bookId`
- `narratorId`
- `mode`

### Generated artifact

Canonical types:
- `LocalGenerationOutput` in `src/lib/library/local-library.ts`
- `GenerationOutputSummary` in `src/lib/backend/types.ts`
- `GenerationArtifactSummary` in `src/lib/backend/types.ts`

Shared fields:
- `workspaceId`
- `bookId`
- `kind`
- `narratorId`
- `mode`
- `chapterCount`
- `assetPath`
- `mimeType`
- `provider`
- `generatedAt`

Rule:
- UI should prefer the freshest artifact metadata between local and backend
- current vs archived is a first-class product distinction

### Generation job

Canonical types:
- `GenerationJobKind`
- `SyncJobSummary`

Kinds:
- `sample-generation`
- `full-book-generation`

Rule:
- jobs are the orchestration record
- artifacts are the playable outcome

## Social and casual features

### Saved quote

Current owner:
- quote-related helpers/components under `src/components/library`

Practical contract:
- unique id
- `bookId`
- optional `bookTitle`
- `chapterIndex`
- `progressSeconds`
- `text`
- timestamps for save/pin/share flows

### Listening edition

Product name for shared taste object.

Backed by:
- listening profile
- optional default playback values
- optional social metadata

Minimum share contract:
- narrator
- mode
- optional playback defaults
- optional creator label

### Book circle

Current product object:
- social entry point around a quote or title

Minimum contract:
- title/book identity
- featured quote or moment
- recommended listening edition
- invite/share action

## Account, workspace, and sync

### Library sync snapshot

Canonical type:
- `LibrarySyncSnapshot` in `src/lib/backend/types.ts`

This is the server-backed source for:
- books
- removed books
- drafts
- listening profiles
- default profile
- sample request
- playback states
- playback defaults
- generation outputs

Rule:
- when local state is missing or weaker/staler, prefer the synced snapshot

### Workspace summary

Canonical types:
- `WorkspaceSyncSummary`
- `UserWorkspaceSummary`

Used for:
- account card
- linked workspace switching
- backend status surfaces

### Account session

Canonical types:
- `BackendAccountSession`
- `UserAccountSessionSummary`
- `EndedAccountSessionSummary`

Rule:
- session/security UI should read from these types, not reinterpret raw cookie
  state

## Contract hygiene rules

- Add new product contracts here before duplicating types in routes.
- Prefer extending canonical types over introducing route-local objects.
- If a type exists in both local and backend layers, define the merge rules
  explicitly in the owning helper.
