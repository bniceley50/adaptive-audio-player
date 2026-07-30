# Adaptive Audio Player

[![CI](https://github.com/bniceley50/adaptive-audio-player/actions/workflows/ci.yml/badge.svg)](https://github.com/bniceley50/adaptive-audio-player/actions/workflows/ci.yml)

Choose how your audiobook sounds.

Adaptive Audio Player is a private, local-first audiobook application for turning authorized text or an eligible DRM-free recording into narrated audio. The source build accepts TXT, DRM-free EPUB, pasted text, and transcript-mediated MP3/M4B imports; every audio transcript must be reviewed and approved before narration.

## Release status

The application currently runs from source. A signed Windows installer has not shipped, and there is no hosted or live cloud demo. The first packaged release targets Windows 11 x64; end-user installation instructions will be added after that package is built and verified.

## Supported v1 contract

| Area | Supported behavior |
|---|---|
| Platform | Windows 11 x64 is the first release target. macOS is deferred. |
| Source input | Pasted plain text, `.txt` files up to 5,000,000 bytes, and DRM-free `.epub` files up to 25,000,000 compressed bytes. |
| Audio re-narration | One authorized, DRM-free `.mp3` or `.m4b` recording up to 2,000,000,000 bytes and 30 hours; local transcription is limited to one audio stream and at most 300 embedded chapters. |
| Extracted content | Up to 1,000,000 characters, 300 chapters, and a 200-character title. |
| Voices | Marlowe, Sloane, and Jules use Kokoro Fast / Compatible. One optional Chatterbox High Quality narrator becomes available after explicit local installation on supported NVIDIA hardware. |
| Narration | One selected voice per generated sample or full book. |
| Storage | A local SQLite database and contained local files hold books, chapters, jobs, generated audio, and playback progress. |
| Rights | Import only DRM-free material you own or are authorized to transform. The app does not bypass DRM. |

PDF, DOCX, original-audio playback, voice cloning, custom voice uploads, character casting, ambient or immersive sound design, accounts, cloud sync, sharing, community features, analytics, and multi-device behavior are not supported.

## Core flow

1. Paste plain text, add TXT/DRM-free EPUB, or choose an authorized MP3/M4B recording.
2. Review the extracted book or edit and explicitly approve every locally transcribed audio chapter.
3. Choose Fast / Compatible or an installed High Quality engine, then preview and select an available narrator.
4. Generate and play a sample.
5. Generate the complete book.
6. Listen with chapter navigation, seeking, playback speed, sleep timer, and saved progress.
7. Reopen the app and continue listening or recover from an interrupted job.

## Privacy and data handling

- Imported text, generated audio, job state, and listening progress stay in the configured local data directory and SQLite database.
- Imported audio is streamed into contained temporary storage, transcribed locally, and deleted with the intermediate transcript before the review draft is returned. Imported audio is never used as reference audio.
- Narration runs through authenticated sidecars bound to the local loopback interface. Kokoro is always the default; optional Chatterbox generation is local and never accepts reference audio. Production generation has no cloud TTS or mock-audio fallback.
- Browser storage is disposable UI cache; it is not the durable home for a manuscript.
- Generated artifacts are served through validated, range-capable application routes without exposing filesystem paths.
- The app has no account, sharing, telemetry, analytics, moderation, or cloud-sync requirement.
- Running from source requires downloading developer dependencies. Narration model resources are revision-pinned and SHA-256 verified before use; manuscript text is processed locally. Chatterbox is downloaded only by its explicit install command.

See [SECURITY.md](SECURITY.md) for the trust boundary, protected data, and release controls.

## Current limitations

- There is no packaged end-user build yet; the repository is a developer build.
- Fast / Compatible offers three curated voices. High Quality offers one bundled synthetic narrator only after its separate runtime is installed and a supported NVIDIA GPU with at least 8 GB VRAM is ready.
- Import does not support scanned documents, layout preservation, DRM-protected material, or formats beyond TXT, EPUB, MP3, and M4B.
- Generation speed depends on the local machine. The release performance target has not yet been certified on the reference Windows hardware.
- The source-development model cache is not a redistributable installer. The packaged release must bundle and verify its model separately.
- Source audio transcription currently requires a verified FFmpeg/FFprobe build with the Whisper filter on `PATH` and the pinned `ggml-base.en.bin` model in the documented local app-data path. Those binaries are not yet approved or bundled in the Windows package.

## Developer setup

This section is for contributors running the source tree, not for end users.

Prerequisites:

- Node.js 22.x
- pnpm 11.3.0
- Python 3.12
- Optional High Quality: 64-bit Python 3.11, a CUDA-capable NVIDIA GPU with at least 8 GB VRAM, and roughly 3.2 GB for model files plus the pinned runtime
- Audio re-narration: FFmpeg/FFprobe with the `whisper` filter and the exact pinned Whisper model recorded in `DECISIONS.md`

On Windows PowerShell:

```powershell
pnpm install --frozen-lockfile
python -m venv data/local-tts/.venv
.\data\local-tts\.venv\Scripts\python.exe -m pip install --requirement tts_sidecar/requirements.txt
Copy-Item .env.example .env.local
pnpm dev
```

The requirements file pins the spaCy language model to its official release wheel and SHA-256 because the model is not distributed through the Python package index. Open [http://127.0.0.1:3100](http://127.0.0.1:3100). `pnpm dev` supervises the pinned Python sidecar, local generation worker, and Next.js application. It validates the Python environment but does not create it or install packages automatically.

To add the optional High Quality engine, run this explicit command once and
then restart `pnpm dev`:

```powershell
pnpm chatterbox:install
```

The installer creates an ignored app-managed runtime at
`data/local-chatterbox`, pins `chatterbox-tts` 0.1.7 and the approved immutable
model revision, verifies every model file by size and SHA-256, and preserves the
license and model card. Ordinary startup is offline for this engine and never
downloads or repairs it automatically. The app uses only Chatterbox's bundled
synthetic conditioning; reference-audio upload and voice cloning are not
supported. If High Quality is missing or unhealthy, the interface explains why
and Fast / Compatible remains usable.

## Developer commands

```powershell
pnpm gate                                      # lint, typecheck, unit and route tests
pnpm build                                     # production web build
pnpm test:e2e --grep "core listening"         # focused browser flow
.\data\local-tts\.venv\Scripts\python.exe -m unittest discover -s tts_sidecar -t .
.\data\local-tts\.venv\Scripts\python.exe -m unittest discover -s chatterbox_sidecar -t .
```

CI uses Node 22, pnpm 11.3.0, and Python 3.12.10, then runs the same gate, build, focused Playwright flow, and Python sidecar tests.

## Architecture

- Next.js 16.1.7 and React 19.2.3 provide the local application UI and APIs.
- SQLite is the authoritative store for books, chapters, jobs, artifacts, and playback progress; versioned migrations update existing local databases.
- A supervised Node worker sends bounded narration requests to the Python 3.12 Kokoro sidecar and, when explicitly installed and healthy, a separate Python 3.11 Chatterbox sidecar. Both are loopback-only and authenticated with independent per-launch secrets.
- Samples and full books are real generated WAV artifacts. Full-book generation renders chapters separately and stitches them into the current full-book artifact.
- MP3/M4B re-narration probes and transcribes locally through a same-origin streaming API, deletes temporary source/intermediate files, and enters the normal book flow only after transcript approval.
- Generated files live under the configured local data root and are streamed through protected, range-capable routes.
- The planned desktop package will supervise these local processes and bundle the verified model, but that packaging work is not yet complete.

Detailed requirements and acceptance criteria are in [docs/spec.md](docs/spec.md); execution order and release targets are in [PLAN.md](PLAN.md).
