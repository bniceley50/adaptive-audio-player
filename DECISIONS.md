# Decisions

Later decisions supersede conflicting earlier decisions. Earlier entries remain as
implementation history and do not describe the current product contract when a
newer entry explicitly replaces them.

## 2026-03-07 - Responsive web first

Why:
- Fastest path to validating import-to-playback flow
- Lets us prove the player before native and offline complexity

Alternatives rejected:
- React Native first
- Native iOS first

## 2026-03-07 - Sample-first generation

Why:
- Fastest path to the product's core moment
- Limits generation cost before user approval

Alternatives rejected:
- Full-book generation before playback

## 2026-03-08 - Anonymous workspace sync before full auth

Why:
- The app needs a real backend persistence step before full accounts and jobs.
- A cookie-backed anonymous workspace lets the current local-first UX persist server-side without blocking on full sign-in.
- Snapshot sync is the smallest reliable bridge from localStorage to real backend storage.

Alternatives rejected:
- Full hosted auth before any backend persistence
- Rewriting the app to server-only state in one pass
- Keeping the app localStorage-only while building more reader features

## 2026-03-08 - Email-backed local accounts before full hosted auth

Why:
- The next product step after workspace sync is giving the listener a real persistent identity.
- A server-backed email/display-name account is enough to prove sign-in, account linking, and workspace ownership without adding third-party auth yet.
- It keeps the current prototype moving while creating a clean seam for hosted auth later.

Alternatives rejected:
- Staying anonymous longer
- Jumping straight to external hosted auth in the middle of a local-first prototype

## 2026-03-08 - Full reload for workspace/account boundary changes

Why:
- Switching workspaces or signing out changes httpOnly cookies and clears local client state at the same time.
- A full reload is more reliable than a soft router refresh for rehydrating the app from the new backend-backed workspace context.
- It avoids race conditions between cookie changes, local state clearing, and long-lived layout components.

Alternatives rejected:
- Soft refresh only
- Keeping the old workspace mounted and trying to reconcile in place

## 2026-03-08 - Book and player routes restore from backend snapshots

Why:
- Account-linked sync is not useful if direct `/books/[id]` or `/player/[id]` routes fail after local state is cleared.
- Route-level recovery lets linked accounts reopen books directly after a browser reset or workspace switch.

Alternatives rejected:
- Requiring users to visit home first so the shelf can restore
- Keeping route access dependent on localStorage presence

## 2026-03-08 - Jobs start with sync plus sample-generation activity

Why:
- Backend jobs need to represent actual listener actions, not only invisible library syncs.
- Recording sample generation is the smallest real job beyond sync and makes account activity feel tangible.

Alternatives rejected:
- Leaving backend jobs as sync-only
- Building a full background generation queue before any visible job history exists

## 2026-03-08 - Background worker for generation jobs

Why:
- The queue should progress without the book setup page calling special processor routes.
- A separate worker process is the smallest honest version of real background execution for sample and full-book generation.
- Reusing the SQLite queue keeps the architecture simple while separating job execution from the web app lifecycle.

Alternatives rejected:
- Keeping UI-driven `/process` endpoints as the primary execution path
- Adding a third-party queue service before the local product loop is proven

## 2026-03-08 - OpenAI TTS with deterministic local fallback

Why:
- The reader product needs actual audio outputs now, not only job-status simulation.
- The repo must still run in test and local-dev environments where `OPENAI_API_KEY` is not set.
- A deterministic local WAV fallback keeps the worker path testable while allowing real OpenAI speech in configured environments.

Alternatives rejected:
- Blocking all generation on a required OpenAI API key
- Keeping generation purely simulated after the worker architecture was introduced

## 2026-03-08 - SQLite WAL mode and busy timeout for app plus worker concurrency

Why:
- The web app and background worker now share one on-disk SQLite database.
- Generation polling, sync writes, and route reads can overlap during normal use.
- WAL mode plus a busy timeout is the smallest practical step to reduce transient lock failures without adding a separate database service yet.

Alternatives rejected:
- Ignoring transient lock errors in the web app
- Replacing SQLite immediately before the queue and account model are proven

## 2026-03-08 - Signed account session cookies before hosted auth

Why:
- The app was moving from prototype-grade local accounts into a real SaaS-style account boundary.
- Storing a raw account id in an httpOnly cookie was still forgeable if the cookie value was tampered with.
- A signed session token is the smallest hardening step that protects account identity without blocking on full hosted auth.

Alternatives rejected:
- Keeping raw account ids in cookies
- Jumping straight to hosted third-party auth before hardening the existing account boundary

## 2026-03-08 - Time-bounded signed account sessions

Why:
- Signed identity alone is not enough for a production SaaS boundary; sessions also need to expire.
- A time-bounded session token reduces the blast radius of a leaked cookie and creates a clean path to future session rotation and revocation.
- Rotating the signed cookie on sign-in and workspace switch keeps the account boundary fresh without adding a full session store yet.

Alternatives rejected:
- Indefinite signed cookies with no expiry
- Jumping straight to a database-backed revocation list before session hardening basics are in place

## 2026-03-08 - Server-backed account sessions

Why:
- User-wide session versioning can revoke old cookies, but it cannot express selective session revocation or track last-used activity.
- A real `account_sessions` table gives the auth boundary a concrete session record with expiry, last-used timestamps, and revocation state.
- This creates a clean path toward device/session management without forcing a third-party auth system yet.

