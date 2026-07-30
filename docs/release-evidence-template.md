# Windows release evidence

Status: incomplete until every required field is supported by retained build,
signature, installation, update, offline, accessibility, performance, and
uninstall evidence. A test-signed proof is not a production release.

## Current readiness record — 2026-07-22

This is an evidence status record, not a release declaration:

- The source gate passes with pinned Node 22.23.1 and pnpm 11.3.0: lint,
  typecheck, 50 test files / 352 tests, and the production build.
- The unsigned Electron/MSIX proof, frozen Python 3.12.10 sidecar, real offline
  Kokoro sample, 100-package Python closure, installed notices, and deterministic
  CycloneDX 1.6 SBOM have local retained proof artifacts.
- `THIRD_PARTY_NOTICES.md` and the exact Kokoro revision are available from the
  statically prerendered `/about` route.
- GitHub does not yet have the required `msix-signing-proof` protected
  environment, independent reviewer rule, signing secrets, or publisher and
  timestamp variables. No live signed artifact exists.
- Production distribution channel, package identity, certificate/Store
  association, and update proof remain unapproved or unproven.
- No clean Windows 11 VM matrix has passed. Packaging and release remain
  incomplete.

The local proof paths are deliberately not committed here because evidence may
contain machine-specific paths and is retained outside source.

## Protected signing environment

Configure a GitHub environment named `msix-signing-proof` before running Task
11. Restrict it to protected `v*` tags, require an independent reviewer, prevent
self-review and administrator bypass where the repository plan supports those
controls, and keep the following values outside source:

- Environment secret `MSIX_SIGNING_PFX_BASE64`: base64-encoded, password-
  protected test PFX containing a code-signing private key.
- Environment secret `MSIX_SIGNING_PFX_PASSWORD`: the PFX password.
- Environment variable `MSIX_EXPECTED_PUBLISHER`: the exact certificate subject
  and exact `AppxManifest.xml` Publisher value.
- Environment variable `MSIX_TIMESTAMP_URL`: an approved HTTPS RFC 3161
  timestamp service.

Task 11 permits only a clearly labeled test certificate and test package
identity. Do not place a production key in this environment. Production Store
identity or direct-distribution certificate selection remains a separate
approval and must replace the test identity through the update-channel task.

## Build identity

| Field | Evidence |
| --- | --- |
| Source repository | Pending |
| Protected tag | Pending |
| Exact commit SHA | Pending |
| GitHub run id and attempt | Pending |
| Runner image and image version | Pending |
| Node / pnpm / Python versions | Pending |
| Windows SDK product version | Pending |
| Electron / Node binary hashes | Pending |
| Model revision and five resource hashes | Pending |
| Frozen lockfile and requirements hashes | Pending |

## Artifact and signature

| Field | Evidence |
| --- | --- |
| Package identity / publisher / version / architecture | Pending |
| Signed MSIX filename, byte size, and SHA-256 | Pending |
| Unsigned input SHA-256 | Pending |
| Certificate subject, thumbprint, and validity | Pending |
| File and timestamp digest algorithms | Pending |
| RFC 3161 timestamp authority and timestamp | Pending |
| `SignTool verify /pa /all /v` result | Pending |
| `AppxSignature.p7x` presence | Pending |
| Signing mode | Test proof only until channel approval |

The signing script writes machine-readable `signing-evidence.json` beside the
test-signed artifact. It must contain no PFX bytes, passwords, manuscripts,
generated audio, environment dump, command line, or full local path.

## Signing-authority isolation

| Control | Evidence |
| --- | --- |
| Workflow has no `pull_request` or `pull_request_target` trigger | Pending |
| Job requires a `v*` tag and protected environment | Pending |
| Environment secrets are scoped only to the signing step | Pending |
| Checkout does not persist credentials | Pending |
| Workflow permissions are read-only | Pending |
| Every external action uses a full immutable commit SHA | Pending |
| Missing or malformed signing inputs fail before artifact retention | Pending |
| Temporary PFX/public certificate and certificate-store entries are removed | Pending |

