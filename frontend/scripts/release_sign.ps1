Param(
  [string]$Repo = $(if ($env:GITHUB_REPO) { $env:GITHUB_REPO } else { "yBlackH4t/ChronosInventory" }),
  [string]$Tag = $env:RELEASE_TAG
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$frontendDir = Split-Path -Parent $scriptDir
$repoRoot = Resolve-Path (Join-Path $frontendDir "..")
$bundleDir = Join-Path $frontendDir "src-tauri\\target\\release\\bundle"
$releaseDir = Join-Path $frontendDir "release"
$changelogPath = Join-Path $repoRoot "CHANGELOG.md"

function Convert-MarkdownSectionToNotes {
  Param(
    [string[]]$Lines
  )

  $result = New-Object System.Collections.Generic.List[string]
  $lastBlank = $false

  foreach ($line in $Lines) {
    $trimmed = $line.Trim()
    if ([string]::IsNullOrWhiteSpace($trimmed)) {
      if (-not $lastBlank) {
        [void]$result.Add("")
      }
      $lastBlank = $true
      continue
    }
    $lastBlank = $false

    if ($trimmed -match '^###\s+(.+)$') {
      [void]$result.Add("$($matches[1]):")
      continue
    }
    if ($trimmed -match '^[\-\*]\s+(.+)$') {
      [void]$result.Add("- $($matches[1])")
      continue
    }

    $plain = [regex]::Replace($trimmed, '\[([^\]]+)\]\([^)]+\)', '$1')
    [void]$result.Add($plain)
  }

  while ($result.Count -gt 0 -and [string]::IsNullOrWhiteSpace($result[0])) {
    $result.RemoveAt(0)
  }
  while ($result.Count -gt 0 -and [string]::IsNullOrWhiteSpace($result[$result.Count - 1])) {
    $result.RemoveAt($result.Count - 1)
  }

  return ($result -join "`n").Trim()
}

function Get-ReleaseNotesFromChangelog {
  Param(
    [string]$Path,
    [string]$Version
  )

  if (-not (Test-Path $Path)) {
    return $null
  }

  $lines = Get-Content -Path $Path -Encoding UTF8
  if (-not $lines -or $lines.Count -eq 0) {
    return $null
  }

  $targetHeading = "^\s*##\s*\[?v?$([regex]::Escape($Version))\]?(?:\s+-\s+.*)?\s*$"
  $fallbackHeading = "^\s*##\s*\[?Unreleased\]?(?:\s+-\s+.*)?\s*$"
  $candidates = @($targetHeading, $fallbackHeading)

  foreach ($heading in $candidates) {
    $start = -1
    for ($i = 0; $i -lt $lines.Count; $i++) {
      if ($lines[$i] -match $heading) {
        $start = $i + 1
        break
      }
    }
    if ($start -lt 0) {
      continue
    }

    $end = $lines.Count
    for ($j = $start; $j -lt $lines.Count; $j++) {
      if ($lines[$j] -match '^\s*##\s+') {
        $end = $j
        break
      }
    }

    $sectionLines = @()
    if ($end -gt $start) {
      $sectionLines = $lines[$start..($end - 1)]
    }

    $notes = Convert-MarkdownSectionToNotes -Lines $sectionLines
    if (-not [string]::IsNullOrWhiteSpace($notes)) {
      return $notes
    }
  }

  return $null
}

$pkg = Get-Content -Path (Join-Path $frontendDir "package.json") | ConvertFrom-Json
$version = $pkg.version
if (-not $Tag) {
  $Tag = "v$version"
}

$bundles = Get-ChildItem -Path $bundleDir -Recurse -Filter "*.msi.zip" -ErrorAction SilentlyContinue
if (-not $bundles -or $bundles.Count -eq 0) {
  Write-Error "Nenhum bundle MSI de update encontrado (*.msi.zip). Rode 'npm run release:build' antes."
}

$versionToken = "_$($version)_"
$versionBundles = $bundles | Where-Object { $_.Name -like "*$versionToken*" }
if (-not $versionBundles -or $versionBundles.Count -eq 0) {
  $available = ($bundles | Select-Object -ExpandProperty Name) -join ", "
  Write-Error "Nenhum bundle .msi.zip da versao $version encontrado. Disponiveis: $available"
}

$bundle = $versionBundles | Sort-Object LastWriteTime -Descending | Select-Object -First 1

$sigPath = "$($bundle.FullName).sig"
if (-not (Test-Path $sigPath)) {
  Write-Error "Assinatura nao encontrada ($sigPath). Garanta TAURI_PRIVATE_KEY no build."
}

$signature = (Get-Content -Path $sigPath -Raw).Trim()
$pubDate = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$notes = Get-ReleaseNotesFromChangelog -Path $changelogPath -Version $version
if (-not $notes) {
  $notes = "Atualizacao $version."
}
if ($notes.Length -gt 4000) {
  $notes = ($notes.Substring(0, 4000).TrimEnd() + "`n...")
}
# Em releases do GitHub, nomes com espaco costumam ser normalizados com ponto.
# Gera URL compativel com o nome final publicado.
$assetName = ($bundle.Name -replace " ", ".")
$assetUrl = "https://github.com/$Repo/releases/download/$Tag/$([Uri]::EscapeDataString($assetName))"

$latest = @{
  version = $version
  notes = $notes
  pub_date = $pubDate
  platforms = @{
    "windows-x86_64" = @{
      signature = $signature
      url = $assetUrl
    }
  }
}

New-Item -ItemType Directory -Force -Path $releaseDir | Out-Null
$latestPath = Join-Path $releaseDir "latest.json"
$latestJson = $latest | ConvertTo-Json -Depth 5
[System.IO.File]::WriteAllText(
  $latestPath,
  $latestJson,
  (New-Object System.Text.UTF8Encoding($false))
)

Write-Host "latest.json gerado em $latestPath"