Alternatives rejected:
- Staying on user-version-only session validation
- Jumping straight to hosted auth before the local SaaS boundary is mature

## 2026-03-08 - Lightweight session labels from request user agents

Why:
- Session controls are much more usable when the user can tell one active session from another.
- A lightweight user-agent-derived label gives the account surface enough context for selective revocation without introducing a full device fingerprinting system.
- This improves session management while keeping the auth model privacy-light and local-first.

Alternatives rejected:
- Showing only timestamps on active sessions
- Adding heavier device fingerprinting before the auth/session model is otherwise mature

## 2026-03-09 - Expired sessions are not treated as active

Why:
- Cookie verification already rejected expired sessions, but the active-session list still included them.
- Session-management controls should only operate on live sessions, not stale rows that have already passed expiry.
- Revoking an expired session on first failed verification keeps the table honest without adding a separate cleanup job yet.

Alternatives rejected:
- Leaving expiry enforcement only in cookie verification
- Keeping expired sessions visible until a manual revoke

## 2026-03-09 - Opportunistic pruning for dead account sessions

Why:
- Even after expiry/revocation enforcement, stale session rows would otherwise accumulate in SQLite forever.
- Pruning during normal session-store reads and writes is the smallest practical cleanup step before adding a dedicated background maintenance job.
- This keeps the auth/session table tidy without widening the deployment shape again.

Alternatives rejected:
- Leaving dead session rows to accumulate indefinitely
- Adding a separate cleanup worker before the auth/session foundation is otherwise stable

## 2026-03-09 - Recent ended-session history with retained reasons

Why:
- Session management becomes much more trustworthy when the account surface can explain what happened to recently ended sessions.
- Retaining ended rows briefly, with an explicit reason such as `signed-out`, `signed-out-elsewhere`, or `expired`, gives the product a real audit trail without building a full security-events subsystem yet.
- This is a stronger SaaS foundation than deleting every ended session immediately.

Alternatives rejected:
- Deleting ended sessions immediately with no history
- Deferring session-end auditability until a later security pass

## 2026-03-09 - Same-origin checks on cookie-authenticated auth mutations

Why:
- The app now relies on httpOnly account and workspace cookies for sign-in, sign-out, workspace switching, and session management.
- Those mutation routes should not accept cross-site POSTs just because the browser would attach cookies.
- A shared same-origin gate is the smallest practical CSRF protection before adding per-form tokens.

Alternatives rejected:
- Relying on SameSite cookies alone
- Deferring CSRF protection until hosted auth

## 2026-03-09 - Same-origin checks on sync and job mutations

Why:
- Library sync and generation-job creation are also cookie-authenticated POST routes.
- Leaving only auth routes protected would create an inconsistent backend boundary where cross-site requests could still mutate listener state or queue jobs.
- Reusing the same shared gate keeps the protection uniform without adding a second mechanism.

Alternatives rejected:
- Protecting only auth/session endpoints
- Waiting for token-based APIs before hardening sync and jobs

## 2026-03-09 - Signed workspace cookies

Why:
- The app had hardened account identity, but the workspace cookie was still a raw browser-supplied id.
- Workspace-bound APIs use that cookie to read synced libraries, generated audio, and queued jobs.
- Signing the workspace cookie closes the gap where a client could forge another workspace id and rely on backend routes trusting it.

Alternatives rejected:
- Leaving workspace ids unsigned because they started as anonymous
- Waiting for a larger workspace-session table before protecting the existing cookie

## 2026-03-09 - Linked workspaces require the owning account

## 2026-03-10 - Session activity comes from real audio playback routes

Why:
- Account session management is more useful when it reflects what a listener actually did, not just when the browser last touched any authenticated page.
- The generated-audio streaming routes are the cleanest trustworthy signal for meaningful listening activity.
- Updating session activity from those routes lets the account security surface show context like the last title and render type without building a separate analytics system.

Alternatives rejected:
- Generic page-hit tracking for every authenticated route
- A heavier analytics/event pipeline before the session model was mature

Why:
- Once a workspace is linked to an account, a signed workspace cookie alone should not be enough to read synced books, jobs, or generated audio.
- Requiring the owning signed-in account closes the gap where valid account and workspace cookies could otherwise be mixed independently.
- This keeps anonymous workspaces usable while making account-linked data behave like real SaaS-owned data.

Alternatives rejected:
- Treating signed workspace cookies as sufficient forever
- Forcing every workspace, including anonymous ones, through a larger server-side session system immediately

## 2026-03-09 - Sign-in cannot adopt another user's linked workspace

Why:
- The account route previously reused whatever signed workspace cookie the browser sent, then linked that workspace to the signing-in user.
- Once workspaces became real owned data, sign-in had to stop re-linking a workspace that already belonged to someone else.
- The safer behavior is to provision a fresh workspace for the new session while leaving the existing linked workspace untouched.

Alternatives rejected:
- Returning another user's linked workspace identity on the anonymous account endpoint
- Re-linking a foreign workspace during sign-in

## 2026-03-09 - Preserve generation artifact history alongside latest outputs

Why:
- The app had reached a point where "latest sample" and "latest full book" were no longer enough to explain backend depth.
- Re-rendering a book should preserve prior artifacts for auditability and product storytelling, not overwrite them invisibly.
- Keeping a latest-output table plus append-only artifact history is the smallest way to support both fast playback lookups and richer per-book render timelines.

Alternatives rejected:
- Replacing the latest-output table entirely with history-only lookups
- Keeping only the most recent output per kind and losing render history