## Required repository and package gates

| Gate | Evidence |
| --- | --- |
| Frozen JavaScript install | Pending |
| Lint | Pending |
| Typecheck | Pending |
| JavaScript unit and route tests | Pending |
| Python sidecar tests | Pending |
| Production Next build | Pending |
| Frozen sidecar real offline sample | Pending |
| Electron package security proof | Pending |
| MSIX SDK pack/unpack validation | Pending |

## Release verification matrix

Retain machine details, commands, sanitized logs, measurements, and results for
each scenario. Do not infer these from a successful signing run.

Run the host audit inside the clean VM before installation. Its output directory
must be new and outside the repository:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-clean-windows-release.ps1 `
  -Mode HostAudit `
  -OutputDirectory C:\ReleaseEvidence\host-online `
  -MsixPath C:\ReleaseInput\AdaptiveAudioPlayer.msix
```

Repeat with networking disabled and `-RequireOffline`. The audit fails unless
the VM is Windows 11 x64, the current account is non-administrator, Defender is
active, prohibited developer commands are absent, and the MSIX has a valid
signature.

After every manual and measured scenario has retained evidence, create
`scenario-results.json` using schema version 1 and finalize:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-clean-windows-release.ps1 `
  -Mode Finalize `
  -OutputDirectory C:\ReleaseEvidence\final `
  -HostAuditPath C:\ReleaseEvidence\host-online\host-audit.json `
  -ScenarioResultsPath C:\ReleaseEvidence\scenario-results.json
```

Every evidence reference in the scenario file must be relative to the retained
evidence root. Absolute paths, `..`, placeholders, waivers, missing scenarios,
failed scenarios, and measurements outside the release targets are rejected.
A `test-proof` may pass while `releaseReady` remains false. Only a
`production-release` record using `signingMode: production` can set
`releaseReady: true`.

The scenario record requires:

```json
{
  "schemaVersion": 1,
  "verificationClass": "test-proof",
  "signingMode": "test",
  "sourceCommit": "40 lowercase hexadecimal characters",
  "signedArtifactSha256": "64 lowercase hexadecimal characters",
  "scenarios": [
    {
      "id": "standard-user-install-ui",
      "status": "pass",
      "evidence": ["install/standard-user-ui.mp4"],
      "measurements": {}
    }
  ]
}
```

The committed example is intentionally incomplete; the finalizer requires all
scenario ids listed below and their scenario-specific measurements.

| Scenario | Evidence |
| --- | --- |
| Standard-user install from Windows UI | Pending |
| Start-menu launch with no terminal or firewall prompt | Pending |
| TXT and bounded DRM-free EPUB import | Pending |
| Preview, sample, full-book generation, and range playback | Pending |
| Progress persistence after close/reopen | Pending |
| Forced worker and host recovery within 60 seconds | Pending |
| Trusted upgrade and failed-migration rollback | Pending |
| Offline launch and generation with zero model transfer | Pending |
| Insufficient disk, corrupt model, and blocked loopback behavior | Pending |
| Non-ASCII Windows user path and standard-user permissions | Pending |
| Keyboard, visible focus, reduced motion, and NVDA | Pending |
| p95 1,000-character sample below 60 seconds | Pending |
| CPU, RAM, temporary disk peak, and final disk footprint | Pending |
| Clean uninstall removes package state and preserves external exports | Pending |
| Defender / SmartScreen result | Pending |

## Approval and publication

- Production distribution channel: Pending explicit approval.
- Production package identity: Pending explicit approval.
- Production certificate or Store association: Pending explicit approval.
- License inventory and human-readable notices: Source implementation and local
  package proof complete; release artifact retention pending.
- Machine-readable SBOM: Source implementation and deterministic local proof
  complete; release artifact retention pending.
- Clean-VM release record and final checklist: Pending Task 14.
- Publication authorization: Not granted by this evidence template.
