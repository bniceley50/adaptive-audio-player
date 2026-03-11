# Decisions

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