## 2026-03-10 - Centralize backend environment handling

Why:
- Session signing, SQLite path resolution, worker timing, and TTS provider access were spread across multiple files with ad hoc `process.env` reads.
- A real SaaS foundation needs one place to validate critical runtime configuration and one committed example of the required env surface.
- Centralizing env access reduces drift between local development, tests, and future production deployment.

Alternatives rejected:
- Leaving direct `process.env` reads scattered across the worker, session helpers, SQLite bootstrap, and TTS module
- Waiting for a later hosted-infrastructure migration before adding explicit env validation

## 2026-03-10 - Persist background worker heartbeat in SQLite

Why:
- The queue needed an explicit worker-liveness signal instead of inferring health only from job state.
- Storing heartbeat state in SQLite lets the jobs console and home dashboard show whether generation infrastructure is healthy, active, or stale.
- This keeps the current local-worker architecture simple while making the backend feel like a real operated system.

Alternatives rejected:
- Inferring worker health only from queued/running jobs
- Keeping worker liveness as console-only logs with no product surface

## 2026-03-10 - Allow queued and running generation jobs to be cancelled

Why:
- Once the queue became observable, it also needed an operator control path.
- Users should be able to stop accidental or no-longer-needed renders without waiting for them to finish.
- The worker now rechecks claimed jobs before synthesis so a cancelled running job can be skipped safely instead of finishing blindly.

Alternatives rejected:
- Forcing users to wait for every queued/running render to complete
- Supporting cancellation only for queued jobs and not the already-claimed worker path

## 2026-03-10 - Reuse matching active generation jobs instead of enqueueing duplicates

Why:
- Repeated clicks on sample or full-book generation should not create duplicate queued/running jobs for the same book and taste.
- Reusing the active job keeps the queue smaller and makes the product feel more deliberate under repeated user input.
- This is the simplest backend-side control that improves cost, throughput, and operator clarity without changing the frontend flow.

Alternatives rejected:
- Letting the queue accept duplicate renders and relying on users not to click twice
- Solving duplication only in the UI instead of at the backend boundary

## 2026-07-06 - Local-only Kokoro TTS for private rendering

Why:
- Private local narration is now a product requirement, so generation must not call cloud TTS from the render path.
- Kokoro is the v1 engine because it is small enough for fast chunk rendering, has many distinct built-in voices, runs locally through Python, and uses Apache-licensed model weights suitable for portfolio and SaaS exploration.
- The render path must fail closed. If the local engine is missing, down, misconfigured, or returns invalid output, the job records a plain-English failure instead of silently producing mock audio.
- The Python package is pinned to `kokoro==0.9.4`, matching the current upstream usage guidance.
- The model payload is pinned to official `hexgrad/Kokoro-82M` v1.0 with published SHA256 `496dba118d1a58f5f3db2efc88dbdc216e0483fc89fe6e47ee1f2c53f18ad1e4`. The sidecar must verify downloaded weights against this hash before first use.
- Model weights and rendered artifacts stay on local disk and out of git.

Alternatives rejected:
- OpenAI TTS: removed from the render path because cloud narration conflicts with the private/local product promise for this slice.
- Piper: fast and local, but the original repo has moved development elsewhere and voice-model licensing is less uniform, which makes it a weaker foundation for a first SaaS-shaped local renderer.
- XTTS-class engines: strong voice cloning and multilingual features, but Coqui XTTS-v2 uses CPML model licensing and has a less clean maintenance story for this portfolio/SaaS v1.

## 2026-07-16 - Narration starts from authorized text sources (Q1)

Decision:
- V1 changes the narrator of a DRM-free ebook or manuscript, not an existing audiobook recording.
- Existing MP3/M4B speech replacement and original-audio playback are deferred.

Why:
- Replacing speech in an existing recording requires transcription, speaker and music separation, alignment, and a substantially larger rights and safety model.
- The product must not imply that simply importing an audio file changes its narrator.

Supersedes:
- Any product copy or import path that presents MP3/M4B as a narrator-change source.

## 2026-07-16 - Curated synthetic voices only in v1 (Q2)

Decision:
- V1 provides a server-owned catalog of curated Kokoro voices.
- Voice cloning and custom voice uploads are out of scope.

Why:
- Voice cloning would require consent verification, impersonation safeguards, model hosting, moderation, and additional data-retention controls.

## 2026-07-16 - Local-first desktop delivery (Q3)

Decision:
- V1 is a local-first desktop product that bundles or supervises the application runtime, Kokoro model, worker, sidecar, and SQLite database.
- V1 is not a hosted web service and does not send manuscripts to cloud TTS.

Why:
- Local generation preserves the private-import promise and avoids premature hosted authentication, object storage, quotas, and remote-worker infrastructure.

Supersedes:
- The earlier responsive-web-first delivery direction and the OpenAI TTS with deterministic fallback decision.

## 2026-07-16 - Windows-first platform support (Q4)

Decision:
- The first supported release target is Windows 11 x64.
- macOS follows only after the Windows package meets the release verification matrix.

Why:
- Packaging, model installation, file handling, media controls, process supervision, code signing, and updates require platform-specific proof.

## 2026-07-16 - TXT and DRM-free EPUB are the v1 source formats (Q5)

Decision:
- V1 accepts TXT files and DRM-free EPUB files.
- TXT input is limited to 5 MB; EPUB input is limited to 25 MB compressed.
- Extracted text is limited to 1,000,000 characters and 300 chapters.
- PDF, DOCX, MP3, and M4B are deferred and must not be described as supported v1 narrator-change inputs.

