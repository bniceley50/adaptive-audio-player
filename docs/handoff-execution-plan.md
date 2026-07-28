# Adaptive Audio Player: Product Reset and Execution Plan

Date: 2026-07-16

Audience: an implementation model with no prior project context

Status: historical execution record. Q1-Q9 were accepted and recorded in
`DECISIONS.md`; the source-product phases are implemented. The Windows desktop
package and release matrix remain incomplete and approval-gated as described in
`PLAN.md` and `docs/packaging-plan.md`.

## Accepted product decisions

The user accepted the recommended answers below. `DECISIONS.md` is the
authoritative decision log; this table remains here to preserve the reasoning
that shaped the ordered implementation plan.

| ID | Open question | Recommended answer | Why the answer changes the plan |
| --- | --- | --- | --- |
| Q1 | Does “change the narrator” mean starting from a DRM-free ebook/manuscript, or uploading an existing audiobook recording and replacing its speech? | Start from DRM-free TXT/EPUB in v1. | Replacing speech in an existing recording requires transcription, speaker/music separation, alignment, and rights handling. That is a different and substantially larger product. The current MP3/M4B path only plays the original audio. |
| Q2 | Should v1 offer curated synthetic voices only, or voice cloning/custom voice uploads? | Curated built-in voices only. | Voice cloning adds consent, impersonation, model-hosting, moderation, and data-retention requirements. |
| Q3 | Is this a local desktop product or a hosted web service? | Local-first desktop product with the model, worker, and database bundled. | The current local Kokoro design preserves privacy but requires manual Python setup. A hosted service needs real authentication, object storage, remote workers, quotas, and a different privacy model. |
| Q4 | Which operating system must v1 support? | Windows first, then macOS. | Packaging, model installation, file handling, media controls, and background execution are platform-specific. |
| Q5 | Which source formats are truly required for v1? | TXT and DRM-free EPUB. Defer PDF and DOCX. Treat MP3/M4B as a separate original-audio feature or remove it from v1. | Current documentation promises EPUB/PDF/DOCX, but extraction currently supports text only. |
| Q6 | Are accounts, cloud sync, community, sharing, circles, discovery, reporting, and moderation part of v1? | No. Defer all of them until the private single-user listening loop is reliable. | These features account for roughly 8,500 lines across about 47 files and materially distract from the unfinished core. The current email-only account flow is unsafe if hosted. |
| Q7 | Are “classic,” “ambient,” and “immersive” modes required in v1? | Expose narration only. Keep “classic” as a temporary internal compatibility value, then remove the field in a later migration. | The worker currently ignores mode, so the UI promises sound design that does not exist. |
| Q8 | What measurable release targets define “polished and reliable”? | Agree on: first-sample completion target, maximum supported book size, crash-free generation rate, restart recovery, and accessibility/browser or OS targets. | Performance and reliability cannot be verified without thresholds. |
| Q9 | What content-rights rule should the product enforce and communicate? | Accept only DRM-free material the user owns or is authorized to transform. Never bypass DRM. | Import wording, support policy, telemetry, and any future hosted design depend on this boundary. |

## Goal

Deliver a polished, low-friction product for non-technical audiobook enthusiasts:

1. Open the app without a terminal or manual service setup.
2. Import a supported, authorized book source.
3. Hear short previews of clearly named narrator voices.
4. Generate a sample and listen to the actual generated audio.
5. Generate the book, close and reopen the app, and continue at the saved position.
6. Recover cleanly from cancellation, worker restarts, missing files, and failed generation.

The product should optimize for simplicity, reliability, user experience, and only then extensibility.

## Definition of done

The reset is complete only when all of the following are proven:

- The everyday navigation contains Library and Add book; internal job and infrastructure screens are not in primary navigation.
- The supported-import copy exactly matches implemented formats and limits.
- A generated sample cannot be marked ready until a playable artifact exists.
- Play, pause, seek, skip, speed, chapter navigation, progress, end-of-track, and sleep timer control a real media element.
- Player labels always describe the exact artifact being heard.
- Generated audio supports HTTP byte ranges and does not load an entire full book into server memory.
- A cancelled job cannot later become completed.
- A worker restart recovers or safely fails stale running jobs.
- Book deletion removes manuscripts, imported blobs, generated files, and database metadata according to a documented retention rule.
- No response sent to a browser contains a raw filesystem path.
- No email-only or otherwise unverified login route can create an authenticated session.
- No routine playback update uploads a full library/manuscript snapshot.
- A non-technical user can install and run the chosen delivery target without manually starting Python, Node, or a worker.
- pnpm lint, pnpm typecheck, pnpm test, the focused Playwright core flow, and Python sidecar tests pass in the supported environment and CI.

## Current system map

### Primary user paths

1. Text path

   Import page -> pasted/TXT text -> browser localStorage draft/library -> WorkspaceSync full snapshot -> SQLite synced_books -> sample/full generation APIs -> sync_jobs -> scripts/job-worker.mjs -> src/lib/backend/tts.ts -> Python Kokoro sidecar -> WAV files -> generated output metadata -> protected audio route -> player.

2. Imported audiobook path

   Import page -> MP3/M4B Blob in browser IndexedDB -> metadata placeholder in localStorage/sync snapshot -> player opens the original Blob. It does not transcribe or re-narrate the recording.

3. Playback state

   Player -> localStorage playback state and library timestamps -> browser events -> WorkspaceSync -> full snapshot POST -> SQLite. Frequent media updates can therefore trigger repeated whole-library synchronization.

4. Account path

   Email and display name -> upsertUserByEmail -> account session row -> signed cookie -> linked workspaces. Possession of the email address is currently sufficient to receive a valid session.

5. Social/discovery path

   Browser local social/discovery state -> full sync snapshot -> public social tables and routes -> community UI, reporting, and moderation.

### Main structural hotspots

- src/lib/backend/sqlite.ts: approximately 3,635 lines and responsible for schema creation, auth, sessions, sync, generation, artifacts, jobs, social data, moderation, and reporting.
- src/app/books/[bookId]/page.tsx: approximately 1,784 lines.
- src/app/import/page.tsx: approximately 1,256 lines.
- src/components/player/now-playing.tsx: approximately 1,240 lines.
- src/app/player/[bookId]/page.tsx: approximately 1,103 lines.
- src/components/library/continue-listening-row.tsx: approximately 959 lines.
- src/lib/backend/validate-library-sync.ts: approximately 826 lines.
- src/app/jobs/page.tsx: approximately 812 lines.
- tests/e2e/core-loop.spec.ts: approximately 658 lines and stale relative to the current UI.

## Review findings

### Lens 1: overbuilt, redundant, or safe to cut

- Community, discovery, editions, circles, moments, sharing, reporting, and moderation are extensive while the core generated player is incomplete.
- Account sessions, workspace switching, device/session timelines, and cloud-sync cards are premature for a local single-user v1.
- Jobs, backend health, queue details, and worker status are exposed as customer navigation instead of internal diagnostics.
- Listening modes are presentation-only metadata; synthesis does not implement ambient or immersive sound.
- Render-history comparison, taste profiles, streaks, quotes, and extensive home-dashboard cards add cognitive load before the first book can play reliably.
- Several authored components appear unreferenced: import-dropzone, import-review-panel, demo-mode-card, home-next-step-card, library-hero, sample-player, journey-hero, mode-selector, narrator-picker, and the repository interfaces.
- Existing product-reset documents overlap and should be consolidated after the implementation truth is settled.

### Lens 2: fragile, unclear, or likely to break

