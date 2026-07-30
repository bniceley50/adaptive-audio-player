[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("HostAudit", "Finalize")]
    [string]$Mode,

    [Parameter(Mandatory = $true)]
    [string]$OutputDirectory,

    [string]$MsixPath,
    [string]$HostAuditPath,
    [string]$ScenarioResultsPath,
    [switch]$RequireOffline
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$schemaVersion = 1
$requiredScenarioIds = @(
    "standard-user-install-ui",
    "start-menu-launch",
    "txt-import",
    "epub-import",
    "voice-preview",
    "sample-generation",
    "full-book-range-playback",
    "progress-reopen",
    "worker-recovery",
    "host-recovery",
    "trusted-upgrade",
    "migration-rollback",
    "offline-zero-model-transfer",
    "insufficient-disk",
    "corrupt-model",
    "blocked-loopback",
    "non-ascii-user",
    "keyboard-only",
    "visible-focus",
    "reduced-motion",
    "nvda",
    "resource-measurements",
    "clean-uninstall",
    "defender-smartscreen",
    "no-orphans"
)

function New-OutputDirectory {
    param([Parameter(Mandatory = $true)][string]$Candidate)

    $fullPath = [System.IO.Path]::GetFullPath($Candidate)
    if (Test-Path -LiteralPath $fullPath) {
        throw "Evidence output must not already exist: $fullPath"
    }
    $parent = Split-Path -Parent $fullPath
    if (-not $parent -or -not (Test-Path -LiteralPath $parent -PathType Container)) {
        throw "Evidence output parent must already exist: $parent"
    }
    $root = [System.IO.Path]::GetPathRoot($fullPath)
    if ($fullPath.TrimEnd("\") -eq $root.TrimEnd("\")) {
        throw "Evidence output cannot be a filesystem root."
    }
    New-Item -ItemType Directory -Path $fullPath | Out-Null
    return $fullPath
}

function Resolve-RegularFile {
    param(
        [Parameter(Mandatory = $true)][string]$Candidate,
        [Parameter(Mandatory = $true)][string]$Label,
        [string]$Extension
    )

    $resolved = (Resolve-Path -LiteralPath $Candidate -ErrorAction Stop).Path
    $item = Get-Item -LiteralPath $resolved -Force
    if (-not $item.PSIsContainer -and -not ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint)) {
        if ($Extension -and $item.Extension -ne $Extension) {
            throw "$Label must have extension $Extension."
        }
        return $resolved
    }
    throw "$Label must be a regular file."
}

function Write-JsonEvidence {
    param(
        [Parameter(Mandatory = $true)]$Value,
        [Parameter(Mandatory = $true)][string]$Destination
    )

    $json = $Value | ConvertTo-Json -Depth 20
    [System.IO.File]::WriteAllText(
        $Destination,
        "$json`n",
        [System.Text.UTF8Encoding]::new($false)
    )
}

function New-Check {
    param(
        [Parameter(Mandatory = $true)][string]$Id,
        [Parameter(Mandatory = $true)][bool]$Passed,
        [Parameter(Mandatory = $true)][string]$Evidence
    )

    return [ordered]@{
        id = $Id
        status = if ($Passed) { "pass" } else { "fail" }
        evidence = $Evidence
    }
}

function Test-Number {
    param($Value)
    return $null -ne $Value -and $Value -is [ValueType] -and [double]$Value -ge 0
}

function Get-PropertyValue {
    param(
        [Parameter(Mandatory = $true)]$Object,
        [Parameter(Mandatory = $true)][string]$Name
    )

    $property = $Object.PSObject.Properties[$Name]
    if ($null -eq $property) {
        return $null
    }
    return $property.Value
}

function Test-RelativeEvidenceReference {
    param([Parameter(Mandatory = $true)][string]$Reference)

    if ([string]::IsNullOrWhiteSpace($Reference)) {
        return $false
    }
    if ($Reference -match "(?i)\b(pending|todo|tbd|waived|not run)\b") {
        return $false
    }
    if (
        [System.IO.Path]::IsPathRooted($Reference) -or
        $Reference.StartsWith("\\") -or
        $Reference.Contains("..")
    ) {
        return $false
    }
    return $true
}

