# Windows release checklist

No checkbox may be completed from source inspection alone. Retain the exact
artifact, sanitized logs, measurements, screenshots or recordings, and the
machine-readable final record outside the repository.

## Source and approval

- [ ] Release commit is intentional, reviewed, and identified by an exact SHA.
- [ ] Production distribution channel is explicitly approved.
- [ ] Production package identity and publisher are explicitly approved.
- [ ] Production certificate or Microsoft Store association is explicitly approved.
- [ ] Version and changelog are approved for publication.
- [ ] `pnpm install --frozen-lockfile` passes with pnpm 11.3.0.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` pass.
- [ ] Focused Playwright listening flow and Python sidecar tests pass.
- [ ] Reviewed notices and CycloneDX SBOM match the exact packaged tree.

## Protected build and signature

- [ ] Build originates from a protected `v*` tag and exact source commit.
- [ ] Protected signing environment requires an independent reviewer.
- [ ] Pull requests and unprotected refs cannot access signing authority.
- [ ] Every external action is pinned to an immutable commit.
- [ ] Checkout credentials are not persisted and workflow permissions are read-only.
- [ ] PFX/password or production signing authority never appears in source or logs.
- [ ] Package identity, publisher, version, and x64 architecture match approval.
- [ ] `SignTool verify /pa /all /v` passes.
- [ ] RFC 3161 timestamp, signer certificate, and SHA-256 digests are retained.
- [ ] Unsigned and signed artifact hashes, sizes, and provenance are retained.
- [ ] Temporary certificate files and certificate-store entries are removed.

## Clean Windows 11 x64 host

- [ ] VM image, Windows build, architecture, and snapshot identifier are retained.
- [ ] Test account is a standard non-administrator.
- [ ] No system Node, npm, pnpm, Python, PyInstaller, Git, or Windows SDK resolves.
- [ ] Windows Defender antivirus and real-time protection are enabled.
- [ ] Online and network-disabled host audits pass.
- [ ] Signed MSIX is installed through normal Windows UI.
- [ ] Start-menu launch shows no console, firewall prompt, Defender warning, or SmartScreen warning.
- [ ] No firewall rule or externally reachable listener is created.

## Core product journey

- [ ] Bounded pasted text imports successfully.
- [ ] Bounded TXT imports successfully.
- [ ] Bounded DRM-free EPUB imports successfully.
- [ ] Title and extracted chapters are reviewable.
- [ ] Each curated voice previews real local audio.
- [ ] A 1,000-character sample generates and plays.
- [ ] Complete-book generation finishes and supports HTTP range playback.
- [ ] Playback position persists across close and reopen.
- [ ] Original imports and explicit external exports remain outside package cleanup.

## Failure, restart, and update matrix

- [ ] Forced worker exit requeues or fails actionably within 60 seconds.
- [ ] Forced host exit requeues or fails actionably within 60 seconds.
- [ ] No interrupted or cancelled job later becomes falsely complete.
- [ ] Trusted higher-version upgrade preserves the supported library and progress.
- [ ] Failed representative migration rolls back to a usable prior database.
- [ ] Offline launch and generation transfer zero model bytes.
- [ ] Insufficient disk fails actionably without partial completion.
- [ ] Corrupt model fails closed without cloud or mock fallback.
- [ ] Blocked loopback port fails safely without broadening the bind address.
- [ ] Non-ASCII Windows user path passes install, generation, playback, and cleanup.
- [ ] No host, server, worker, sidecar, guardian, or child process remains orphaned.

## Accessibility and measurements

- [ ] Keyboard-only journey completes with logical focus order.
- [ ] Focus is visibly distinguishable throughout the core journey.
- [ ] Reduced-motion preference removes non-essential motion.
- [ ] NVDA announces navigation, forms, generation state, errors, player controls, and About notices.
- [ ] MSIX download bytes and installed bytes are recorded.
- [ ] First-window and usable-library launch times are recorded.
- [ ] Cold and warm 1,000-character sample runs are recorded; p95 is below 60 seconds.
- [ ] Host, server, worker, and sidecar idle/generation CPU and RAM are recorded separately.
- [ ] Sample and maximum-corpus temporary disk peaks and final state size are recorded.

## Uninstall and finalization

- [ ] Normal uninstall removes package binaries, model, database, manuscripts, audio, cache, logs, and temp.
- [ ] External exports retain their pre-uninstall SHA-256 hashes.
- [ ] Defender and SmartScreen results are retained.
- [ ] `verify-clean-windows-release.ps1 -Mode Finalize` returns a passing record.
- [ ] `releaseReady` is true only for a production-signed, production-class record.
- [ ] Final artifact, SBOM, notices, provenance, signing evidence, VM evidence, and checklist are retained together.
- [ ] Publication is separately authorized after evidence review.