- Generated playback toggles React state but does not consistently play or synchronize the generated audio element. Progress and a 132-second chapter duration are simulated.
- Newly created playback state starts at 43 seconds, which is misleading.
- The sleep timer cycles labels but does not count down and pause actual media.
- Query-string narrator/mode presets can change the displayed labels without changing the artifact being heard.
- A sample request can be treated as ready before a playable output exists.
- Audio routes read whole WAV files into memory, omit Range support, and therefore make long-book seeking and memory use unreliable.
- Full-book assembly retains all chapter buffers and concatenates them in memory.
- Sidecar render files are copied but not removed, causing disk growth.
- Job completion is not a single transaction. Partial history/output rows can survive a failure.
- A running sample can be cancelled during synthesis and then completed because completion does not reject cancelled jobs.
- Running jobs are never reclaimed after a worker crash.
- Generation endpoints accept arbitrary identifiers and values without proving that the book exists in the active workspace.
- Full manuscripts are held in localStorage and repeatedly serialized into whole-library snapshots.
- Snapshot reconciliation is destructive, last-writer-wins, and has no revision/ETag conflict protection.
- Import IDs based on the current array length can collide after deletions and overwrite another book.
- Imported audio Blobs, generated artifacts, job rows, and history lack complete per-book cleanup and retention.
- SQLite schema changes are ad hoc rather than versioned migrations.
- The dependency baseline is not reproducible: local Node is 24, CI uses Node 22, pnpm is unpinned in CI, package.json’s pnpm.overrides is ignored by pnpm 11, node_modules is incomplete, and pnpm-lock.yaml already contains a user modification.
- CI omits the Python sidecar tests, Playwright core flow, and a build check.

### Lens 3: missing capabilities required by the goal

- There is no implemented path that changes the narrator of an uploaded MP3/M4B.
- There is no implemented EPUB, PDF, or DOCX extraction despite documentation and validation implying broader support.
- There is no non-technical installation or automatic sidecar lifecycle.
- There are no honest, playable voice previews before generation.
- The player lacks reliable generated-media control and recovery.
- There is no bounded import policy for size, text length, chapters, or storage.
- There is no clear retention/privacy contract.
- There is no real authentication if the product remains hosted.
- There is no end-to-end test that proves audible generated media advances, seeks, sleeps, survives reload, and resumes.
- There are no agreed release-level performance or reliability targets.

### Lens 4: where the structure fights the goal

- A private local TTS engine is paired with hosted-web/account/community architecture. The delivery models conflict.
- Browser localStorage, IndexedDB, SQLite, and filesystem artifacts all act as partial sources of truth.
- The root WorkspaceSync uploads broad state on general browser events, coupling small player actions to the whole application.
- Huge route components combine data restoration, orchestration, business rules, social features, and presentation.
- The central SQLite module prevents isolated testing and makes unrelated changes collide.
- The primary navigation presents system internals and community concepts before the core Library -> Add book -> Choose voice -> Listen path.
- Unused repository interfaces describe an abstraction that the implementation does not follow; they add vocabulary without creating a boundary.
- Tests primarily verify labels, route payloads, and social/backend behavior rather than actual listening behavior.

## Execution rules for the implementation model

These rules are mandatory:

1. Read AGENTS.md, DECISIONS.md, PLAN.md, SECURITY.md, and tasks/lessons.md at the beginning of every resumed execution session.
2. Execute exactly one numbered task per turn.
3. Before editing, run git status --short and confirm the task changes no more than three files.
4. Preserve unrelated work. In particular, do not overwrite the existing pnpm-lock.yaml modification until Task 1.2 explicitly reconciles it.
5. Use apply_patch for file edits. Do not run formatting-only passes.
6. Do not add a package without explaining the need and receiving explicit approval.
7. Mark every task touching auth, API routes, environment variables, filesystem paths, or client-visible data as a security-sensitive change.
8. Start each behavior change with a focused test in the same task; run it red, implement the smallest fix, then run it green.
9. After every task, run the focused verification and then:

       pnpm lint
       pnpm typecheck
       pnpm test

10. Also run Python or Playwright checks when the task says so.
11. Never call a task complete while a required check is failing. If the environment prevents a check, report the exact command and error.
12. After three failed attempts on the same blocker, stop and provide the attempts, cause, and two or three options.
13. Record architectural decisions in DECISIONS.md. After a user correction, append the resulting rule to tasks/lessons.md and count that file toward the three-file limit.
14. Commit only after the user asks. Do not mix tasks in one commit.

## Priority and leverage

| Rank | Work | Reason |
| --- | --- | --- |
| P0 | Resolve the product contract and delivery model | Every later architecture decision depends on it. |
| P0 | Restore a reproducible test baseline | No safe implementation or handoff is possible without trustworthy gates. |
| P0 | Remove unsafe authentication exposure | The current email-only route is a stop-ship account-takeover risk if hosted. |
| P0 | Make generated playback real | Listening is the product’s central promise and is currently simulated. |
| P0 | Make import claims truthful | The current audio and document paths do not deliver narrator replacement as implied. |
| P1 | Harden generation, streaming, cancellation, recovery, and retention | Reliability for full books depends on these paths. |
| P1 | Establish one source of truth for books and progress | Current full-snapshot synchronization is fragile and wasteful. |
| P1 | Reduce the everyday UX to the core loop | Non-technical users should not need to understand jobs, workspaces, or social graphs. |
| P2 | Bundle the runtime and add release-level verification | Required for a polished non-technical product. |
| P3 | Delete dormant code and split structural hotspots | Do this after behavior is stable so cleanup does not hide regressions. |

# Ordered implementation plan

## Phase 0 — freeze the product contract

### Task 0.1 — record the answered product decisions

Priority: P0

What:

- Record explicit answers to Q1–Q9.
- Replace stale architectural claims about OpenAI/mock TTS with the chosen delivery design.
- State whether auth, cloud sync, social, imported original audio, and listening modes are in or out of v1.

Why:

The repository currently contains mutually incompatible product narratives. Implementation must have one contract.

Files:

- DECISIONS.md
- PLAN.md
- SECURITY.md

Order:

1. Add a dated decision entry for each answered question.
2. Update PLAN.md’s target architecture and v1 boundary.
3. Update SECURITY.md’s local-versus-hosted trust boundary, rights rule, retention rule, and authentication stance.

Verify:

- Search those three files for OpenAI, mock fallback, EPUB, PDF, DOCX, account, cloud, social, ambient, and immersive.
- Every remaining statement must agree with the recorded decisions.
- Run the full gate.

Security-sensitive: yes; this establishes auth, privacy, data exposure, and local/hosted boundaries.

## Phase 1 — make the project reproducible

### Task 1.1 — pin Node/pnpm policy and move overrides to supported configuration

Priority: P0

What:

- Add an exact packageManager value for the selected pnpm release.
- Declare the supported Node major.
- Move flatted and undici overrides from package.json’s ignored pnpm field to the workspace-root pnpm configuration supported by the pinned version.

Why:

CI currently installs “latest” pnpm, local pnpm 11 ignores package.json’s pnpm field, and local Node differs from CI.

Files:

- package.json
- pnpm-workspace.yaml

Order:

1. Use the already observed pnpm 11.3.0 only if a clean dry-run confirms it can consume lockfileVersion 9.0; otherwise stop and document the exact compatible version before editing.
2. Add packageManager and engines without changing dependency ranges.
3. Move, do not duplicate, overrides.

Verify:

- corepack pnpm --version prints the exact pinned version.
- pnpm config get overrides reflects the workspace overrides.
- Run the full gate. The known incomplete node_modules state may still block it; report rather than masking the failure.

Security-sensitive: yes; dependency overrides affect known vulnerable transitive packages.

### Task 1.2 — reconcile the dirty lockfile and restore dependencies

Priority: P0

What:

- Preserve and understand the user’s existing pnpm-lock.yaml diff.
- Regenerate only the lockfile changes required by Task 1.1 using the pinned toolchain.
- Restore node_modules from the reconciled frozen lock.

Why:

The current dependency tree is incomplete. Lint was attempted three ways and failed because pnpm wanted to reconcile node_modules and direct launchers referenced missing modules.

Files:

- pnpm-lock.yaml

Order:

1. Save git diff -- pnpm-lock.yaml in the execution report before running install.
2. Explain whether the existing removal of root overrides and added libc annotations are expected under the pinned pnpm.
3. If any part is ambiguous, stop and ask before replacing it.
4. Run pnpm install --lockfile-only, inspect the diff, then pnpm install --frozen-lockfile.

Verify:

- git diff -- pnpm-lock.yaml contains no unexplained dependency upgrades.
- pnpm install --frozen-lockfile succeeds a second time without changing tracked files.
- Run the full gate.

Security-sensitive: yes; lockfile integrity and dependency overrides are security controls.

