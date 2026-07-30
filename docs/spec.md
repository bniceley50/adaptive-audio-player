# Product and Technical Specification

## Product outcome

Adaptive Audio Player turns authorized text or an eligible DRM-free recording into a private, locally generated audiobook. Audio input is transcribed locally and requires complete transcript review and approval before it enters narration.

Positioning: Choose how your audiobook sounds.

## Status

The core product flow is implemented in the source build. The signed Windows desktop package is not yet available, so this specification distinguishes current source behavior from release targets. There is no hosted product or cloud-backed demo.

## Users

- People who own DRM-free ebooks or manuscripts and want narrated audio.
- People authorized to transform a DRM-free MP3/M4B recording when the original book text is unavailable.
- Listeners who want a simpler voice choice and playback flow than a general-purpose text-to-speech tool.
- Accessibility-focused listeners who benefit from keyboard operation, visible focus, reduced motion, and screen-reader support.

## Supported inputs and limits

| Input | Validation |
|---|---|
| Pasted text | Plain text subject to the extracted-book limits below. |
| TXT | `.txt` extension, `text/plain` media type, maximum 5,000,000 bytes. |
| EPUB | `.epub` extension, ZIP/EPUB media type, maximum 25,000,000 compressed bytes, and no DRM support. |
| MP3/M4B | `.mp3` or `.m4b`, maximum 2,000,000,000 bytes and 30 hours, exactly one audio stream, no encrypted/protected codec markers, and at most 300 embedded chapters. |
| Extracted book | Maximum 1,000,000 text characters, 300 chapters, and 200 title characters. |

EPUB extraction also rejects unsafe archive paths, excessive entry counts, excessive expansion, and suspicious compression ratios.
Audio is probed and transcribed again at the server boundary. The original recording and intermediate transcript are removed from contained temporary storage before the editable review draft is returned.

## Voices and narration

- `marlowe` / Marlowe maps to Kokoro `af_heart`.
- `sloane` / Sloane maps to Kokoro `af_bella`.
- `jules` / Jules maps to Kokoro `am_michael`.
- Generation APIs accept only these server-owned product voice IDs.
- A sample or full book uses one selected voice.
- `classic` may remain in stored data only as an internal compatibility value; v1 exposes no listening sound-design mode choice.
- Generation must produce real playable audio. It fails visibly when local TTS is unavailable or the model cannot be verified; it never substitutes mock audio in production.

## Primary journey

1. Open Library and choose Add book.
2. Select or paste a supported, authorized source.
3. Review the extracted book; for audio, edit every proposed transcript chapter and explicitly approve it.
4. Preview Marlowe, Sloane, and Jules, then choose one.
5. Generate and play a sample for that exact book and voice.
6. Generate the full book as chapter artifacts and a stitched full-book artifact.
7. Listen with play/pause, seek, skip, speed, chapter navigation, and a sleep timer.
8. Save progress locally and resume after closing and reopening.
9. Cancel or retry generation and recover actionably after interruption, restart, or a missing artifact.

Library and Add book are the primary product destinations. Jobs and storage details are diagnostics, not the everyday information architecture.

## Functional requirements

### Import

- Client and server enforce the same supported types and public limits.
- Import rejects empty, malformed, oversized, encrypted, or unsafe input with actionable messages.
- Chapter order follows TXT parsing or the EPUB spine rather than ZIP entry order.
- M4B chapter order follows validated embedded timestamps; MP3 or chapterless audio receives one reviewable proposed chapter.
- Audio never becomes a book or narration request before explicit transcript approval.
- Stored book creation is collision-safe and idempotent.
- The durable source of truth is local backend storage, not browser storage.

### Generation

- Voice and book ownership are validated at the server boundary.
- Sample readiness requires a concrete playable artifact for the selected book and voice.
- Full-book work is chapter-bounded, records progress, and publishes completion transactionally.
- Cancellation, retries, interrupted-job recovery, retention, and book deletion do not leave falsely ready artifacts.
- Generated filenames and resolved paths remain inside the configured audio root.