function Invoke-HostAudit {
    $outputRoot = New-OutputDirectory -Candidate $OutputDirectory
    $checks = [System.Collections.Generic.List[object]]::new()
    $os = Get-CimInstance -ClassName Win32_OperatingSystem
    $windows11 = $os.Caption -match "Windows 11" -and [int]$os.BuildNumber -ge 22000
    $checks.Add((New-Check "windows-11" $windows11 "$($os.Caption), build $($os.BuildNumber)"))

    $isX64 = [Environment]::Is64BitOperatingSystem -and $env:PROCESSOR_ARCHITECTURE -eq "AMD64"
    $checks.Add((New-Check "windows-x64" $isX64 ([Environment]::Is64BitOperatingSystem.ToString())))

    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    $isAdministrator = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    $checks.Add((New-Check "standard-user" (-not $isAdministrator) "administrator=$isAdministrator"))

    $developerCommands = @(
        "git",
        "makeappx",
        "node",
        "npm",
        "pnpm",
        "pyinstaller",
        "python",
        "python3",
        "signtool"
    )
    $presentDeveloperCommands = @(
        $developerCommands | Where-Object {
            $null -ne (Get-Command $_ -ErrorAction SilentlyContinue)
        }
    )
    $developerEvidence = if ($presentDeveloperCommands.Count -eq 0) {
        "No prohibited developer commands resolved."
    } else {
        "Resolved prohibited commands: $($presentDeveloperCommands -join ', ')"
    }
    $checks.Add(
        (New-Check "no-developer-tools" ($presentDeveloperCommands.Count -eq 0) $developerEvidence)
    )

    $defenderEvidence = "Microsoft Defender status unavailable."
    $defenderReady = $false
    try {
        $defender = Get-MpComputerStatus
        $defenderReady =
            [bool]$defender.AntivirusEnabled -and
            [bool]$defender.RealTimeProtectionEnabled
        $defenderEvidence =
            "antivirus=$($defender.AntivirusEnabled), realtime=$($defender.RealTimeProtectionEnabled)"
    } catch {
        $defenderReady = $false
    }
    $checks.Add((New-Check "windows-defender-enabled" $defenderReady $defenderEvidence))

    $activeAdapters = @(
        Get-NetAdapter -ErrorAction SilentlyContinue |
            Where-Object { $_.Status -eq "Up" -and $_.HardwareInterface } |
            Select-Object -ExpandProperty InterfaceDescription
    )
    $offline = $activeAdapters.Count -eq 0
    $offlinePassed = -not $RequireOffline -or $offline
    $offlineEvidence = if ($RequireOffline) {
        "required=true, activeHardwareAdapters=$($activeAdapters.Count)"
    } else {
        "required=false, activeHardwareAdapters=$($activeAdapters.Count)"
    }
    $checks.Add((New-Check "offline-network-state" $offlinePassed $offlineEvidence))

    $artifact = $null
    try {
        if ([string]::IsNullOrWhiteSpace($MsixPath)) {
            throw "A signed MSIX path is required."
        }
        $resolvedMsix = Resolve-RegularFile -Candidate $MsixPath -Label "MSIX artifact" -Extension ".msix"
        $signature = Get-AuthenticodeSignature -LiteralPath $resolvedMsix
        $artifactHash = (Get-FileHash -LiteralPath $resolvedMsix -Algorithm SHA256).Hash.ToLowerInvariant()
        $artifactItem = Get-Item -LiteralPath $resolvedMsix
        $signatureValid =
            $signature.Status -eq [System.Management.Automation.SignatureStatus]::Valid -and
            $null -ne $signature.SignerCertificate
        $checks.Add(
            (New-Check "signed-msix" $signatureValid (
                "status=$($signature.Status), file=$($artifactItem.Name)"
            ))
        )
        $artifact = [ordered]@{
            fileName = $artifactItem.Name
            bytes = $artifactItem.Length
            sha256 = $artifactHash
            signatureStatus = $signature.Status.ToString()
            signerSubject = if ($signature.SignerCertificate) {
                $signature.SignerCertificate.Subject
            } else {
                $null
            }
            signerThumbprint = if ($signature.SignerCertificate) {
                $signature.SignerCertificate.Thumbprint.ToLowerInvariant()
            } else {
                $null
            }
        }
    } catch {
        $checks.Add((New-Check "signed-msix" $false $_.Exception.Message))
    }

    $passed = @($checks | Where-Object { $_.status -eq "fail" }).Count -eq 0
    $record = [ordered]@{
        schemaVersion = $schemaVersion
        recordType = "clean-windows-host-audit"
        generatedAtUtc = [DateTime]::UtcNow.ToString("o")
        status = if ($passed) { "pass" } else { "blocked" }
        host = [ordered]@{
            operatingSystem = $os.Caption
            version = $os.Version
            build = [int]$os.BuildNumber
            architecture = if ([Environment]::Is64BitOperatingSystem) { "x64" } else { "unsupported" }
            standardUser = -not $isAdministrator
            offlineRequired = [bool]$RequireOffline
            activeHardwareAdapterCount = $activeAdapters.Count
        }
        artifact = $artifact
        checks = $checks
    }
    $destination = Join-Path $outputRoot "host-audit.json"
    Write-JsonEvidence -Value $record -Destination $destination
    Write-Output $destination
    if (-not $passed) {
        exit 2
    }
}

