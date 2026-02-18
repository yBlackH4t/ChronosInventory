Param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string]$Version
)

$ErrorActionPreference = "Stop"

if ($Version.StartsWith("v")) {
  $Version = $Version.Substring(1)
}

if ($Version -notmatch '^\d+\.\d+\.\d+(?:-[0-9A-Za-z\.-]+)?$') {
  throw "Versao invalida '$Version'. Use formato semver (ex: 1.1.2)."
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$frontendDir = Split-Path -Parent $scriptDir
$repoRoot = Resolve-Path (Join-Path $frontendDir "..")

function Read-File([string]$Path) {
  return [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8)
}

function Write-File([string]$Path, [string]$Content) {
  [System.IO.File]::WriteAllText($Path, $Content, (New-Object System.Text.UTF8Encoding($false)))
}

function Ensure-ChangelogEntry {
  Param(
    [string]$Path,
    [string]$Version
  )

  $today = (Get-Date).ToString("yyyy-MM-dd")
  $entryPattern = "(?m)^\s*##\s*\[?v?$([regex]::Escape($Version))\]?(?:\s+-\s+.*)?\s*$"

  if (-not (Test-Path $Path)) {
    $initial = @(
      "# Changelog",
      "",
      "## [Unreleased]",
      "",
      "### Added",
      "- TODO",
      "",
      "### Changed",
      "- TODO",
      "",
      "### Fixed",
      "- TODO",
      "",
      "## [$Version] - $today",
      "",
      "### Added",
      "- TODO",
      "",
      "### Changed",
      "- TODO",
      "",
      "### Fixed",
      "- TODO",
      ""
    )
    Write-File $Path (($initial -join "`r`n") + "`r`n")
    Write-Host "CHANGELOG criado com template para $Version"
    return
  }

  $content = Read-File $Path
  if ([regex]::IsMatch($content, $entryPattern)) {
    Write-Host "CHANGELOG ja possui secao para $Version"
    return
  }

  $lines = Get-Content -Path $Path -Encoding UTF8
  if (-not $lines) {
    $lines = @("# Changelog", "")
  }

  $insertIndex = $lines.Count
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match '^\s*##\s*\[\d+\.\d+\.\d+\]') {
      $insertIndex = $i
      break
    }
  }

  $entryLines = @(
    "## [$Version] - $today",
    "",
    "### Added",
    "- TODO",
    "",
    "### Changed",
    "- TODO",
    "",
    "### Fixed",
    "- TODO",
    ""
  )

  $before = @()
  $after = @()
  if ($insertIndex -gt 0) {
    $before = $lines[0..($insertIndex - 1)]
  }
  if ($insertIndex -lt $lines.Count) {
    $after = $lines[$insertIndex..($lines.Count - 1)]
  }

  $newLines = @($before + "" + $entryLines + $after)
  Write-File $Path (($newLines -join "`r`n") + "`r`n")
  Write-Host "Template de release notes adicionado no CHANGELOG para $Version"
}

function Replace-RegexOnce {
  Param(
    [string]$Path,
    [string]$Pattern,
    [string]$Label
  )

  $content = Read-File $Path
  $regex = [regex]::new($Pattern, [System.Text.RegularExpressions.RegexOptions]::Multiline -bor [System.Text.RegularExpressions.RegexOptions]::Singleline)
  $match = $regex.Match($content)
  if (-not $match.Success) {
    throw "Padrao nao encontrado em '$Path' ($Label)."
  }

  $oldVersion = $match.Groups[2].Value
  $updated = $regex.Replace(
    $content,
    ([System.Text.RegularExpressions.MatchEvaluator]{
      param($m)
      return "$($m.Groups[1].Value)$Version$($m.Groups[3].Value)"
    }),
    1
  )
  Write-File $Path $updated

  Write-Host ("{0}: {1} -> {2}" -f $Label, $oldVersion, $Version)
}

# Core/backend
Replace-RegexOnce `
  -Path (Join-Path $repoRoot "core\constants.py") `
  -Pattern '(APP_VERSION\s*=\s*")([^"]+)(")' `
  -Label "core.constants.APP_VERSION"

# Frontend package metadata
Replace-RegexOnce `
  -Path (Join-Path $frontendDir "package.json") `
  -Pattern '(^\s*"version"\s*:\s*")([^"]+)(")' `
  -Label "frontend.package.json"

Replace-RegexOnce `
  -Path (Join-Path $frontendDir "package-lock.json") `
  -Pattern '(^\s*"version"\s*:\s*")([^"]+)(")' `
  -Label "frontend.package-lock.json (root)"

Replace-RegexOnce `
  -Path (Join-Path $frontendDir "package-lock.json") `
  -Pattern '("packages"\s*:\s*\{\s*""\s*:\s*\{\s*"name"\s*:\s*"frontend"\s*,\s*"version"\s*:\s*")([^"]+)(")' `
  -Label "frontend.package-lock.json (packages.\"\".)"

# Tauri metadata
Replace-RegexOnce `
  -Path (Join-Path $frontendDir "src-tauri\Cargo.toml") `
  -Pattern '(\[package\]\s*[\r\n]+name\s*=\s*"chronos_inventory_desktop"\s*[\r\n]+version\s*=\s*")([^"]+)(")' `
  -Label "frontend.src-tauri.Cargo.toml"

Replace-RegexOnce `
  -Path (Join-Path $frontendDir "src-tauri\tauri.conf.json") `
  -Pattern '("package"\s*:\s*\{\s*"productName"\s*:\s*"[^"]+"\s*,\s*"version"\s*:\s*")([^"]+)(")' `
  -Label "frontend.src-tauri.tauri.conf.json"

Replace-RegexOnce `
  -Path (Join-Path $frontendDir "src-tauri\Cargo.lock") `
  -Pattern '(name\s*=\s*"chronos_inventory_desktop"\s*[\r\n]+version\s*=\s*")([^"]+)(")' `
  -Label "frontend.src-tauri.Cargo.lock"

Ensure-ChangelogEntry `
  -Path (Join-Path $repoRoot "CHANGELOG.md") `
  -Version $Version

Write-Host ""
Write-Host "Versao atualizada com sucesso para $Version"
Write-Host "Proximo passo: git status"