### Task 1.3 — align CI with the supported runtime and full baseline

Priority: P0

What:

- Pin CI to the same pnpm and Node policy.
- Add a build check and Python sidecar unit tests.
- Keep Playwright out of the required gate until Task 3.7 produces a deterministic core test; add it then.

Why:

CI currently uses latest pnpm and does not exercise the local TTS sidecar or production build.

Files:

- .github/workflows/ci.yml
- tasks/test-hygiene.md

Order:

1. Replace version: latest with the exact pinned pnpm version.
2. Keep Node on the selected supported major.
3. Add pnpm build.
4. Set up Python using an explicit supported version, install tts_sidecar/requirements.txt, and run python -m unittest discover tts_sidecar.
5. Update the hygiene note with the repaired baseline and any remaining Windows-only SQLite cleanup failure.

Verify:

- A local YAML review shows no unpinned runtime.
- pnpm build succeeds.
- python -m unittest discover tts_sidecar succeeds.
- Run the full gate.

Security-sensitive: yes; CI and dependency installation are supply-chain boundaries.

## Phase 2 — remove stop-ship exposure and reduce the first-use surface

Execute this phase as written only if Q6 confirms accounts/cloud/social are out of v1. If hosted accounts remain in scope, stop and create a separate real-authentication plan using verified login; never patch the email-only route into production.

### Task 2.1 — reduce primary navigation to the core loop

Priority: P0

What:

- Show only Library and Add book in standard navigation.
- Remove Community and Jobs from player navigation.
- Remove infrastructure/community promises from the shell description.

Why:

Jobs and community are implementation concepts that distract non-technical users.

Files:

- src/components/shared/app-shell.tsx

Order:

1. Rename Home to Library and Import to Add book.
2. Remove Community and Jobs links.
3. Replace the header description with one plain sentence about importing a book, choosing a voice, and listening.

Verify:

- Add or update a focused component test if a suitable shell test exists; otherwise verify through Task 3.7’s Playwright flow.
- Search app-shell.tsx for Community, Jobs, backend, workspace, and mode; none should remain in user copy.
- Run the full gate.

### Task 2.2 — replace the dashboard with a library-first home

Priority: P0

What:

- Remove account, backend, social, discovery, taste, stats, circle, quote, and portfolio-demo sections from the home route.
- Retain one Add book action and one list of recent/continue-listening books.

Why:

The home page imports more than two dozen feature components and makes the user understand the system before listening.

Files:

- src/app/page.tsx

Order:

1. Remove social/discovery/account/backend queries and imports.
2. Keep the smallest server data read required for the library list.
3. Render empty, loading, and populated library states with one primary action each.

Verify:

- src/app/page.tsx no longer imports from src/features/social or src/features/discovery.
- The home route contains no account, workspace, cloud, jobs, moderation, circle, trend, taste, streak, or quote sections.
- Run the full gate and the home portion of the Playwright test.

Security-sensitive: yes; removes account and backend data from a client-visible page.

### Task 2.3 — remove email-only session creation

Priority: P0

What:

- Delete the account endpoint that creates a session from an email address.
- Delete its tests only after replacing security coverage with an assertion that the route is absent or cannot authenticate.

Why:

Anyone who knows an existing email address can currently receive a valid session for that user.

Files:

- src/app/api/auth/account/route.ts
- src/app/api/auth/account/route.test.ts

Order:

1. Confirm Task 2.2 removed active callers.
2. Delete the route.
3. Replace or remove the route test so no test encodes email-only login as desired behavior.
4. Search for POST /api/auth/account callers and remove none outside this task; if callers remain, stop and re-plan within the three-file limit.

Verify:

- rg "/api/auth/account|upsertUserByEmail" src shows no client-accessible session-creation path.
- An HTTP POST to /api/auth/account returns 404.
- Run the full gate.

Security-sensitive: yes; authentication stop-ship.

### Task 2.4 — remove public social mutation APIs

Priority: P0

What:

- Remove reporting and moderation endpoints in two separate turns.

Why:

They expose a public/community data model that is out of the recommended private v1 and broaden the attack surface.

Files, turn A:

- src/app/api/social/report/route.ts
- src/app/api/social/report/route.test.ts

Files, turn B:

- src/app/api/social/moderation/route.ts
- src/app/api/social/moderation/route.test.ts

Order:

1. Execute turn A, verify, and stop.
2. Execute turn B on the next turn, verify, and stop.

Verify:

- Each removed endpoint returns 404.
- rg "/api/social/(report|moderation)" src finds no callers after the social UI is removed.
- Run the full gate after each turn.

Security-sensitive: yes; removes public data mutation.

### Task 2.5 — remove direct social pages

Priority: P1

What:

- Delete the direct social route pages after navigation and home callers are gone.

Why:

Hidden navigation is not a true scope cut if the pages remain addressable.

Files, turn A:

- src/app/social/page.tsx
- src/app/social/editions/[editionId]/page.tsx
- src/app/social/moments/[momentId]/page.tsx

Files, turn B:

- src/app/social/circles/[circleId]/page.tsx
- src/app/social/circles/start/page.tsx

Order:

1. Run rg 'href="/social|/social/' src and remove callers in an earlier or separately planned task if any remain.
2. Execute turn A, verify, and stop.
3. Execute turn B, verify, and stop.

Verify:

- All former social URLs return 404.
- pnpm build finds no dangling imports.
- Run the full gate after each turn.

Security-sensitive: yes; removes client-visible public data routes.

## Phase 3 — make generated playback real

### Task 3.1 — implement one real media controller

Priority: P0

What:

- Introduce a reusable media-controller hook for every playable source.
- Make NowPlaying control the HTMLAudioElement for imported, current generated, and archived generated audio.
- Remove simulated duration/progress and the 43-second default.

Why:

Generated playback is the core promise and currently changes UI state without reliably controlling generated audio.

Files:

- src/components/player/use-media-controller.ts
- src/components/player/use-media-controller.test.tsx
- src/components/player/now-playing.tsx

Order:

1. Add tests for play promise handling, pause, loadedmetadata, durationchange, timeupdate, seeking, skip clamping, playback rate, ended, and media errors.
2. Add a test proving a sleep deadline pauses the element exactly once.
3. Implement the hook around a single audio ref.
4. Connect every NowPlaying action and displayed value to the hook.
5. Delete fixed chapterDurationSeconds and all timer-based fake progress.
6. Initialize new playback at zero unless persisted progress exists.

Verify:

- The focused hook tests pass.
- Manual media-event simulation changes the visible timer and progress.
- A rejected audio.play promise produces an actionable user error.
- Run the full gate.

### Task 3.2 — bind labels and controls to the exact artifact

Priority: P0

What:

- Resolve playback from an explicit artifact ID or a concrete latest-output record.
- Remove narrator/mode query presets that can relabel a different audio file.
- Treat a missing/mismatched artifact as unavailable, never as a playable sample.

Why:

The UI can currently say Sloane/immersive while playing another render.

Files:

- src/lib/playback/resolve-playback-source.ts
- src/lib/playback/resolve-playback-source.test.ts
- src/app/player/[bookId]/page.tsx

Order:

1. Test current sample, current full book, archived artifact, imported original audio, missing artifact, and mismatched book/workspace cases.
2. Make the resolver return audio URL, exact narrator metadata, artifact kind, artifact ID, and readiness.
3. Remove display metadata derived only from narrator/mode query parameters.
4. Reduce the player page’s repeated sync fetches to one data-loading path as an interim step.

Verify:

- Changing query labels without an artifact cannot change displayed narrator metadata.
- Archived URLs can play only an artifact belonging to the selected book/workspace.
- Run focused tests and the full gate.

Security-sensitive: yes; artifact ownership and client-visible metadata.

### Task 3.3 — add bounded HTTP audio streaming

Priority: P0

What:

- Add a shared server helper that validates Range headers and streams only the requested byte interval.
- Return 200 for full requests, 206 for valid ranges, and 416 for invalid ranges.

Why:

Reading a full audiobook into a Buffer prevents reliable seeking and can exhaust memory.

Files:

- src/lib/backend/http-audio.ts
- src/lib/backend/http-audio.test.ts

Order:

1. Test no Range, open-ended range, suffix range, single-byte range, out-of-bounds range, multiple-range rejection, HEAD metadata, and missing file.
2. Use stat plus a bounded stream; do not read the whole file.
3. Set Content-Type, Content-Length, Accept-Ranges, Content-Range when applicable, and no-store.

Verify:

- Focused tests assert exact status codes and headers.
- A large fixture request returns only the requested number of bytes.
- Run the full gate.

Security-sensitive: yes; filesystem access and HTTP parsing.

### Task 3.4 — stream the current generated output route

Priority: P0

What:

- Use the shared streaming helper for the current generated output route.
- Preserve workspace ownership checks.

Why:

The route currently reads the complete WAV into memory.

Files:

- src/app/api/audio/generated/[bookId]/route.ts
- src/app/api/audio/generated/[bookId]/route.test.ts

Order:

1. Extend tests for 206, Content-Range, 416, unauthenticated/no-workspace behavior, wrong workspace, and missing asset.
2. Replace Buffer response construction with the helper.
3. Ensure session activity updates do not run before ownership and asset checks.

Verify:

- Range tests pass.
- Existing cross-workspace denial tests remain green.
- Run the full gate.

Security-sensitive: yes; protected audio and workspace ownership.

### Task 3.5 — stream archived artifact output

Priority: P0

What:

- Apply the same range and ownership behavior to archived artifact playback.

Why:

Current and archived audio must have identical reliability and security semantics.

Files:

- src/app/api/audio/generated/artifacts/[artifactId]/route.ts
- src/app/api/audio/generated/artifacts/[artifactId]/route.test.ts

Order:

1. Add the same range and cross-workspace tests as Task 3.4.
2. Use the shared helper.
3. Confirm the artifact book ID is used for activity metadata only after access succeeds.

Verify:

- Focused route tests pass.
- Invalid or cross-workspace artifact IDs reveal no metadata.
- Run the full gate.

Security-sensitive: yes; protected archived audio.

### Task 3.6 — contain generated file paths and stop exposing them

Priority: P0

What:

- Resolve every generated path beneath the configured generated-audio root.
- Reject absolute paths and traversal outside that root.
- Define a browser-safe generation DTO that contains artifact URL/ID, not assetPath or chapterAssetPaths.

Why:

The storage reader trusts database paths, and raw filesystem paths are serialized in generation summaries.

Files:

- src/lib/backend/audio-storage.ts
- src/lib/backend/audio-storage.test.ts
- src/lib/backend/types.ts

Order:

1. Test normal relative paths, ../ traversal, absolute paths, prefix-confusion paths, and symlink behavior for the supported OS.
2. Centralize root resolution.
3. Add a public DTO type with no filesystem fields.
4. Do not update more than two response producers in this task; if type errors reveal more callers, list them for the next task.

Verify:

- Traversal and absolute-path tests pass.
- rg "assetPath|chapterAssetPaths" src/app src/components shows no value intentionally serialized to a client; any remaining occurrence must be explained and handled in a follow-up task of at most three files.
- Run the full gate.

Security-sensitive: yes; filesystem containment and data exposure.

### Task 3.7 — replace label-only E2E coverage with a real listening proof

Priority: P0

What:

- Rewrite the core Playwright flow around the reduced product.
- Prove actual media time advances, seeking changes currentTime, reload restores progress, and sleep timer pauses.

Why:

The existing 658-line scenario is stale and checks text/buttons rather than actual media behavior.

Files:

- tests/e2e/core-loop.spec.ts
- .github/workflows/ci.yml

Order:

1. Use an existing deterministic WAV fixture and stub only generation latency, not the browser media controller.
2. Cover empty library -> add book -> choose voice -> sample ready -> listen.
3. Assert audio.currentTime advances and responds to seek.
4. Reload and assert resume within a small tolerance.
5. Add the focused Playwright project to CI after it is stable.

Verify:

- pnpm test:e2e --grep "core listening" passes repeatedly.
- CI runs this focused flow.
- Run the full gate.

## Phase 4 — make import behavior truthful and bounded

This phase assumes the recommended TXT/EPUB source contract. If Q1 chooses existing-audio replacement, stop here and write a separate spike plan for transcription, source separation, alignment, and rights before claiming narrator replacement.

### Task 4.1 — enforce honest formats and resource limits

Priority: P0

What:

- Accept only formats that are implemented at that point.
- Add explicit file-size, text-length, title-length, and chapter-count limits.
- Show plain-language validation errors before persistence or generation.

Why:

The current validator treats future EPUB/PDF/DOCX support as supported, checks mostly extensions, and has no meaningful bounds.

Files:

- src/lib/import/extract-text.ts
- tests/unit/import-validation.test.ts
- src/app/import/page.tsx

Order:

1. Add boundary tests for every limit and extension/MIME mismatch.
2. Make the supported-extension predicate return true only for working formats.
3. Reject empty/whitespace-only text and unreasonable counts.
4. Update UI accept attributes and copy to exactly match.

Verify:

- Tests prove one byte below/at/above each relevant limit.
- PDF/DOCX cannot be described as supported until implemented.
- Oversized input never reaches localStorage, IndexedDB, SQLite, or the generation API.
- Run the full gate.

Security-sensitive: yes; input validation and denial-of-service bounds.

### Task 4.2 — replace array-length book IDs with UUIDs

Priority: P0

What:

- Generate collision-resistant book IDs independent of library length.
- Decouple E2E fixtures from production ID generation.

Why:

Deleting book 1 while book 2 remains can cause the next import to reuse book 2’s ID and overwrite it.

Files:

- src/lib/library/local-library.ts
- tests/unit/local-library.test.ts

Order:

1. Add a failing delete-then-import collision test.
2. Use crypto.randomUUID with a clear prefix if desired.
3. Make tests assert ID uniqueness/shape rather than exact demo-book-N values.

Verify:

- Repeated imports after arbitrary deletions never collide.
- Run focused tests and the full gate.

### Task 4.3 — separate sample request state from playable readiness

Priority: P0

What:

- Represent requested, queued, running, completed-with-artifact, failed, and cancelled states distinctly.
- Unlock Listen only for a completed, accessible artifact matching the selected book and voice.

Why:

Writing sample request metadata before the worker succeeds can make a reload expose a dead audio URL.

Files:

- src/lib/library/local-library.ts
- tests/unit/local-library.test.ts
- src/app/books/[bookId]/page.tsx

Order:

1. Test failure/reload, cancellation/reload, stale request, mismatched voice, missing artifact, and successful artifact.
2. Remove readiness inferred from a local request alone.
3. Render retry and actionable failure states without pretending audio exists.

Verify:

- No Listen link appears for queued, failed, cancelled, stale, or missing artifacts.
- Run focused tests and the full gate.

### Task 4.4 — approve and lock an EPUB parser

Priority: P1

What:

- Select one maintained EPUB/ZIP parser with the smallest justified dependency surface.
- Add it only after explicit dependency approval.

Why:

EPUB is a ZIP/container format; robust parsing should not be improvised with ad hoc string handling.

Files:

- package.json
- pnpm-lock.yaml

Order:

1. Compare candidate maintenance, license, browser/server compatibility, transitive dependency count, and ability to reject zip bombs/path traversal.
2. Present the recommendation and why a dependency is necessary.
3. Wait for approval.
4. Add the exact dependency and regenerate the lock with the pinned pnpm.

Verify:

- pnpm install --frozen-lockfile succeeds without lock drift.
- Dependency license and transitive tree are recorded in the task report.
- Run the full gate.

Security-sensitive: yes; parses untrusted archive input and changes dependencies.

### Task 4.5 — implement bounded EPUB extraction

Priority: P1

What:

- Extract the EPUB spine in reading order.
- Preserve chapter titles and normalize text.
- Reject encrypted/DRM-protected, malformed, oversized, deeply nested, or decompression-bomb content.

Why:

EPUB is the most useful non-technical source format for the recommended v1.

Files:

- src/lib/import/extract-text.ts
- tests/unit/import-validation.test.ts
- src/app/import/page.tsx

Order:

1. Add small legal fixtures or programmatically constructed test archives with known contents; if a new fixture file is needed, count it and split the UI update into a later turn.
2. Test spine order, entities, missing metadata, malformed XML, encrypted content, compression ratio, entry count, and total expanded bytes.
3. Implement extraction and update the UI only after tests pass.

Verify:

- Extracted chapters match fixture order and text.
- Unsupported/unsafe EPUBs fail with non-technical errors.
- No archive entry writes to the filesystem.
- Run the full gate.

Security-sensitive: yes; archive/XML parsing and resource limits.

### Task 4.6 — decide the imported MP3/M4B branch

Priority: P0 decision gate

What:

- Execute exactly one branch:
  - Branch A: remove MP3/M4B from v1 narrator-change import and clearly defer original-audio playback.
  - Branch B: label it “Play original audiobook” as a separate feature with no narrator-change claim.
  - Branch C: if true audio replacement is required, stop and create a new technical discovery plan; do not implement a partial rename.

Why:

The current path bypasses narration and is the largest mismatch with the stated product purpose.

Files for Branch A:

- src/app/import/page.tsx
- src/lib/import/extract-text.ts
- tests/unit/import-validation.test.ts

Files for Branch B:

- src/app/import/page.tsx
- src/app/player/[bookId]/page.tsx
- src/components/player/now-playing.tsx

Verify:

- No copy implies an uploaded audio file will receive a different narrator.
- The chosen behavior has an E2E assertion.
- Run the full gate.

Security-sensitive: yes; user-provided media and product rights boundary.

## Phase 5 — harden generation and the local TTS pipeline

### Task 5.1 — centralize generation request validation

Priority: P0

What:

- Validate book IDs, workspace ownership, supported voice IDs, fixed compatibility mode, chapter count, text length, and duplicate active jobs before enqueue.

Why:

Current routes accept arbitrary narrator/mode/book values and let the worker fail later.

Files:

- src/lib/backend/validate-generation-request.ts
- src/lib/backend/validate-generation-request.test.ts

Order:

1. Add table-driven tests for missing book, wrong workspace, unsupported voice, invalid count, oversized text, and duplicate active job.
2. Return a typed success/error result with a safe user message.
3. Use an allowlisted voice catalog; do not trust client strings.

Verify:

- Focused tests cover every branch.
- No raw manuscript or filesystem detail appears in errors.
- Run the full gate.

Security-sensitive: yes; API input and workspace authorization.

### Task 5.2 — enforce validation on sample enqueue

Priority: P0

What:

- Apply Task 5.1 to sample generation and remove arbitrary mode input from the public contract.

Files:

- src/app/api/jobs/sample-generation/route.ts
- src/app/api/jobs/sample-generation/[jobId]/route.test.ts

Order:

1. Add wrong-workspace, unknown-book, unsupported-voice, oversized-book, and duplicate-job tests.
2. Enqueue only the server-resolved book and voice.
3. Return a browser-safe DTO with no assetPath.

Verify:

- Invalid requests create no job row.
- Valid requests retain workspace ownership.
- Run focused tests and the full gate.

Security-sensitive: yes; generation API and data exposure.

### Task 5.3 — enforce validation on full-book enqueue

Priority: P0

What:

- Derive chapter count from the stored book instead of trusting the client.
- Apply the same ownership and active-job rules as sample generation.

Files:

- src/app/api/jobs/full-book-generation/route.ts
- src/app/api/jobs/full-book-generation/[jobId]/route.test.ts

Order:

1. Add tests proving client chapterCount is ignored/rejected.
2. Resolve the stored manuscript and its chapters server-side.
3. Return a browser-safe DTO.

Verify:

- A client cannot inflate work by submitting an arbitrary chapter count.
- Cross-workspace enqueue fails without metadata leakage.
- Run focused tests and the full gate.

Security-sensitive: yes; generation API, resource use, and workspace data.

### Task 5.4 — stop the Python sidecar from retaining render files

Priority: P1

What:

- Return generated WAV bytes from the render endpoint instead of a shared filesystem path.
- Keep no permanent sidecar render copy.

Why:

The sidecar currently leaves a second file for every render after the app copies it.

Files:

- tts_sidecar/server.py
- tts_sidecar/test_server.py

Order:

1. Test health, invalid voice, empty/oversized text, engine error, Content-Type, and WAV body.
2. Stream or return the generated bytes.
3. Use temporary files only if Kokoro requires them and delete them in finally.

Verify:

- Python tests pass.
- Repeated renders leave no new files in data/local-tts/renders.
- Run the full gate.

Security-sensitive: yes; local API input and filesystem retention.

### Task 5.5 — consume byte responses in the TypeScript TTS client

Priority: P1

What:

- Update the client to consume audio bytes directly.
- Fail closed on sidecar unavailability, invalid MIME, oversized response, timeout, or corrupt WAV.

Why:

This completes Task 5.4 and removes path sharing between processes.

Files:

- src/lib/backend/tts.ts
- src/lib/backend/tts.test.ts

Order:

1. Add mocked HTTP tests for all failure modes and success.
2. Enforce request timeout and response-size bound.
3. Return a typed audio result; never silently use mock audio in production.

Verify:

- Focused tests pass.
- Search production code for automatic mock fallback; none remains unless explicitly limited to test fixtures.
- Run the full gate and Python tests.

Security-sensitive: yes; local service boundary and untrusted response bounds.

### Task 5.6 — make completion transactional and reject cancelled jobs

Priority: P1

What:

- Wrap output/history/artifact/job completion writes in one database transaction.
- Allow completion only from running status.
- Roll back all rows on any write failure.

Why:

Partial records survive failures, and cancelled samples can be completed.

Files:

- src/lib/backend/sqlite.ts
- src/lib/backend/sqlite.test.ts

Order:

1. Add tests for queued completion rejection, cancelled completion rejection, duplicate completion, injected mid-transaction failure, and successful atomic completion.
2. Move all completion writes inside begin/commit/rollback.
3. Return a clear state-conflict result rather than silently succeeding.

Verify:

- Failure tests leave zero partial output/history/artifact rows.
- Cancelled remains cancelled.
- Run focused tests and the full gate.

Security-sensitive: yes; integrity of generated user data.

### Task 5.7 — recheck cancellation around synthesis

Priority: P1

What:

- Check job status before synthesis, after synthesis, and before publishing each artifact.
- Delete unpublished temporary output on cancellation or failure.

Why:

Cancellation can race with a long sidecar call.

Files:

- scripts/job-worker.mjs
- scripts/job-worker-lib.mjs
- src/lib/backend/job-worker.test.ts

Order:

1. Extract a testable single-job execution function.
2. Test cancellation before call, during call, after call, and between chapters.
3. Publish only after a final running-state check.
4. Clean temporary files in finally.

Verify:

- No cancelled job becomes completed.
- No cancelled job leaves a published artifact or temporary file.
- Run focused tests, Python tests, and the full gate.

Security-sensitive: yes; filesystem cleanup and job integrity.

### Task 5.8 — recover stale running jobs

Priority: P1

What:

- Add leases/heartbeat timestamps to claimed jobs.
- Requeue safe stale work or fail it with a retryable reason after the configured lease expires.

Why:

A worker crash currently strands running jobs forever.

Files:

- src/lib/backend/sqlite.ts
- src/lib/backend/sqlite.test.ts

Order:

1. Test fresh lease, expired lease, concurrent claim, maximum retry count, and idempotent reclaim.
2. Make claim atomic.
3. Distinguish user cancellation from worker loss.

Verify:

- Simulating a crash and lease expiry makes the job retryable exactly once.
- Two workers cannot claim the same job.
- Run focused tests and the full gate.

Security-sensitive: yes; job state and resource consumption.

### Task 5.9 — assemble full books without retaining every chapter Buffer

Priority: P1

What:

- Write chapter results to bounded temporary storage and assemble/stream sequentially.
- Avoid Buffer.concat across the complete book.

Why:

Long books can exhaust worker memory.

Files:

- scripts/job-worker.mjs
- src/lib/backend/audio-storage.ts
- src/lib/backend/audio-storage.test.ts

Order:

1. Add a test that assembles many synthetic chapters while asserting bounded peak buffering at the code boundary.
2. Validate compatible WAV parameters before concatenating PCM data.
3. Write the final header and append chapter data sequentially.
4. Clean all parts on success, failure, and cancellation.

