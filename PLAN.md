# Plan

## Product outcome

Adaptive Audio Player helps a person turn an authorized ebook or manuscript into a private audiobook with a voice they choose.

Positioning: Choose how your audiobook sounds.

## Current implementation baseline

The source build provides the local library, TXT and EPUB import, chapter review, three curated Kokoro voices, an explicitly installed optional Chatterbox High Quality narrator on supported NVIDIA hardware, real sample and full-book generation, playback, saved progress, job recovery, SQLite persistence, protected audio streaming, and supervised local narration sidecars and worker.

The product has not shipped as an end-user desktop package. There is no supported hosted demo, account service, cloud sync, or multi-device service. Current usage is developer-only until the Windows package and its release verification are complete.

## V1 release contract

- Windows 11 x64 first; macOS is deferred until the Windows release is proven.
- Pasted plain text or TXT files up to 5,000,000 bytes.
- DRM-free EPUB files up to 25,000,000 compressed bytes.
- Extracted text up to 1,000,000 characters and 300 chapters.
- Curated built-in Kokoro voices: Marlowe, Sloane, and Jules.
- One narrator per generated sample or full book; `classic` may remain only as an internal compatibility value.
- Private, single-user, local operation with no account or cloud dependency.
- Only DRM-free material the user owns or is authorized to transform.

PDF, DOCX, MP3/M4B narrator replacement, original-audio playback, voice cloning, custom voice uploads, character-aware casting, accounts, cloud sync, sharing, community, discovery, reporting, moderation, analytics, listening sound-design modes, and multi-device behavior are outside v1.

## Release journey

The packaged release is complete when a user can:

1. Launch the signed Windows application without starting a terminal, Python, Node, or a worker.
2. Paste authorized plain text or add a supported TXT or DRM-free EPUB source.
3. Review the title and extracted chapters.
4. Preview and choose a clearly named built-in voice.
5. Generate and play a real sample artifact.
6. Generate the complete book.
7. Close and reopen the app and continue from saved progress.
8. Recover cleanly from cancellation, restart, missing files, or generation failure.

Library and Add book are the only primary destinations. Job, worker, storage, workspace, and render diagnostics stay out of everyday navigation.

## Implemented architecture baseline

- SQLite and contained local files are authoritative for books, chapters, artifacts, jobs, and playback progress.
- Browser storage is a small disposable UI cache and never stores a full manuscript as the durable source of truth.
- Explicit book, job, artifact, and progress APIs replace whole-library snapshot synchronization.
- A server-owned voice catalog maps stable product voice IDs to their local narration engine IDs.
- A supervised local worker and required Kokoro sidecar generate samples and full books. An optional, separately installed Chatterbox sidecar can generate through the same internal contract on supported hardware; its absence never blocks Kokoro startup. Production rendering has no cloud TTS or automatic mock fallback.
- A sample becomes ready only after an accessible, playable artifact exists for the selected book and voice.
- Protected, range-capable routes stream exact artifacts without exposing local filesystem paths or buffering a complete book in memory.
- One media controller owns play, pause, seek, skip, speed, chapters, progress, end-of-track behavior, and the sleep timer.
- Generation completion is transactional, cancellation-safe, restart-recoverable, resource-bounded, and covered by explicit retention and deletion rules.
- Versioned SQLite migrations preserve the supported local library while removing retired account, social, profile, and snapshot-sync schema.

## Packaging target

The first release target is a signed, per-user Windows 11 x64 MSIX with an Electron host. It will package the standalone application, a separate pinned Node 22 runtime, the frozen Python 3.12 sidecar, and the hash-verified Kokoro model. Chatterbox is implemented for explicit source installation but remains an optional separately installed runtime until its desktop installation and upgrade path passes the release matrix. The exact desktop build dependencies and signing workflow remain approval-gated; none of this is presented as shipped behavior.

## Release targets

- A 1,000-character first sample completes within 60 seconds at p95 after model installation on the documented Windows 11 x64 release-reference machine.
- Generation is at least 99% crash-free across the release validation corpus, excluding rejected invalid input and explicit user cancellation.
- After a forced restart, each running job requeues or fails actionably within 60 seconds, with no false completion or user-data loss.
- The core flow meets WCAG 2.2 AA and is verified with keyboard-only operation, visible focus, reduced motion, and NVDA on Windows 11.
- Lint, typecheck, unit tests, production build, the focused Playwright listening flow, and Python sidecar tests all pass in the supported environment and CI.

## Remaining release order

1. Keep public documentation aligned with the implemented source build and approved v1 contract.
2. Prune dormant account, social, cloud, demo, and legacy compatibility code that is no longer reachable.
3. Approve and implement the Windows desktop packaging proof.
4. Validate clean install, upgrade, uninstall, offline generation, restart recovery, accessibility, performance, and release signing on the reference machine.
5. Publish end-user install and use instructions only after the package passes the complete release matrix.

## Approved post-v1 direction: Re-narrate my audiobook

After the text-first v1 release is proven, evaluate a local workflow for
user-owned or otherwise permitted, non-DRM audiobook recordings:

1. Import an eligible local audio recording.
2. Transcribe speech to text locally.
3. Detect proposed chapters and let the listener review and edit the transcript.
4. Require explicit transcript approval before final narration.
5. Generate the approved text through the selected local TTS engine.

Importing the original book text remains the preferred, higher-accuracy route.
The audio workflow must not bypass DRM, automatically ingest protected services,
or use reference audio for voice cloning or impersonation. Imported audio,
transcripts, edits, and generated narration remain local by default. This is an
approved future direction only and does not expand the current dual-engine
foundation or the v1 input contract.