Why:
- TXT is already the honest core source and EPUB is the highest-value structured format for non-technical readers.
- Explicit limits bound memory, storage, parsing, and generation work.

## 2026-07-16 - Accounts, cloud, and community are outside v1 (Q6)

Decision:
- Accounts, cloud sync, sharing, community, circles, discovery, reporting, moderation, analytics, and multi-device behavior are out of scope for v1.
- V1 is a private, single-user local product. An unverified email address can never create an authenticated session.

Why:
- These surfaces distract from the unfinished listening loop and conflict with the local delivery and privacy model.

Supersedes:
- Earlier account, linked-workspace, cloud-shaped sync, social, discovery, reporting, and moderation product decisions for the v1 release.

## 2026-07-16 - Narration-only listening mode (Q7)

Decision:
- V1 exposes narration only.
- `classic` may remain temporarily as an internal compatibility value and will be removed through a later migration.
- Ambient and immersive modes are not user-visible until synthesis actually implements them in a future product plan.

Why:
- The current worker does not generate sound design, so presenting these modes would make an unsupported promise.

## 2026-07-16 - Measurable v1 release targets (Q8)

Decision:
- A 1,000-character first sample completes within 60 seconds at p95 after model installation on the Windows 11 x64 reference machine documented in the release-verification record.
- Supported limits are 5 MB for TXT, 25 MB compressed for EPUB, 1,000,000 extracted characters, and 300 chapters.
- Generation is at least 99% crash-free across the release validation corpus, excluding rejected invalid input and explicit user cancellation.
- After a forced worker or application restart, every running job requeues or fails with an actionable message within 60 seconds, with no false completion or user-data loss.
- V1 meets WCAG 2.2 AA for its core flow and is verified for keyboard-only operation, visible focus, reduced motion, and NVDA on Windows 11.

Why:
- Performance, recovery, reliability, and accessibility require thresholds that can be reproduced at release time.

## 2026-07-16 - Authorized DRM-free content only (Q9)

Decision:
- The product accepts only DRM-free material the user owns or is authorized to transform.
- The product never bypasses DRM and does not provide public sharing of imported sources or generated audio.

Why:
- Import copy, support policy, privacy behavior, and any future delivery model need one unambiguous rights boundary.

## 2026-07-19 - Bound current intake to implemented TXT support

Decision:
- Until bounded EPUB extraction ships, the live intake accepts pasted text and TXT files only.
- TXT files are limited to 5,000,000 bytes, extracted text to 1,000,000 characters, titles to 200 characters, and parsed books to 300 chapters.
- An explicit MIME type must be `text/plain`; an empty browser-provided MIME remains acceptable for local TXT files.
- PDF, DOCX, MP3, and M4B are not offered or described as supported v1 inputs.

Why:
- File-picker hints are not a security boundary, and future-format claims must not let unbounded or unimplemented input reach browser storage, SQLite, or generation.

## 2026-07-19 - Imported books use collision-resistant UUID identities

Decision:
- New local imports receive a `book-`-prefixed UUID from `crypto.randomUUID()` instead of an ID derived from the current library length.
- Explicit book IDs remain an internal fixture and migration seam; production import flow does not supply them.

Why:
- Library length is not a stable identity source: deleting one book can make a later import reuse and overwrite the ID of another surviving book.
- Browser tests must discover the created ID from the application flow rather than encoding the former production sequence.

## 2026-07-19 - Sample requests are intent, not playback readiness

Decision:
- A local sample request records only the listener's intent to generate a selected book, voice, and mode.
- Sample lifecycle is represented as not requested, requested, queued, running, completed with an artifact, failed, cancelled, stale, or completed without an artifact.
- Playback and download actions unlock only for a current `/api/audio/` artifact matching the selected book, voice, and mode; failed, cancelled, stale, queued, and artifact-missing states remain non-playable.

Why:
- Request metadata can exist before enqueueing succeeds and can survive a failed or cancelled worker job, so it cannot prove that playable audio exists.
- One shared resolver keeps reload behavior, status copy, retry actions, and player links on the same readiness contract.

## 2026-07-19 - Use exact zip.js for bounded EPUB container parsing

Decision:
- Add `@zip.js/zip.js` at exact version `2.8.31` as the EPUB ZIP-container parser.
- Read archives from browser `Blob`/stream APIs and never extract entries to the filesystem.
- Treat archive metadata as untrusted. Application code must still reject encrypted or malformed archives, unsafe or duplicate normalized paths, unsupported split archives, excessive entry counts, excessive compressed or expanded sizes, and decompressed output that exceeds the enforced byte budget.

Why:
- EPUB is a ZIP container, so central-directory parsing, entry streaming, and format validation should use a maintained library rather than ad hoc byte or string handling.
- zip.js supports the browser and Node 22, exposes entry names, compressed and uncompressed sizes, encryption and filesystem attributes, and has no runtime dependencies.
- The approved release is BSD-3-Clause licensed, registry-signed, and published with provenance tied to its `v2.8.31` source tag.

Alternatives rejected:
- `fflate@0.8.3`: smaller and dependency-free, but its lower-level ZIP API would require more custom archive-policy machinery for this security boundary.
- `jszip@3.10.1`: broader runtime dependency tree and weaker fit for explicit bounded streaming.
- `epubjs@0.3.93`: renderer and storage functionality exceeds the extraction task and brings a substantially wider dependency surface.

