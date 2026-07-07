# Test Hygiene Tasks

## Windows SQLite temp directory cleanup

Status: open

Evidence:
- 2026-07-06 on `feature/local-tts-renderer`: `pnpm gate` reached lint and typecheck, then `pnpm test` failed with 15 failed files / 52 failed tests. Failures were `EPERM, Permission denied` while test cleanup called `rmSync(dir, { recursive: true, force: true })` on `C:\Users\brian\AppData\Local\Temp\adaptive-audio-player-*` directories.
- 2026-07-06 on `main`: `pnpm test` failed with the same 15 failed files / 52 failed tests and the same `EPERM` temp directory cleanup pattern.

Task:
- Fix the Windows test cleanup path so SQLite-backed tests close/release database handles before deleting temp directories.
- Do not treat the local Windows gate as clean until this is fixed.
