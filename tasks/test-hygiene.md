# Test Hygiene

## Repaired baseline

Status: green locally on Windows as of 2026-07-18

Supported CI runtimes:
- Ubuntu 24.04
- Node 22
- pnpm 11.3.0
- Python 3.12.10

Local verification evidence:
- Two consecutive `pnpm install --frozen-lockfile` runs succeeded without tracked-file drift.
- `pnpm lint` passed.
- `pnpm typecheck` passed.
- `pnpm test` passed 30 files and 111 tests.
- `pnpm build` completed a production build.
- `python -m unittest discover tts_sidecar` passed 4 tests.

The current Windows workstation runs Node 24.16.0, so pnpm correctly warns that
it is outside the supported Node 22 policy. CI is the authoritative Node 22
baseline. The focused Playwright core flow remains intentionally outside the
required CI gate until Task 3.7 makes it deterministic.

## Windows SQLite temp directory cleanup

Status: not reproduced on the repaired dependency baseline; monitor on Node 22

Historical evidence:
- 2026-07-06 on `feature/local-tts-renderer`: `pnpm gate` reached lint and typecheck, then `pnpm test` failed with 15 failed files / 52 failed tests. Failures were `EPERM, Permission denied` while test cleanup called `rmSync(dir, { recursive: true, force: true })` on `C:\Users\brian\AppData\Local\Temp\adaptive-audio-player-*` directories.
- 2026-07-06 on `main`: `pnpm test` failed with the same 15 failed files / 52 failed tests and the same `EPERM` temp directory cleanup pattern.

Current evidence:
- 2026-07-18 after the pinned pnpm reinstall, all 111 tests passed on Windows without an SQLite temp-directory cleanup error.
- No cleanup implementation changed, so a single green run is evidence that the failure is not currently reproducible, not proof that an intermittent handle race is impossible.

If the failure returns:
- Capture the exact test file and retained temp path.
- Confirm every SQLite handle is closed before recursive deletion.
- Add a focused regression test before changing cleanup behavior.