## 2026-07-19 - Retain current audio artifacts and bounded job history

Decision:
- Retain only the current sample and current full-book artifact history for each book; remove superseded contained files and their artifact-history rows during successful replacement.
- Retain terminal generation-job rows for 30 days, while preserving active jobs and the job metadata required by current artifacts.
- Delete a book's generated files individually before removing its database metadata in one immediate transaction. Missing files count as already cleaned; rejected or failed paths are reported and leave metadata available for a safe retry.
- Never recursively delete a generated-audio workspace or derive a deletion target without generated-root containment validation. Files referenced by another book or workspace remain protected.

Why:
- Current-artifact-only retention bounds generated storage without exposing unusable historical renders.
- A short terminal-job window preserves actionable recent status while preventing indefinite database growth.
- File-first, per-file cleanup makes partial failures recoverable and prevents one book deletion from damaging another book's data.

## 2026-07-19 - Persist playback through the explicit progress API

Decision:
- Current generated audio persists a small revisioned progress DTO at a 15-second cadence, plus immediate pause, completed-seek, ended, and unload flushes.
- The player keeps optimistic resume state in localStorage without emitting the legacy whole-library synchronization event.
- Only the authoritative current artifact ID may write progress; imported and archived audio do not update the current generated-artifact record.
- Failed writes retain the latest position for retry. Revision conflicts adopt the server's current revision before retrying the latest local position.

Why:
- Per-second player updates must not upload manuscripts or full library snapshots.
- A bounded cadence limits a 60-second uninterrupted session to four small cadence requests while lifecycle flushes protect meaningful listener actions.
- Artifact identity and optimistic revisions prevent stale media or concurrent tabs from silently overwriting current progress.

## 2026-07-19 - Replace root snapshots with explicit book operations

Decision:
- Remove the root `WorkspaceSync` client component and the browser helper that serialized the whole local workspace on general storage and playback events.
- Load the shelf through `GET /api/books`, load player manuscript data through `GET /api/books/{bookId}`, and delete books through `DELETE /api/books/{bookId}`.
- Keep server manuscripts in player memory and cache only book metadata in localStorage. Preserve browser-only imported-audio metadata when refreshing the server record.
- Treat server deletion as authoritative: local book state is removed only after the explicit delete succeeds, and failures remain visible and retryable.
- Keep the legacy snapshot route temporarily as a migration/deletion target for Task 6.8, but block and fail any core browser flow that still calls it.

Why:
- A small shelf refresh, player load, deletion, or playback update must not transfer unrelated manuscripts, discovery state, social state, or the full private library.
- Explicit resource operations provide bounded payloads, clearer failure behavior, and independently testable ownership boundaries.

## 2026-07-19 - Make the accepted sample the narration setup contract

Decision:
- The everyday book setup is a linear voice, sample, and full-audiobook flow with one primary next action in each state.
- Voice selection uses the server-owned catalog and real preview endpoint; mode, taste, social, provider, queue, path, and workspace controls remain outside the everyday view.
- Sample and full-audiobook readiness require an exact current artifact for the selected book, voice, and compatibility mode.
- Full-audiobook enqueueing derives its narrator from the server-owned current classic sample before considering a legacy stored profile or the default voice. Client generation metadata remains untrusted and ignored.

Why:
- A listener should approve the voice they will actually hear without understanding backend concepts or reconciling competing settings.
- Server-authoritative sample metadata prevents a stale profile or tampered request body from silently changing the full audiobook's voice.

## 2026-07-19 - Make import a source decision followed by one review

Decision:
- The everyday Add book flow has two states: choose exactly one file-or-paste source, then review the title and detected chapters before explicitly adding the book.
- Supported formats, rights, and resource limits appear before source selection. Social recommendations, taste inheritance, editions, roadmap panels, recovery metrics, and backend state do not appear in the flow.
- Bounded EPUB extraction may supply package title and first creator metadata for the review. The title becomes the editable default; creator metadata is review-only until the book data model gains an author field.
- Book creation continues through the idempotent explicit `POST /api/books` boundary, whose server-side manuscript and chapter validation remains authoritative.

Why:
- A first-time listener needs one reversible source choice and one understandable confirmation, not an intake console exposing future product concepts.
- Showing trusted-as-display-only EPUB metadata reduces retyping without expanding the persistence or security boundary.

## 2026-07-19 - Derive the library shelf from bounded server activity

Decision:
- The everyday shelf exposes exactly seven listener-facing states: needs setup, sample generating, sample ready, book generating, ready, failed, and missing local original.
- `GET /api/books` includes a bounded activity summary containing generation kind/status/timestamps, public current artifact identity and URL, and current-artifact progress. It excludes manuscripts, provider, narrator/mode, workspace identity, and storage paths.
- Readiness and resume actions require an exact current public artifact. Browser generation caches cannot promote a book to playable state.
- Each book shows one primary action. Search, filters, social, taste, mode, provider, workspace, and render-history controls are not part of the v1 shelf; no approved Q8 target currently justifies shelf search.

Why:
- A library should answer what is ready and what the listener can do next without exposing implementation concepts or stale client snapshots.
- A bounded server summary avoids one request per book while preserving ownership checks and keeping private manuscript data outside the shelf response.

## 2026-07-19 - Supervise the complete local development runtime

