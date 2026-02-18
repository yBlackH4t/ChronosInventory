$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$binDir = Join-Path $root "src-tauri\\bin"
$pkgPath = Join-Path $root "package.json"

if (!(Test-Path $binDir)) {
  throw "Pasta de sidecar nao encontrada: $binDir"
}
if (!(Test-Path $pkgPath)) {
  throw "package.json nao encontrado em $pkgPath"
}

$pkg = Get-Content -Path $pkgPath | ConvertFrom-Json
$expectedVersion = "$($pkg.version)"
if ([string]::IsNullOrWhiteSpace($expectedVersion)) {
  throw "Versao esperada nao encontrada em package.json"
}

function Get-SidecarVersion {
  Param(
    [string]$ExePath
  )

  $tmpVersionFile = Join-Path $env:TEMP ("chronos_sidecar_version_" + [guid]::NewGuid().ToString("N") + ".txt")
  try {
    $env:SIDECAR_VERSION_FILE = $tmpVersionFile
    & $ExePath --version *> $null
    $exitCode = $LASTEXITCODE
    Remove-Item Env:SIDECAR_VERSION_FILE -ErrorAction SilentlyContinue

    if ($exitCode -ne 0) {
      throw "exit_code_$exitCode"
    }
    if (-not (Test-Path $tmpVersionFile)) {
      throw "version_file_not_created"
    }

    $text = (Get-Content -Path $tmpVersionFile -Raw -ErrorAction Stop).Trim()
    if ([string]::IsNullOrWhiteSpace($text)) {
      throw "empty_output"
    }
    $match = [regex]::Match($text, '\d+\.\d+\.\d+')
    if (-not $match.Success) {
      throw "invalid_version_output: $text"
    }
    return $match.Value
  } catch {
    return $null
  } finally {
    Remove-Item Env:SIDECAR_VERSION_FILE -ErrorAction SilentlyContinue
    Remove-Item -Path $tmpVersionFile -Force -ErrorAction SilentlyContinue
  }
}

$expected = @(
  (Join-Path $binDir "estoque_backend.exe"),
  (Join-Path $binDir "estoque_backend-x86_64-pc-windows-msvc.exe")
)

$found = $expected | Where-Object { Test-Path $_ }
if ($found.Count -eq 0) {
  throw "Sidecar nao encontrado em $binDir. Execute: .\\build_backend.ps1"
}

Write-Host "Sidecar OK:"
$found | ForEach-Object { Write-Host (" - " + $_) }

$versionProbeFailed = $false
foreach ($exePath in $found) {
  $sidecarVersion = Get-SidecarVersion -ExePath $exePath
  if (-not $sidecarVersion) {
    $versionProbeFailed = $true
    Write-Warning "Nao foi possivel validar versao em '$([System.IO.Path]::GetFileName($exePath))'. Mantendo fallback por timestamp."
    continue
  }
  if ($sidecarVersion -ne $expectedVersion) {
    throw "Sidecar com versao divergente ($([System.IO.Path]::GetFileName($exePath)) = $sidecarVersion, esperado $expectedVersion). Rode: .\\build_backend.ps1"
  }
}
if (-not $versionProbeFailed) {
  Write-Host "Versao do sidecar OK: $expectedVersion"
}

# Protege contra frontend novo + sidecar antigo.
$projectRoot = Resolve-Path (Join-Path $root "..")
$sourceDirs = @(
  (Join-Path $projectRoot "backend\\app"),
  (Join-Path $projectRoot "app"),
  (Join-Path $projectRoot "core")
)

$newestSource = Get-ChildItem -Path $sourceDirs -Recurse -Include *.py -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if ($newestSource) {
  foreach ($exePath in $found) {
    $exe = Get-Item $exePath
    if ($exe.LastWriteTime -lt $newestSource.LastWriteTime) {
      throw "Sidecar desatualizado ($($exe.Name)). Rode: .\\build_backend.ps1"
    }
  }
}