Verify:

- The final WAV duration/data length matches the sum of chapters.
- Incompatible chapters fail without a partial final file.
- Temporary files are removed in all paths.
- Run focused tests and the full gate.

Security-sensitive: yes; filesystem use and resource bounds.

### Task 5.10 — implement artifact retention and per-book deletion

Priority: P1

What:

- Define and enforce retention for samples, superseded full books, failed temporary files, job rows, and history.
- Delete files only after validating their generated-root containment.

Why:

Storage grows without bound and book removal does not completely remove its data.

Files:

- src/lib/backend/audio-storage.ts
- src/lib/backend/sqlite.ts
- src/lib/backend/sqlite.test.ts

Order:

1. Add tests for removing one book without touching another, retained latest artifacts, expired history, missing files, and malicious paths.
2. Delete database metadata and files in a recoverable order; record failures rather than hiding them.
3. Do not use broad recursive deletion.

Verify:

- A book-delete integration test leaves no rows/files for that book and preserves every other book.
- Retention is documented in SECURITY.md in a separate documentation task.
- Run focused tests and the full gate.

Security-sensitive: yes; destructive filesystem and user-data deletion.

### Task 5.11 — add honest voice previews

Priority: P1

What:

- Define a server-owned catalog mapping product voice names to Kokoro voice IDs.
- Provide a bounded preview endpoint for a fixed short sentence and cache its result.

Why:

Users need to hear a narrator before generating their book, and client strings must not select arbitrary sidecar voices.

Files:

- src/lib/voices/catalog.ts
- src/app/api/voices/[voiceId]/preview/route.ts
- src/app/api/voices/[voiceId]/preview/route.test.ts

Order:

1. Define stable IDs, display names, descriptions, and engine mappings.
2. Test allowlisting, workspace-independent safe access, cache hit, sidecar failure, and Range playback if previews are stored.
3. Return playable audio with no manuscript input.

Verify:

- Each displayed voice plays audio produced by its exact mapped engine voice.
- Unknown IDs return 404 without exposing the internal catalog.
- Run focused tests, Python tests, and the full gate.

Security-sensitive: yes; API allowlist, local TTS access, and generated-file caching.

## Phase 6 — replace broad snapshot sync with explicit local data ownership

This phase assumes a local-first product with anonymous local workspace scoping and no account/cloud sync. If Q3 or Q6 chooses hosted/cloud behavior, stop and design verified auth, per-resource authorization, object storage, quotas, conflict resolution, and migrations before proceeding.

### Task 6.1 — add an explicit create/list books API

Priority: P1

What:

- Create books through a bounded API instead of a full library snapshot.
- Generate IDs server-side and store manuscript/chapter data in the authoritative local database/filesystem.

Why:

Full manuscripts do not belong in localStorage or repeated whole-state POSTs.

Files:

- src/app/api/books/route.ts
- src/app/api/books/route.test.ts
- src/lib/backend/sqlite.ts

Order:

1. Test valid create/list, size limits, empty text, excessive chapters, malformed JSON, wrong workspace, and duplicate idempotency key.
2. Add narrowly named SQLite functions; do not copy snapshot reconciliation.
3. Return browser-safe book metadata without full manuscript on list.

Verify:

- Creating one book writes it once and listing omits manuscript text.
- Oversized requests create no partial data.
- Run focused tests and the full gate.

Security-sensitive: yes; manuscript API, authorization, and data exposure.

### Task 6.2 — add get/delete book API with complete cleanup

Priority: P1

What:

- Fetch one authorized book and delete one book with its artifacts according to Task 5.10.

Files:

- src/app/api/books/[bookId]/route.ts
- src/app/api/books/[bookId]/route.test.ts
- src/lib/backend/sqlite.ts

Order:

1. Test same-workspace access, cross-workspace denial, missing book, delete idempotency, and cleanup.
2. Return manuscript only when the setup/generation screen explicitly needs it; prefer server-side generation access.
3. Never return assetPath.

Verify:

- Cross-workspace requests reveal no title or existence metadata.
- Delete proves database and file cleanup.
- Run focused tests and the full gate.

Security-sensitive: yes; private manuscript access and destructive deletion.

### Task 6.3 — move import persistence to the books API

Priority: P1

What:

- Submit completed imports once to the books API.
- Keep only small UI/cache metadata in browser storage.

Why:

The current import writes large drafts locally and relies on WorkspaceSync to copy them later.

Files:

- src/lib/client/books-api.ts
- src/lib/client/books-api.test.ts
- src/app/import/page.tsx

Order:

1. Test request shaping, abort, error mapping, retry/idempotency, and no manuscript logging.
2. Create the book only after validation/extraction succeeds.
3. Navigate using the server-returned ID.
4. Show a retryable plain-language error without duplicating the book.

Verify:

- Browser localStorage contains no full manuscript after import.
- Network inspection shows one bounded create request, not a full library snapshot.
- Run focused tests and the full gate.

Security-sensitive: yes; private manuscript transfer and client logging.

### Task 6.4 — load setup from the explicit book API

Priority: P1

What:

- Replace repeated /api/sync/library fetches in the setup page with one book fetch and explicit job fetches.

Why:

The setup page currently merges multiple local/backend sources and repeatedly downloads broad snapshots.

Files:

- src/app/books/[bookId]/page.tsx
- src/lib/client/books-api.ts

Order:

1. Identify the minimum setup view model: book metadata, chapters, selected voice, sample job, and artifacts.
2. Load it once through the explicit clients.
3. Remove full-snapshot restoration and social/default-taste merge logic.

Verify:

- Opening setup performs no /api/sync/library request.
- Reload produces the same selected book and artifact state.
- Run the full gate and setup Playwright segment.

Security-sensitive: yes; private book data loading.

### Task 6.5 — add an explicit progress endpoint and throttle writes

Priority: P1

What:

- Persist only book ID, artifact ID, position, duration, speed, chapter, and updated time.
- Write at a bounded cadence plus pause, unload, seek completion, and ended.

Why:

Frequent media events currently cascade into full library/manuscript synchronization.

Files:

- src/app/api/books/[bookId]/progress/route.ts
- src/app/api/books/[bookId]/progress/route.test.ts
- src/lib/backend/sqlite.ts

Order:

1. Test ownership, numeric bounds, stale artifact, monotonic revision, malformed input, and update frequency behavior at the client boundary later.
2. Store progress independently from book metadata.
3. Return a small revisioned DTO.

Verify:

- A progress update changes no manuscript/book row and creates no library-sync job.
- Cross-workspace updates fail.
- Run focused tests and the full gate.

Security-sensitive: yes; per-user progress API and authorization.

### Task 6.6 — connect the player to explicit progress persistence

Priority: P1

What:

- Use Task 6.5 from the real media controller.
- Remove touchLocalLibraryBook from timeupdate behavior.

Files:

- src/components/player/now-playing.tsx
- src/lib/playback/local-playback.ts
- tests/unit/local-playback.test.ts

Order:

1. Test cadence, pause flush, seek flush, unload flush, ended state, retry, and no write below the interval.
2. Keep optimistic local display but reconcile server revision on reload.
3. Do not upload full book metadata.

Verify:

- A 60-second playback session performs the agreed bounded number of small progress requests.
- No /api/sync/library request occurs.
- Run focused tests, the core Playwright test, and the full gate.

Security-sensitive: yes; client-to-server progress data.

### Task 6.7 — remove root WorkspaceSync

Priority: P1

What:

- Remove the global full-snapshot synchronizer and its client helper after all core callers use explicit APIs.

Why:

It couples unrelated browser events and uploads large/destructive state.

Files:

- src/app/layout.tsx
- src/components/shared/workspace-sync.tsx
- src/lib/backend/client-sync.ts

Order:

1. Prove no core flow depends on WorkspaceSync.
2. Remove the component from layout.
3. Delete the component and unused client helper.

Verify:

- rg "WorkspaceSync|client-sync|/api/sync/library" src finds only migration/deletion targets, not runtime core callers.
- Core Playwright flow survives reload.
- Run the full gate.

Security-sensitive: yes; removes broad private-data transfer.