Decision:
- `pnpm dev` and `pnpm dev:all` run one supervisor that starts the pinned Python Kokoro sidecar, waits for its loopback health contract, then starts the generation worker and Next.js application and waits for the app to respond.
- The supervisor uses an explicitly configured interpreter, active virtual environment, ignored repository virtual environment, or Python on `PATH` only when it is Python 3.12 with every pinned sidecar distribution importable. It never creates an environment, installs packages, or downloads dependencies during interpreter discovery.
- `ADAPTIVE_AUDIO_PLAYER_TTS_URL` is the authoritative loopback bind and worker origin for development. Remote URLs, credentials, invalid ports, incompatible health responses, corrupt cached weights, and offline startup without verified weights fail closed with one actionable error.
- A required child exiting stops the remaining process trees and makes the supervisor fail. Terminal signals and private parent-process IPC stop the complete tree; Windows uses PID-scoped tree termination so Next.js or Python descendants are not orphaned.

Why:
- Requiring separate terminals for the sidecar, worker, and app hides missing dependencies and integration failures and makes cleanup unreliable.
- Explicit discovery and health checks preserve the local privacy boundary while keeping installation and model acquisition visible to the developer.
- Coordinated lifecycle behavior is the development proof needed before a Windows package owns the same services.

## 2026-07-19 - Package v1 as a supervised Windows 11 x64 MSIX

Decision:
- Target a signed, per-user Windows 11 x64 MSIX that launches without a terminal and owns the complete local process tree.
- Use an Electron desktop host as the first approval-gated proof. Keep the pinned official Node 22 runtime separate from Electron's embedded Node, build the Next application with standalone output, and freeze the current Python 3.12 Kokoro sidecar as a one-folder application.
- Bundle the exact hash-verified Kokoro model as a read-only package resource so release generation works offline with no first-launch model download.
- Use official Windows SDK tooling for the outer MSIX proof instead of depending on Electron Forge's currently experimental MSIX maker.
- Bind services to per-launch ephemeral loopback ports, authenticate them with independent random launch secrets, create no firewall rule, and let one sandboxed renderer load only the exact app origin.
- Store all app-managed database, manuscript, generated-audio, browser, temporary, and log state in the Windows package application-data container. Clean uninstall removes that managed state while leaving original imports and explicit external exports untouched.
- Use a Microsoft Store update channel by default, or a separately approved trusted-certificate HTTPS App Installer channel. Production updates require signed package identity continuity and versioned database migrations.
- Keep exact Electron, Forge, fuses, PyInstaller, Windows build tooling, and binary/model inputs behind a separate pinned dependency approval before implementation.

Why:
- The current product already requires a dynamic Next server, Node worker, SQLite, and Python model sidecar. Electron proves that architecture with less product rewrite than a Rust or native host, while the separately bundled Node runtime preserves the approved runtime contract.
- A one-folder sidecar is inspectable and avoids copying the non-portable development virtual environment or extracting a very large one-file payload on every launch.
- MSIX provides signed package identity, atomic updates, and contained uninstall behavior appropriate for a non-technical Windows release.
- Bundled verified weights preserve the local-first privacy and offline contract; loopback authentication and renderer isolation prevent the desktop wrapper from treating localhost as a trust boundary by itself.

Revisit when:
- The clean-machine proof fails the security, lifecycle, sample-latency, or install/startup evidence gates, or measured size justifies a separately approved Tauri or replacement-inference-runtime comparison.

## 2026-07-21 - Package the Electron proof without Forge

Decision:
- Use exact `@electron/packager@20.0.0` directly for the Windows Electron application directory and official Windows SDK tools for the outer MSIX.
- Keep exact `electron@43.1.1` and `@electron/fuses@2.1.3` in the approval-gated desktop manifest; allow only Electron's required install script when the user approves those dependencies.
- Reject Electron Forge 7.11.2 for this proof because pnpm 11.3.0 cannot accept its Git-hosted `@electron/node-gyp` subdependency and its `@electron/rebuild@3` line retains a known-vulnerable `tar@6.2.1` dependency.
- Do not use Forge 8 while it remains prerelease. Reconsider a stable Forge release only if it resolves cleanly under the same registry, script-allowlist, license, and advisory gates.
- Pin packaged Kokoro inputs to repository revision `f3ff3571791e39611d31c381e3a41a3af07b4987` and to the individual model, config, and three selected voice digests recorded in `docs/packaging-plan.md`.

Why:
- The application does not need Forge's native-module rebuild layer: Electron owns only the window and lifecycle, while the Next server and generation worker run under the separately bundled Node 22 runtime.
- A disposable resolution of Electron, Packager, and Fuses produced a registry-only 68-package closure with no known advisories or unknown licenses, so it is the smaller compatible supply-chain boundary.
- Exact revision and file hashes prevent mutable Hugging Face `main` content or untrusted replacement pickles from entering the signed package.

## 2026-07-21 - Pin the spaCy model to its official release artifact

Decision:
- Keep the approved `en-core-web-sm` 3.8.0 language model in the sidecar requirements as a PEP 508 direct reference to the official `explosion/spacy-models` release wheel.
- Pin that wheel to SHA-256 `1932429db727d4bff3deed6b34cfc05df17794f4a52eeb26cf8928f7c1a0fb85` so local setup and CI install the same verified artifact with one requirements command.
- Do not add a separate unpinned download step or depend on the Python package index for this model.

Why:
- `en-core-web-sm==3.8.0` cannot be resolved from the configured Python package index, which breaks a clean sidecar install before CI or local tests can start.
- The official wheel was independently downloaded and hashed during clean-environment verification; carrying its source and digest in the requirements file makes the bootstrap reproducible and auditable.

