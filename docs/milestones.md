# Milestones

## Milestone 1 - Source core loop (implemented)

- Import bounded TXT or DRM-free EPUB content.
- Review the title and parsed chapters.
- Preview and choose one curated narrator.
- Generate and play a real sample artifact.
- Generate a complete audiobook and resume saved progress.
- Recover actionably from cancellation, restart, failure, or a missing artifact.

## Milestone 2 - Windows desktop proof (next)

- Package the standalone application, pinned Node 22 runtime, frozen Python 3.12
  sidecar, and verified Kokoro resources behind an Electron host.
- Produce a signed, per-user Windows 11 x64 MSIX with no terminal, system
  Node/Python dependency, runtime download, firewall prompt, or orphan process.
- Keep all mutable state inside the Windows application-data container.

## Milestone 3 - Release verification

- Pass clean install, upgrade, uninstall, offline generation, restart recovery,
  insufficient-disk, corrupt-model, blocked-port, and non-ASCII-path scenarios.
- Meet the approved performance, crash-free generation, accessibility, and
  recovery targets on the documented reference machine.
- Publish non-technical install and use instructions only after the complete
  release matrix passes.