### Playback

- One media controller owns transport, seeking, speed, chapter state, progress, end-of-track behavior, and sleep timing.
- Audio routes support byte ranges and do not buffer the complete book before responding.
- The app never exposes a local filesystem path to the browser.
- Missing or stale artifacts produce an actionable recovery state instead of simulated playback.

### Persistence

- SQLite stores books, manuscripts, chapters, jobs, artifact metadata, progress, and worker heartbeat state.
- Generated audio is stored as contained local files under the configured data root.
- Versioned migrations update existing databases and preserve supported v1 data.
- Browser storage is limited to disposable UI cache and does not durably store full manuscript text.

## Privacy, security, and rights

- The trust boundary is one local operating-system user and this application. The design does not claim hosted or shared-device isolation.
- Imported text and generated audio are private content and remain local to the configured application data paths.
- Imported audio, transcripts, and edits remain local. Source audio is temporary and is never accepted as cloning/reference input.
- Narration requests go only to a Kokoro sidecar bound to loopback. The source build may use the network to install dependencies and obtain the model, but narration text is processed locally.
- Model weights are pinned to official `hexgrad/Kokoro-82M` v1.0 and must match SHA-256 `496dba118d1a58f5f3db2efc88dbdc216e0483fc89fe6e47ee1f2c53f18ad1e4` before generation.
- Logs, browser evidence, and version control must not contain manuscript text, generated private audio, secrets, or raw local paths.
- Users may import only DRM-free material they own or are authorized to transform. The product does not remove or bypass DRM.
- Accounts, cloud sync, sharing, community, discovery, reporting, moderation, analytics, telemetry, and multi-device behavior are outside v1.

## Current architecture

- Next.js 16.2.6 and React 19.2.3 serve the local UI and validated API boundary.
- A pinned Node 22 process supervises the application, worker, and Python 3.12 sidecar in development.
- A local worker owns queued sample and full-book generation.
- Kokoro 0.9.4 runs behind a loopback-only Python sidecar.
- SQLite and contained files are authoritative; protected range routes deliver generated WAV artifacts.
- FFmpeg/FFprobe with the Whisper filter and a revision/hash-pinned `ggml-base.en.bin` model provide source-development transcription. The Windows package must approve and bundle this closure before advertising audio import.
- The planned Windows package will add a desktop host and bundle the application runtime, worker, frozen sidecar, and verified model. That packaging is a release target, not current behavior.

## Explicit non-goals for v1

- PDF, DOCX, or scanned-document import.
- Original-audio playback, speech separation, or preservation of music/sound effects from an imported recording.
- DRM circumvention.
- Voice cloning, custom voices, character casting, or multiple voices inside a chapter.
- Ambient, immersive, or other sound-design modes.
- Accounts, hosted services, cloud TTS, cloud storage, sync, sharing, community, analytics, or multi-device access.
- macOS, mobile, browser-hosted, or public catalog releases.

## Release acceptance criteria

- A clean Windows 11 x64 installation completes the primary journey without requiring the user to start a terminal or install Node, Python, or worker services.
- A 1,000-character first sample completes within 60 seconds at p95 after model installation on the documented reference machine.
- Generation is at least 99% crash-free across the release validation corpus, excluding rejected invalid input and explicit cancellation.
- After a forced restart, each running job requeues or fails actionably within 60 seconds without false completion or user-data loss.
- The core journey meets WCAG 2.2 AA and passes keyboard-only, visible-focus, reduced-motion, and NVDA checks.
- CI and the reference Windows environment pass lint, typecheck, unit and route tests, production build, focused Playwright listening flow, and Python sidecar tests.
- A release that advertises MP3/M4B also proves offline transcription, model/binary integrity, DRM rejection, cleanup, transcript approval, and both chaptered and chapterless imports on the clean Windows image.
- The installer, offline model behavior, upgrade, uninstall, data retention, signing, and rollback checks pass before end-user installation instructions are published.