## 2026-07-21 - Prove destructive single-user schema cleanup before activation

Decision:
- Define the account/session/workspace-link/social/snapshot cleanup as an ordered version-2 migration, but do not add it to the default startup sequence until all legacy repository and route callers have been retired.
- Rebuild the `workspaces` parent table without `user_id` while preserving workspace identity, timestamps, and every book, chapter, job, artifact, progress, idempotency, and worker row.
- Temporarily suspend foreign-key enforcement around each transactional migration, run `foreign_key_check` before commit, and restore the connection's prior enforcement state afterward.
- Treat the transactional database itself as the recovery boundary because the current release policy requires a failed migration to leave the prior database usable but does not require a separate pre-upgrade archive.

Why:
- Activating destructive schema removal while legacy runtime callers still query those tables would create a knowingly broken intermediate build.
- SQLite parent-table replacement needs foreign-key enforcement suspended to avoid cascading deletion of the durable child rows; validating before commit preserves atomic failure behavior.
- A populated version-1 migration test can prove both private legacy-data deletion and core library-data survival before runtime activation.

## 2026-07-28 - Resolve the pinned source model from the local Hugging Face cache

Decision:
- When `ADAPTIVE_AUDIO_PLAYER_TTS_MODEL_ROOT` is not set, the source Python sidecar resolves the exact approved Kokoro revision beneath `data/local-tts/huggingface/hub`.
- Frozen packaging keeps its package-resource default and may still receive an explicit host-provided model root.
- Resource startup remains fail-closed: all five files must exist as regular, non-symlink files and pass their pinned SHA-256 digests before the supervised app starts.

Why:
- The documented source setup uses `data/local-tts` for the local model cache, while the sidecar previously defaulted to an unrelated repository `models/kokoro` directory. A verified cache could therefore exist while every ordinary `pnpm dev` invocation failed before Next.js started.
- Selecting only the immutable approved revision preserves the local privacy and supply-chain boundary without adding downloads or trusting the mutable Hugging Face `main` reference during startup.

## 2026-07-28 - Normalize source line wraps before Kokoro narration

Decision:
- Treat a single source newline as a layout wrap and join it with a space before narration; retain blank lines as paragraph boundaries.
- Send each normalized paragraph through Kokoro's punctuation-aware tokenizer instead of using its default newline splitter.
- Insert fixed 120 ms pauses between Kokoro's internal chunks and 320 ms pauses between source paragraphs, with no leading or trailing padding.

Why:
- Plain-text books such as Project Gutenberg editions hard-wrap prose near 70 characters. Treating every physical line as a new utterance repeatedly resets prosody and makes otherwise natural voices sound robotic.
- Explicit, bounded pauses preserve breaths at model chunk boundaries and paragraph structure consistently across all existing voices without changing speed, public interfaces, local-only behavior, or the approved engine and voice resources.

## 2026-07-28 - Keep audiobook re-narration transcript-mediated and post-v1

Decision:
- Approve “Re-narrate my audiobook” as a future, post-v1 workflow for local audio recordings the user owns or is permitted to transform and that are not protected by DRM.
- Transcribe eligible audio locally, propose chapter boundaries, and require transcript review and editing before the listener can approve final narration through a selected local TTS engine.
- Keep original book-text import as the preferred, higher-accuracy route.
- Do not bypass DRM, automatically ingest protected services, or use imported or reference audio for voice cloning or impersonation.
- Keep imported audio, transcripts, edits, and generated narration local by default.
- Do not expand the current dual-engine foundation or v1 source-format contract to implement this direction now.

Why:
- Audio transcription can provide a useful recovery path when authorized source text is unavailable, but transcription and chapter detection introduce errors that require an explicit human review boundary.
- Text-first input avoids recognition errors and remains more accurate, resource-efficient, and auditable.
- Explicit rights, privacy, and anti-impersonation limits preserve the product's local-first trust boundary without implying support for DRM removal or protected-service ingestion.

## 2026-07-28 - Keep Kokoro as the default and gate optional Chatterbox locally

Decision:
- Represent local narration engines through stable internal IDs and adapters. Keep Kokoro as `Fast / Compatible`, the default adapter, and the graceful fallback for unavailable optional engines.
- Reserve Chatterbox as `High Quality` for capable NVIDIA GPUs with at least 8 GB of VRAM. Do not make it selectable until an application-managed, supervised runtime is implemented and verified.
- Pin the future Chatterbox installation to `chatterbox-tts==0.1.7` and model revision `5bb1f6ee58e50c3b8d408bc82a6d3740c2db6e18`.
- Keep Chatterbox installation explicit and local, preserve its license notices, never add automatic model downloads, and never commit model assets to source control.
- Disable reference-audio voice cloning. The optional engine may use only its approved bundled synthetic conditioning.
- Treat the disposable benchmark environment as evidence only, not as an installed application runtime.

Why:
- Kokoro preserves compatibility, fast generation, and the existing public API while Chatterbox carries materially higher disk, memory, GPU, and startup costs.
- An honest capability and installation status lets the interface explain why High Quality is unavailable without silently changing engines or exposing local device and filesystem details.
- Separating adapter selection from model installation creates a safe seam for a later Chatterbox sidecar without forcing downloads or weakening the local-only trust boundary.

## 2026-07-28 - Guard Windows development services and preflight loopback ports