### Task 6.8 — remove the snapshot API and validator

Priority: P1

What:

- Delete the broad sync route, route tests, and manual validator once all runtime callers are gone.

Why:

The 826-line parser has weak bounds and the reconciliation endpoint can delete newer state.

Files:

- src/app/api/sync/library/route.ts
- src/app/api/sync/library/route.test.ts
- src/lib/backend/validate-library-sync.ts

Order:

1. Confirm rg "/api/sync/library" src returns only these files.
2. Delete all three.
3. Leave database cleanup of old snapshot tables for the later migration task.

Verify:

- /api/sync/library returns 404.
- pnpm build has no dangling imports.
- Run the full gate.

Security-sensitive: yes; removes private snapshot ingestion and destructive reconciliation.

## Phase 7 — simplify the everyday experience

### Task 7.1 — reduce setup to voice preview, sample, and generate

Priority: P1

What:

- Replace the 1,700-line setup experience with a linear three-step screen.
- Remove presets, taste inheritance, social editions, mode choice, render comparison, and backend detail from everyday view.

Why:

Non-technical users need one obvious next action, not a control center.

Files:

- src/app/books/[bookId]/page.tsx
- src/components/voices/voice-choice.tsx
- src/components/voices/voice-choice.test.tsx

Order:

1. Build an accessible radio list with one Play preview action per voice.
2. Screen states: choose voice -> generate sample -> listen/accept -> generate book.
3. Keep job details behind a compact error/details disclosure only.
4. Use the exact artifact readiness from Task 4.3.

Verify:

- Keyboard-only flow can choose and preview a voice.
- At every state there is one visually primary next action.
- No mode, taste, social, job-queue, provider, asset-path, or workspace terminology appears.
- Run focused tests, core Playwright flow, and the full gate.

### Task 7.2 — reduce import to one source decision and one review

Priority: P1

What:

- Replace the 1,200-line import console with: choose file/paste text -> validate/preview title and chapters -> Add book.
- Remove social recommendations, default taste, editions, and backend-state panels.

Why:

The current import flow exposes future features and internal state before the user has a book.

Files:

- src/app/import/page.tsx
- src/components/import/import-source.tsx
- src/components/import/import-source.test.tsx

Order:

1. Make file picker and paste option mutually clear.
2. Show supported formats/limits before selection.
3. Show one review with title, author if available, chapter count, and any fixable errors.
4. Submit through Task 6.3.

Verify:

- A first-time user can finish the flow with keyboard and screen-reader labels.
- There is one primary action per state.
- Run focused tests, core Playwright flow, and the full gate.

### Task 7.3 — simplify the library list

Priority: P1

What:

- Show cover/placeholder, title, exact readiness, resume position, and one primary action.
- Remove social, taste, mode, backend provider, workspace, and render-history details.

Why:

ContinueListeningRow is nearly 1,000 lines and combines search, filters, generation, social, and storage recovery.

Files:

- src/components/library/continue-listening-row.tsx
- src/components/library/continue-listening-row.test.tsx
- src/app/page.tsx

Order:

1. Define states: needs setup, sample generating, sample ready, book generating, ready, failed, missing local original.
2. Render one correct action for each state.
3. Keep search only if the library-size target in Q8 justifies it.

Verify:

- State table tests assert label and action for every state.
- Home remains usable with zero, one, and many books.
- Run focused tests, core Playwright flow, and the full gate.

### Task 7.4 — automatically launch the local development runtime

Priority: P1

What:

- Make the developer all-in-one command start Next.js, the worker, and the Python sidecar with health checks and coordinated shutdown.

Why:

Even development currently requires manual sidecar setup, which hides integration failures.

Files:

- scripts/dev-with-worker.mjs
- package.json
- .env.example

Order:

1. Detect the configured Python interpreter/venv without installing silently.
2. Start sidecar, wait for health, then worker and app.
3. Forward termination to all children and return nonzero if any required child dies.
4. Document only environment names/defaults in .env.example; never add secrets.

Verify:

- One command starts all three services.
- Stopping the parent leaves no child process.
- A missing model/venv gives one actionable error.
- Run the full gate and Python tests.

Security-sensitive: yes; process execution and environment variables.

### Task 7.5 — create the packaging plan for the selected OS

Priority: P1 decision/re-plan gate

What:

- After Q3/Q4, create a new, bounded packaging sub-plan before adding a desktop framework or installer.
- It must cover bundled Node/app runtime, Python/model distribution or a replacement runtime, worker lifecycle, code signing, updates, storage paths, disk requirements, firewall behavior, uninstall/cleanup, crash logs, and licenses.

Why:

“Easy for non-technical users” cannot be achieved by a README with terminal commands. Choosing Electron, Tauri, a native wrapper, or another runtime is an architectural commitment and likely adds packages and more than three files.

Files:

- DECISIONS.md
- docs/packaging-plan.md

Order:

1. Build a minimal proof for the chosen platform outside the production flow only after the user approves the framework/dependencies.
2. Measure installed size, first launch, model download, sample latency, and restart.
3. Revise the packaging sub-plan into atomic three-file tasks.

Verify:

- A clean supported machine can install, launch, generate, play, restart, and uninstall without a terminal.
- No package/framework is added during this planning task.

Security-sensitive: yes; code signing, updates, bundled executables, local ports, and storage paths.

## Phase 8 — improve structure after core behavior is stable

### Task 8.1 — add versioned database migrations

Priority: P2

What:

- Stop mutating schema opportunistically during normal repository calls.
- Add ordered, transactional migrations with a schema version.

Why:

Ad hoc schema evolution is risky for user libraries that must survive upgrades.

Files:

- src/lib/backend/database.ts
- src/lib/backend/database.test.ts
- src/lib/backend/sqlite.ts

Order:

1. Snapshot current schema as migration baseline.
2. Test fresh database, upgrade from representative prior schema, failed migration rollback, and idempotent reopen.
3. Move connection/migration initialization out of the large SQLite module.

Verify:

- Opening old fixture databases upgrades without data loss.
- Failed migrations leave the previous version usable.
- Run focused tests and the full gate.

Security-sensitive: yes; durable user-data migration.

### Task 8.2 — extract generation repository behavior

Priority: P2

What:

- Move generation job/output/artifact queries from sqlite.ts into a focused repository module without changing behavior.

Why:

Generation reliability work should not share a 3,600-line module with auth, social, and moderation.

Files:

- src/lib/backend/generation-repository.ts
- src/lib/backend/generation-repository.test.ts
- src/lib/backend/sqlite.ts

Order:

1. Move only already-tested generation behavior.
2. Keep transaction ownership explicit.
3. Avoid a generic abstraction or dependency-injection framework.

Verify:

- Existing SQLite and generation tests remain green.
- sqlite.ts line count and exported generation surface materially decrease.
- Run focused tests and the full gate.

### Task 8.3 — extract book/progress repository behavior

Priority: P2

What:

- Move book, manuscript, chapter, and progress queries to a focused repository.

Files:

- src/lib/backend/book-repository.ts
- src/lib/backend/book-repository.test.ts
- src/lib/backend/sqlite.ts

Order:

1. Move explicit APIs introduced in Phase 6.
2. Keep browser DTO mapping outside persistence rows.
3. Delete the unused generic repository interfaces if they do not match the concrete boundary.

Verify:

- Core API route tests remain green.
- No book repository method accepts a client-supplied workspace without route-level authorization.
- Run focused tests and the full gate.

Security-sensitive: yes; private books and progress.

### Task 8.4 — remove confirmed dead component batches

Priority: P3

What:

- Re-run static reference search first; delete only files that remain unreferenced.

Why:

Dead stubs and abandoned variants obscure the supported architecture.

Files, turn A:

- src/components/import/import-dropzone.tsx
- src/components/import/import-review-panel.tsx
- src/components/player/sample-player.tsx

Files, turn B:

- src/components/library/demo-mode-card.tsx
- src/components/library/home-next-step-card.tsx
- src/components/library/library-hero.tsx

Files, turn C:

- src/components/shared/journey-hero.tsx
- src/components/sound/mode-selector.tsx
- src/components/voices/narrator-picker.tsx

Order:

1. Before each turn, run rg on each exported component name.
2. If any runtime import remains, stop and remove/replace the caller in a separate task.
3. Delete at most the listed three files, run verification, and stop.

Verify:

- pnpm build and the full gate pass after every batch.

### Task 8.5 — prune dormant social/discovery implementation in bounded batches

Priority: P3

What:

- Remove social/discovery feature modules, types, tests, and library cards only after Phase 2 removes all routes and Phase 7 removes all callers.

Why:

Leaving 8,500 lines of unreachable feature code increases maintenance and gives future agents the wrong product boundary.

Candidate files:

- src/features/social/*
- src/features/discovery/*
- src/lib/types/social.ts
- src/lib/types/discovery.ts
- tests/unit/public-social.test.ts
- tests/unit/discovery-personalization.test.ts
- src/components/library/social-*.tsx
- src/components/library/discovery-quick-start-card.tsx
- src/components/library/manage-discovery-preferences-card.tsx
- src/components/library/home-social-proof-card.tsx
- Social/discovery-only cards such as author-spotlight-card, book-circle-card, book-circles-feed-card, for-you-card, home-trending-now-card, listening-editions-feed-card, recent-personalization-card, and recent-tastes-card, but only if reference search proves they have no remaining core use.

Order:

1. Treat this task as the AGENTS.md required re-plan checkpoint because it affects more than three files.
2. Generate a dependency-ordered deletion manifest from rg imports.
3. Put leaf files into batches of no more than three exact files.
4. Execute one batch per turn, running pnpm build and the full gate after each.
5. Do not delete generic utility code merely because social once used it.

Verify:

- rg "features/(social|discovery)|lib/types/(social|discovery)" src returns no runtime imports.
- All deleted route URLs remain 404.
- Core Playwright flow and full gate pass after the final batch.

### Task 8.6 — remove legacy account/session/snapshot tables only after a migration

Priority: P3

What:

- If local single-user v1 is confirmed, remove unused account/session/workspace-link/social/snapshot schema and functions through a versioned migration.

Why:

Removing UI is not enough to simplify the durable model, but destructive schema cleanup must follow proven migrations and backup behavior.

Files:

- src/lib/backend/database.ts
- src/lib/backend/database.test.ts
- src/lib/backend/sqlite.ts

Order:

1. Inventory which tables still contain required book/job/artifact data.
2. Add migration tests using a populated old database.
3. Back up or export before destructive local migration if the release policy requires it.
4. Remove obsolete functions only after migration success.

Verify:

- A populated old library upgrades with books, artifacts, and progress intact.
- Obsolete account/social data is removed according to SECURITY.md.
- Run focused tests and the full gate.

Security-sensitive: yes; destructive database migration and personal data.

## Phase 9 — align documentation and release evidence

### Task 9.1 — make public product claims match the shipped v1

Priority: P1 before release

What:

- Rewrite setup, supported formats, privacy, limitations, and architecture around actual behavior.
- Remove stale Next.js RC, OpenAI/mock, live cloud demo, unsupported format, community, and multi-device claims unless they are true after execution.

Files:

- README.md
- PLAN.md
- docs/spec.md

Order:

1. Describe the user outcome first.
2. List exact supported inputs, limits, voices, platform, storage, and rights rule.
3. Provide non-technical install/use instructions only after packaging exists.
4. Keep developer commands in a separate concise section.

Verify:

- Search the repository for stale product terms and reconcile every hit.
- Follow README instructions from a clean machine/environment.
- Run the full gate.

Security-sensitive: yes; privacy and data-handling claims.

### Task 9.2 — update technical architecture and contracts

Priority: P2

What:

- Document the final source of truth, process boundaries, API DTOs, migrations, retention, and failure recovery.

Files:

- docs/architecture.md
- docs/data-contracts.md
- docs/module-boundaries.md

Order:

1. Diagram import, generation, playback, progress, deletion, and restart recovery.
2. Explicitly distinguish server-only paths/rows from browser DTOs.
3. Document repository ownership and transaction boundaries.

Verify:

- Every documented module/route exists.
- No diagram includes removed WorkspaceSync, email-only auth, or social paths.
- Run the full gate.

Security-sensitive: yes; documents trust and exposure boundaries.

### Task 9.3 — consolidate superseded reset documents

Priority: P3

What:

- Merge still-valid history/decisions into the canonical documents, then remove overlapping reset documents.

Files:

- docs/product-reset-plan.md
- docs/product-reset-checklist.md
- docs/product-reset-spec.md

Order:

1. Confirm all active decisions are already in DECISIONS.md, PLAN.md, SECURITY.md, or the final architecture/spec.
2. Delete the three superseded files.
3. Do not delete historical ADRs or changelog entries.

Verify:

- rg "product-reset-(plan|checklist|spec)" finds no links.
- pnpm build and the full gate pass.

### Task 9.4 — capture final UX evidence

Priority: P2 before release

What:

- Replace stale screenshots only after the core flow and packaging are final.

Files, turn A:

- public/screenshots/home-dashboard.png
- public/screenshots/import-flow.png
- public/screenshots/setup-flow.png

Files, turn B:

- public/screenshots/player-experience.png
- public/screenshots/jobs-console.png

Order:

1. Capture Library, Add book, voice/sample, and real player at consistent viewport and clean fixture state.
2. In turn B, replace jobs-console only if an internal diagnostics screenshot is still intentionally documented; otherwise delete it.
3. Never include private local paths, email addresses, manuscripts, or identifiers.

Verify:

- Each image matches current UI and README captions.
- Core Playwright screenshots show no error state.
- Run the full gate after each turn.

Security-sensitive: yes; screenshots can expose private local data.

### Task 9.5 — run the release verification matrix

Priority: P0 release gate

What:

- Perform a clean, evidence-backed release candidate verification.

Files:

- docs/release-verification.md

Order:

1. Record the exact commit, OS, Node, pnpm, Python/runtime, model, and clean-install method.
2. Run:

       pnpm install --frozen-lockfile
       pnpm lint
       pnpm typecheck
       pnpm test
       pnpm build
       pnpm test:e2e --grep "core listening"
       python -m unittest discover tts_sidecar

3. Test supported-format minimum/maximum boundaries.
4. Test sidecar absent, worker crash, cancellation, disk full/quota error, corrupt input, missing artifact, restart, resume, and deletion.
5. Test keyboard-only flow, focus visibility, names/labels, reduced motion, and screen-reader announcements for generation/errors.
6. On the selected clean target OS, install, generate a sample, generate a multi-chapter book, seek, sleep, restart, resume, delete, and uninstall without a terminal.
7. Record measured values for Q8’s targets and attach failures rather than paraphrasing them.

Verify:

- Every Definition of done item has a command, test, screenshot, measurement, or reproducible manual result.
- No required result is “not tested.”
- git status --short is clean except for explicitly documented user-owned changes.

Security-sensitive: yes; final privacy, auth, file handling, and deletion validation.

## Expected end-state architecture

If the recommended answers are accepted, the target is deliberately small:

- Library and Add book are the only primary destinations.
- TXT/EPUB extraction is bounded and truthful.
- SQLite plus generated-audio storage is the local authoritative source; browser storage is only a small cache.
- Explicit book, job, artifact, and progress APIs replace whole-state synchronization.
- A server-owned voice catalog maps friendly names to local Kokoro IDs.
- A supervised local worker and sidecar generate samples/full books.
- Generation is transactional, cancellable, recoverable, and retention-bounded.
- Protected range-capable routes serve exact audio artifacts.
- One real media controller owns playback and progress.
- Accounts, cloud sync, social, discovery, moderation, listening modes, analytics, and advanced render history are absent from v1.
- Versioned migrations and focused repositories create extensibility from tested boundaries rather than unused abstractions.

## Handoff warning

Do not begin with visual cleanup, component extraction, social deletion, or database splitting. The highest-leverage order is:

1. Answer Q1–Q9.
2. Repair the toolchain.
3. Remove the unsafe login surface.
4. Prove real generated playback.
5. Make import claims truthful.
6. Harden generation and storage.
7. Replace full snapshot sync.
8. Simplify UX.
9. Package, prune, document, and release-test.

Any implementation that skips the first six steps may look cleaner while still failing the user’s core goal.
