# Security

## V1 trust boundary

V1 is a private, single-user, local-first Windows 11 x64 desktop product. The
application runtime, Kokoro model, optional explicitly installed Chatterbox
runtime, worker, sidecars, SQLite database, manuscripts, and generated audio
stay on the user's machine. Production narration does not
send manuscript text to cloud TTS and has no automatic mock fallback.

The local operating-system user and the packaged application are the v1 trust
boundary. Accounts, cloud sync, public sharing, community features, analytics,
and multi-device access are not part of v1. If hosted or shared access is added,
implementation must stop and introduce verified authentication, per-resource
authorization, storage isolation, quotas, and a new privacy review first.

No email-only or otherwise unverified login route may create an authenticated
session. Legacy account and workspace-session code is migration-only until it is
removed and must not be represented as a supported security boundary.

## Protected assets

- Imported TXT and DRM-free EPUB source material
- Temporary authorized MP3/M4B source material and reviewed transcripts
- Extracted manuscripts and chapter metadata
- Generated samples and full-book audio
- Playback position and listening preferences
- Local job, failure, and recovery state

Raw manuscripts, audio bytes, local identifiers, and filesystem paths are
private. Browser-facing responses use bounded DTOs and artifact URLs or IDs;
they never contain raw storage paths.

## Content rights

- Accept only DRM-free material the user owns or is authorized to transform.
- Never bypass, remove, or help defeat DRM.
- Do not publicly share imported material or generated audio.
- MP3/M4B re-narration is transcript-mediated only. Do not ingest protected
  services, retain the recording after transcription, or use it as reference
  audio for cloning or impersonation.

## Input and resource limits

- TXT input: at most 5 MB.
- EPUB input: at most 25 MB compressed and DRM-free.
- MP3/M4B input: at most 2 GB, 30 hours, one audio stream, and 300 embedded
  chapters; reject encrypted/protected codec markers and malformed timing.
- Extracted content: at most 1,000,000 characters and 300 chapters.
- Validate extension, media type, structure, expanded size, entry count, and
  text bounds at the server boundary before persistence or generation.
- Reject malformed, encrypted, path-traversing, deeply nested, or
  decompression-bomb EPUB content with a non-technical error.
- Allow only server-owned voice IDs and server-derived book/chapter metadata in
  generation requests.

## Local service and filesystem rules

- Local service endpoints must be reachable only through the packaged local
  application boundary; packaging must document loopback ports and firewall
  behavior before release.
- Resolve generated files beneath the configured generated-audio root and reject
  absolute paths, traversal, prefix confusion, and unsupported symlink escapes.
- Stream large audio with validated HTTP byte ranges; never read a complete full
  book into server memory for routine playback.
- Do not log manuscript content, secrets, raw local paths, or generated audio.
- Keep secrets and model/render payloads out of git.
- Fail closed when the local TTS engine is absent, unhealthy, misconfigured, or
  returns invalid output.
- Keep transcription on the local machine, verify the pinned Whisper model by
  size and SHA-256 before use, bound FFmpeg/FFprobe execution and diagnostics,
  and remove contained source and intermediate transcript files on every exit.
- Bind every narration sidecar to loopback, authenticate it with an independent
  per-launch secret, and reject compressed, unbounded, or oversized render
  requests. The optional Chatterbox interface must not accept reference audio,
  voice-cloning inputs, or unapproved narrator IDs.

## Retention and deletion

- Retain a book's source, extracted manuscript, current sample, current full-book
  artifact, playback progress, and required job metadata locally until the user
  deletes the book.
- Remove superseded generated artifacts and failed or cancelled temporary files
  during bounded replacement and cleanup; v1 does not retain advanced render
  history as a customer feature.
- Deleting a book removes its imported blobs, manuscript, chapters, generated
  files, playback state, jobs, artifacts, and database metadata without touching
  another book.
- Validate every deletion target against the generated-data root. Never use a
  broad recursive deletion target.
- A partial cleanup is reported actionably and remains retryable; it is never
  silently presented as complete.

## Release security gate

- [ ] Supported input formats and every size boundary are tested.
- [ ] MP3/M4B probe, DRM rejection, local transcription, transcript approval,
      and temporary-file cleanup pass on the exact packaged runtime.
- [ ] Generated and archived audio deny cross-book access and expose no paths.
- [ ] No unverified login route can create a session.
- [ ] No routine playback update uploads a manuscript or full-library snapshot.
- [ ] Cancellation cannot later transition to completion.
- [ ] Restart recovery cannot create duplicate or falsely completed work.
- [ ] Book deletion proves complete per-book cleanup and isolation.
- [ ] Environment variables and local service configuration fail safely.
- [ ] No secrets, model weights, manuscripts, generated audio, or private paths
      appear in git, logs, browser responses, screenshots, or release evidence.