Decision:
- Before starting any development child, require the fixed Next.js loopback port to be free. Require an explicitly configured local TTS port to be free, or select an ephemeral loopback TTS port when no URL is configured.
- Propagate the selected TTS origin explicitly to the Kokoro sidecar, generation worker, and Next.js process. Keep every accepted origin HTTP-only and loopback-only.
- On Windows, launch each required development service beneath a small owner guard. If the supervisor exits, loses its owner pipe, or is force-terminated, the guard terminates the complete service process tree.
- Do not accept a compatible health response as proof of ownership unless the selected port was free before the guarded child launched and its guard remains alive through readiness.
- Wait for the owned Next.js and TTS ports to become available again before reporting shutdown complete.

Why:
- The Windows Python virtual-environment executable is a proxy process whose PID differs from the actual Python service. Direct child tracking alone does not protect cleanup if the supervisor disappears or a proxy boundary is crossed.
- A previous compatible sidecar could satisfy the health check while a newly launched sidecar had not bound yet, allowing startup to advance before the new child failed with a port collision.
- Preflight, explicit propagation, owner guards, and release verification close the ownership race without adopting unknown processes, exposing non-loopback services, or changing application and TTS API contracts.

## 2026-07-28 - Install and supervise Chatterbox as an explicit optional engine

Decision:
- Implement the approved High Quality engine as a separate ignored source runtime under `data/local-chatterbox`, created only by `pnpm chatterbox:install`. Normal app startup must never install, download, update, or repair it.
- Pin the runtime to 64-bit Python 3.11, `chatterbox-tts==0.1.7`, CUDA builds of `torch==2.11.0+cu130` and `torchaudio==2.11.0+cu130`, and model revision `5bb1f6ee58e50c3b8d408bc82a6d3740c2db6e18`. Verify every approved model file by exact size and SHA-256 before accepting the installation or loading the model.
- Supervise Chatterbox independently on an ephemeral loopback port with a separate random per-launch secret. Treat an absent, unsupported, corrupt, or unhealthy optional runtime as an actionable High Quality status while leaving Kokoro Fast / Compatible available.
- Persist the selected engine with the sample, full-book job, and generated artifact. A full-book render must use the same engine and narrator as its accepted sample; explicit Chatterbox requests never silently generate Kokoro audio.
- Expose only the bundled `chatterbox-default` synthetic narrator, always call generation with `audio_prompt_path=None`, reject extra render fields, and provide no reference-audio upload or voice-cloning surface.
- Bound Chatterbox worker chunks and samples to 900 characters, preferring paragraph, sentence, and word boundaries before stitching PCM WAV output.

Why:
- A separate runtime preserves the proven Python 3.12 Kokoro environment while accommodating Chatterbox's verified Python 3.11/CUDA dependency set.
- Explicit installation, immutable model identity, authenticated loopback transport, and offline `from_local` loading preserve the local-first and supply-chain boundaries without forcing a multi-gigabyte download on compatible or modest machines.
- Engine identity in durable generation state prevents the UI, retries, or full-book continuation from mislabeling which engine produced audio.

Remaining release boundary:
- The source integration is not yet a packaged Chatterbox installer or updater. Shipping High Quality in the Windows desktop product requires a separately verified installation, upgrade, disk-space, license, and clean-uninstall path.

## 2026-07-30 - Re-narrate authorized MP3/M4B through reviewed local transcripts

Decision:
- Implement the approved post-v1 audiobook re-narration direction now as a transcript-mediated workflow. Eligible inputs are one DRM-free MP3 or M4B recording up to 2 GB and 30 hours that the listener owns or is authorized to transform.
- Transcribe locally with FFmpeg's `whisper.cpp` filter and the English `ggml-base.en.bin` model from `ggerganov/whisper.cpp` pinned to repository revision `5359861c739e955e79d9a303bcbc70fb988958b1`, exact size `147964211`, SHA-1 `137c40403d78fd54d454da0f9bd998f78703390c`, and SHA-256 `a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002`.
- Keep the transcription runtime and model explicit and local. Normal app startup must not download or update the model. Source development may use an explicitly verified FFmpeg build with the Whisper filter; packaging must separately pin and license-review the shipped FFmpeg/whisper.cpp binary closure.
- Validate extension, browser media type, byte size, probed container, duration, audio-stream count, encrypted codec markers, chapter bounds, transcript output size, timestamps, and extracted text again at the server boundary.
- Use embedded M4B chapter markers when available and otherwise propose one reviewable chapter. Normalize overlapping Whisper windows without hiding transcription uncertainty.
- Require the listener to review and edit the proposed transcript before it becomes a normal book manuscript and before either local TTS engine can generate narration. Imported audio is never accepted as reference audio and is not used for voice cloning or impersonation.
- Stream the source into contained temporary local storage for probing and transcription, then remove the raw temporary recording and intermediate transcript after the browser receives the review draft. Original book-text import remains the preferred, higher-accuracy route.

Why:
- A live benchmark on the approved public-domain Alice chapter transcribed 13 minutes 16 seconds of MP3 audio in 4.9 seconds on the Windows reference machine with 30-second context windows. The result was usable but contained recognizable-word errors, which confirms that transcript review is a product requirement rather than optional polish.
- Reusing FFmpeg's built-in whisper.cpp integration avoids contaminating the proven Kokoro and Chatterbox Python environments with a third dependency stack while preserving fully local processing.
- Contained temporary ingestion and conversion into the existing reviewed-text book contract minimizes retention of the original recording and reuses the already verified narration, generation, and playback pipeline.
