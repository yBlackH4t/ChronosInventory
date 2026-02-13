$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$binDir = Join-Path $root "src-tauri\\bin"

if (!(Test-Path $binDir)) {
  throw "Pasta de sidecar nao encontrada: $binDir"
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
