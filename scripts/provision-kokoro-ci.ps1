[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$revision = 'f3ff3571791e39611d31c381e3a41a3af07b4987'
$sourceBase = "https://huggingface.co/hexgrad/Kokoro-82M/resolve/$revision"
$resources = @(
  [pscustomobject]@{
    RelativePath = 'kokoro-v1_0.pth'
    Size = [int64]327212226
    Sha256 = '496dba118d1a58f5f3db2efc88dbdc216e0483fc89fe6e47ee1f2c53f18ad1e4'
  },
  [pscustomobject]@{
    RelativePath = 'config.json'
    Size = [int64]2351
    Sha256 = '5abb01e2403b072bf03d04fde160443e209d7a0dad49a423be15196b9b43c17f'
  },
  [pscustomobject]@{
    RelativePath = 'voices/af_heart.pt'
    Size = [int64]523425
    Sha256 = '0ab5709b8ffab19bfd849cd11d98f75b60af7733253ad0d67b12382a102cb4ff'
  },
  [pscustomobject]@{
    RelativePath = 'voices/af_bella.pt'
    Size = [int64]523425
    Sha256 = '8cb64e02fcc8de0327a8e13817e49c76c945ecf0052ceac97d3081480e8e48d6'
  },
  [pscustomobject]@{
    RelativePath = 'voices/am_michael.pt'
    Size = [int64]523435
    Sha256 = '9a443b79a4b22489a5b0ab7c651a0bcd1a30bef675c28333f06971abbd47bd37'
  }
)

$repositoryRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$destinationRoot = Join-Path $repositoryRoot (
  "data\local-tts\huggingface\hub\models--hexgrad--Kokoro-82M\snapshots\$revision"
)

function Assert-VerifiedResource {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][pscustomobject]$Resource
  )

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "The approved Kokoro resource is missing: $($Resource.RelativePath)"
  }

  $item = Get-Item -LiteralPath $Path -Force
  if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw "The approved Kokoro resource must be a regular file: $($Resource.RelativePath)"
  }
  if ([int64]$item.Length -ne $Resource.Size) {
    throw "The approved Kokoro resource has an unexpected size: $($Resource.RelativePath)"
  }

  $actualSha256 = (
    Get-FileHash -LiteralPath $Path -Algorithm SHA256
  ).Hash.ToLowerInvariant()
  if ($actualSha256 -ne $Resource.Sha256) {
    throw "The approved Kokoro resource failed SHA-256 verification: $($Resource.RelativePath)"
  }
}

New-Item -ItemType Directory -Path $destinationRoot -Force | Out-Null

foreach ($resource in $resources) {
  $relativePlatformPath = $resource.RelativePath.Replace(
    '/',
    [IO.Path]::DirectorySeparatorChar.ToString()
  )
  $destination = Join-Path $destinationRoot $relativePlatformPath
  New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force |
    Out-Null

  if (Test-Path -LiteralPath $destination) {
    Assert-VerifiedResource -Path $destination -Resource $resource
    Write-Host "Verified existing Kokoro resource: $($resource.RelativePath)"
    continue
  }

  $partialDestination = "$destination.partial"
  if (Test-Path -LiteralPath $partialDestination) {
    throw "Refusing to replace a partial Kokoro resource: $($resource.RelativePath)"
  }

  $sourceUri = "$sourceBase/$($resource.RelativePath)?download=true"
  $downloadParameters = @{
    Uri = $sourceUri
    OutFile = $partialDestination
    MaximumRedirection = 5
    Headers = @{ 'User-Agent' = 'adaptive-audio-player-ci/0.1.0' }
  }
  Invoke-WebRequest @downloadParameters
  Assert-VerifiedResource -Path $partialDestination -Resource $resource
  Move-Item -LiteralPath $partialDestination -Destination $destination
  Assert-VerifiedResource -Path $destination -Resource $resource
  Write-Host "Downloaded and verified Kokoro resource: $($resource.RelativePath)"
}

$reparsePoints = @(
  Get-ChildItem -LiteralPath $destinationRoot -Recurse -Force |
    Where-Object {
      ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0
    }
)
if ($reparsePoints.Count -ne 0) {
  throw 'The verified Kokoro snapshot must not contain reparse points.'
}

$expectedFiles = @($resources | ForEach-Object { $_.RelativePath } | Sort-Object)
$actualFiles = @(
  Get-ChildItem -LiteralPath $destinationRoot -Recurse -File |
    ForEach-Object {
      [IO.Path]::GetRelativePath($destinationRoot, $_.FullName).Replace('\', '/')
    } |
    Sort-Object
)
$differences = @(Compare-Object -ReferenceObject $expectedFiles -DifferenceObject $actualFiles)
if ($differences.Count -ne 0) {
  throw 'The verified Kokoro snapshot contains a missing or unexpected file.'
}

Write-Host "Provisioned exactly $($resources.Count) approved Kokoro resources at revision $revision."