function Add-Failure {
    param(
        [System.Collections.Generic.List[string]]$Failures,
        [Parameter(Mandatory = $true)][string]$Message
    )
    $Failures.Add($Message)
}

function Assert-Measurement {
    param(
        [Parameter(Mandatory = $true)]$Measurements,
        [Parameter(Mandatory = $true)][string]$Name,
        [System.Collections.Generic.List[string]]$Failures,
        [scriptblock]$Predicate = { param($value) (Test-Number $value) }
    )

    $value = Get-PropertyValue -Object $Measurements -Name $Name
    if (-not (& $Predicate $value)) {
        Add-Failure -Failures $Failures -Message "Measurement $Name is missing or outside its required bound."
    }
}

function Invoke-Finalize {
    $outputRoot = New-OutputDirectory -Candidate $OutputDirectory
    $resolvedHostAudit = Resolve-RegularFile -Candidate $HostAuditPath -Label "Host audit" -Extension ".json"
    $resolvedScenarios = Resolve-RegularFile -Candidate $ScenarioResultsPath -Label "Scenario results" -Extension ".json"
    $hostAudit = Get-Content -LiteralPath $resolvedHostAudit -Raw | ConvertFrom-Json
    $scenarioRecord = Get-Content -LiteralPath $resolvedScenarios -Raw | ConvertFrom-Json
    $failures = [System.Collections.Generic.List[string]]::new()

    if (
        (Get-PropertyValue $hostAudit "schemaVersion") -ne $schemaVersion -or
        (Get-PropertyValue $hostAudit "recordType") -ne "clean-windows-host-audit" -or
        (Get-PropertyValue $hostAudit "status") -ne "pass"
    ) {
        Add-Failure $failures "The clean Windows host audit is missing, incompatible, or not passing."
    }

    $verificationClass = Get-PropertyValue $scenarioRecord "verificationClass"
    $signingMode = Get-PropertyValue $scenarioRecord "signingMode"
    if ((Get-PropertyValue $scenarioRecord "schemaVersion") -ne $schemaVersion) {
        Add-Failure $failures "The scenario record schemaVersion is missing or incompatible."
    }
    if ($verificationClass -notin @("test-proof", "production-release")) {
        Add-Failure $failures "verificationClass must be test-proof or production-release."
    }
    if ($signingMode -notin @("test", "production")) {
        Add-Failure $failures "signingMode must be test or production."
    }
    if ($verificationClass -eq "production-release" -and $signingMode -ne "production") {
        Add-Failure $failures "A production release cannot use test signing."
    }

    $sourceCommit = Get-PropertyValue $scenarioRecord "sourceCommit"
    if ($sourceCommit -notmatch "^[0-9a-f]{40}$") {
        Add-Failure $failures "sourceCommit must be an exact lowercase 40-character commit SHA."
    }
    $scenarioArtifactHash = Get-PropertyValue $scenarioRecord "signedArtifactSha256"
    $hostArtifact = Get-PropertyValue $hostAudit "artifact"
    $hostArtifactHash = if ($null -ne $hostArtifact) {
        Get-PropertyValue $hostArtifact "sha256"
    } else {
        $null
    }
    if (
        $scenarioArtifactHash -notmatch "^[0-9a-f]{64}$" -or
        $scenarioArtifactHash -ne $hostArtifactHash
    ) {
        Add-Failure $failures "The scenario artifact hash must match the signed MSIX from host-audit.json."
    }

    $scenarios = @(Get-PropertyValue $scenarioRecord "scenarios")
    $scenarioIds = @($scenarios | ForEach-Object { Get-PropertyValue $_ "id" })
    $duplicates = @(
        $scenarioIds |
            Group-Object |
            Where-Object { $_.Count -ne 1 } |
            Select-Object -ExpandProperty Name
    )
    if ($duplicates.Count -gt 0) {
        Add-Failure $failures "Scenario ids must be unique: $($duplicates -join ', ')."
    }
    $missing = @($requiredScenarioIds | Where-Object { $_ -notin $scenarioIds })
    $unexpected = @($scenarioIds | Where-Object { $_ -notin $requiredScenarioIds })
    if ($missing.Count -gt 0) {
        Add-Failure $failures "Missing scenarios: $($missing -join ', ')."
    }
    if ($unexpected.Count -gt 0) {
        Add-Failure $failures "Unexpected scenarios: $($unexpected -join ', ')."
    }

    foreach ($scenario in $scenarios) {
        $id = Get-PropertyValue $scenario "id"
        if ((Get-PropertyValue $scenario "status") -ne "pass") {
            Add-Failure $failures "Scenario $id did not pass."
        }
        $references = @(Get-PropertyValue $scenario "evidence")
        if (
            $references.Count -eq 0 -or
            @($references | Where-Object {
                $_ -isnot [string] -or -not (Test-RelativeEvidenceReference $_)
            }).Count -gt 0
        ) {
            Add-Failure $failures "Scenario $id needs retained, relative, non-placeholder evidence references."
        }
    }

    $byId = @{}
    foreach ($scenario in $scenarios) {
        $byId[(Get-PropertyValue $scenario "id")] = $scenario
    }
    if ($byId.ContainsKey("start-menu-launch")) {
        $measurements = Get-PropertyValue $byId["start-menu-launch"] "measurements"
        Assert-Measurement $measurements "firstWindowMilliseconds" $failures
        Assert-Measurement $measurements "usableLibraryMilliseconds" $failures
        foreach ($name in @("terminalPrompt", "firewallPrompt")) {
            if ((Get-PropertyValue $measurements $name) -ne $false) {
                Add-Failure $failures "start-menu-launch must record $name=false."
            }
        }
    }
    if ($byId.ContainsKey("sample-generation")) {
        $measurements = Get-PropertyValue $byId["sample-generation"] "measurements"
        Assert-Measurement $measurements "sampleCharacterCount" $failures {
            param($value) (Test-Number $value) -and [double]$value -ge 1000
        }
        Assert-Measurement $measurements "p95Milliseconds" $failures {
            param($value) (Test-Number $value) -and [double]$value -lt 60000
        }
    }
    foreach ($id in @("worker-recovery", "host-recovery")) {
        if ($byId.ContainsKey($id)) {
            $measurements = Get-PropertyValue $byId[$id] "measurements"
            Assert-Measurement $measurements "recoverySeconds" $failures {
                param($value) (Test-Number $value) -and [double]$value -le 60
            }
        }
    }
    if ($byId.ContainsKey("offline-zero-model-transfer")) {
        $measurements = Get-PropertyValue $byId["offline-zero-model-transfer"] "measurements"
        Assert-Measurement $measurements "networkBytes" $failures {
            param($value) (Test-Number $value) -and [double]$value -eq 0
        }
    }
    if ($byId.ContainsKey("resource-measurements")) {
        $measurements = Get-PropertyValue $byId["resource-measurements"] "measurements"
        foreach ($name in @(
            "msixDownloadBytes",
            "installedBytes",
            "samplePeakTemporaryBytes",
            "maximumBookPeakTemporaryBytes",
            "finalStateBytes"
        )) {
            Assert-Measurement $measurements $name $failures
        }
        $components = @(Get-PropertyValue $measurements "components")
        $componentNames = @($components | ForEach-Object { Get-PropertyValue $_ "name" })
        foreach ($requiredName in @("host", "server", "worker", "sidecar")) {
            if ($requiredName -notin $componentNames) {
                Add-Failure $failures "Resource measurements are missing component $requiredName."
                continue
            }
            $component = $components | Where-Object {
                (Get-PropertyValue $_ "name") -eq $requiredName
            } | Select-Object -First 1
            foreach ($name in @(
                "idleCpuPercent",
                "generationCpuPercent",
                "idleWorkingSetBytes",
                "generationPeakWorkingSetBytes"
            )) {
                Assert-Measurement $component $name $failures
            }
        }
    }
    if ($byId.ContainsKey("clean-uninstall")) {
        $measurements = Get-PropertyValue $byId["clean-uninstall"] "measurements"
        Assert-Measurement $measurements "packageStateRemainingBytes" $failures {
            param($value) (Test-Number $value) -and [double]$value -eq 0
        }
        if ((Get-PropertyValue $measurements "externalExportHashPreserved") -ne $true) {
            Add-Failure $failures "Clean uninstall must preserve the external export hash."
        }
    }
    if ($byId.ContainsKey("defender-smartscreen")) {
        $measurements = Get-PropertyValue $byId["defender-smartscreen"] "measurements"
        foreach ($name in @("defenderWarning", "smartScreenWarning")) {
            if ((Get-PropertyValue $measurements $name) -ne $false) {
                Add-Failure $failures "defender-smartscreen must record $name=false."
            }
        }
    }
    if ($byId.ContainsKey("no-orphans")) {
        $measurements = Get-PropertyValue $byId["no-orphans"] "measurements"
        Assert-Measurement $measurements "orphanProcessCount" $failures {
            param($value) (Test-Number $value) -and [double]$value -eq 0
        }
    }

    $proofPassed = $failures.Count -eq 0
    $releaseReady =
        $proofPassed -and
        $verificationClass -eq "production-release" -and
        $signingMode -eq "production"
    $record = [ordered]@{
        schemaVersion = $schemaVersion
        recordType = "windows-release-verification"
        generatedAtUtc = [DateTime]::UtcNow.ToString("o")
        status = if ($proofPassed) { "pass" } else { "blocked" }
        verificationClass = $verificationClass
        signingMode = $signingMode
        sourceCommit = $sourceCommit
        signedArtifactSha256 = $scenarioArtifactHash
        proofPassed = $proofPassed
        releaseReady = $releaseReady
        failures = $failures
        hostAudit = $hostAudit
        scenarios = $scenarios
    }
    $destination = Join-Path $outputRoot "release-verification.json"
    Write-JsonEvidence -Value $record -Destination $destination
    Write-Output $destination
    if (-not $proofPassed) {
        exit 2
    }
}

if ($Mode -eq "HostAudit") {
    Invoke-HostAudit
} else {
    if ([string]::IsNullOrWhiteSpace($HostAuditPath)) {
        throw "-HostAuditPath is required in Finalize mode."
    }
    if ([string]::IsNullOrWhiteSpace($ScenarioResultsPath)) {
        throw "-ScenarioResultsPath is required in Finalize mode."
    }
    Invoke-Finalize
}
