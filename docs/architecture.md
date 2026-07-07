# Architecture

## App shape

- Next.js App Router frontend
- Mobile-first route set for:
  - library dashboard
  - import
  - book setup
  - player
  - jobs
- Hybrid local-first plus backend-synced product model
- Worker-backed generation pipeline with account/workspace sync

## Core modules

- `src/lib/import`
- `src/lib/parser`
- `src/lib/narration`
- `src/lib/ambience`
- `src/lib/playback`
- `src/lib/jobs`
- `src/lib/validation`
- `src/lib/library`
- `src/lib/backend`

## Current architecture

### Product surfaces

- `src/app/page.tsx` - home dashboard
- `src/app/import/page.tsx` - import and chapter preview
- `src/app/books/[bookId]/page.tsx` - taste setup and render timeline
- `src/app/player/[bookId]/page.tsx` - listening experience
- `src/app/jobs/page.tsx` - backend queue and render history

### State model

The app currently uses a mixed state strategy:

- browser-local state for fast UX and demo-mode behaviors
- backend-synced snapshot state for cross-workspace/account continuity
- worker-backed job state for sample/full-book generation

The current direction is deliberate:
- local state may make the UI feel immediate
- backend state should become the more authoritative source over time

### Backend responsibilities

`src/lib/backend/**` currently owns:
- account and session persistence
- workspace ownership and sync
- generation job metadata
- generated artifact metadata
- route-level auth and ownership enforcement

### Local generation pipeline

- `tts_sidecar/**` runs a localhost-only Kokoro service with pinned package and verified model weights.
- `scripts/job-worker.mjs` claims SQLite generation jobs in the background.
- Sample jobs render one current sample artifact.
- Full-book jobs render one chapter artifact at a time, update job progress after each chapter, and only complete after the chapter WAV files are stitched into the current full-book artifact.
- If a local render fails or the sidecar disappears mid-job, the worker marks the job failed with a plain-English error and removes generated-audio files tracked during that attempt. Generated filenames include the job id so any crash-time orphan remains attributable rather than colliding with a later render.

### Library and playback responsibilities

`src/lib/library/**` currently owns:
- book identity
- listening tastes / editions
- sample requests
- generated output metadata
- removed-book tombstones

`src/lib/playback/**` currently owns:
- current playback progress
- bookmarks
- playback defaults
- precedence rules between local and synced playback state

## Current pain points

The biggest maintainability hotspots are oversized route files:

- `src/app/books/[bookId]/page.tsx`
- `src/app/player/[bookId]/page.tsx`
- `src/app/page.tsx`
- `src/app/jobs/page.tsx`

Those routes currently mix:
- route loading
- storage precedence rules
- feature-specific view-model assembly
- UI orchestration

The next architectural step is to move repeated product logic into
feature-level modules while keeping route files as thin orchestration layers.

## Target architecture

See:
- `docs/module-boundaries.md`
- `docs/data-contracts.md`

The target shape is:
- thin routes
- feature modules for product logic
- repository/infrastructure helpers for persistence
- canonical shared contracts
- isolated demo/local bootstrapping

## Planned evolution

- Continue replacing local-first assumptions with synced backend truth
- Extract feature modules from large route files
- Add repository-style interfaces around library/playback/generation/auth
- Keep demo mode isolated from production-oriented state flows
