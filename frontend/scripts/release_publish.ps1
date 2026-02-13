Param(
  [string]$Repo = $(if ($env:GITHUB_REPO) { $env:GITHUB_REPO } else { "yBlackH4t/ChronosInventory" }),
  [string]$Tag = $env:RELEASE_TAG
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$frontendDir = Split-Path -Parent $scriptDir
$bundleDir = Join-Path $frontendDir "src-tauri\\target\\release\\bundle"
$releaseDir = Join-Path $frontendDir "release"

& (Join-Path $scriptDir "release_sign.ps1") -Repo $Repo -Tag $Tag

New-Item -ItemType Directory -Force -Path $releaseDir | Out-Null

# Limpa artefatos antigos para evitar mistura de releases
Get-ChildItem -Path $releaseDir -File -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -match '\.msi$|\.msi\.zip$|\.msi\.zip\.sig$|\.nsis\.zip(\.sig)?$|\.exe$|^latest\.json$|^update\.json$' } |
  ForEach-Object { Remove-Item -Force $_.FullName }

$msiZip = Get-ChildItem -Path $bundleDir -Recurse -Filter "*.msi.zip" -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1
$bundle = $msiZip

if (-not $bundle) {
  Write-Error "Nenhum bundle MSI de update encontrado (*.msi.zip). Rode 'npm run release:build' antes."
}

$sigPath = "$($bundle.FullName).sig"
if (-not (Test-Path $sigPath)) {
  Write-Error "Assinatura nao encontrada ($sigPath). Garanta TAURI_PRIVATE_KEY no build."
}

$installerMsi = Get-ChildItem -Path $bundleDir -Recurse -Filter "*.msi" -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

Copy-Item -Path $bundle.FullName -Destination $releaseDir -Force
Copy-Item -Path $sigPath -Destination $releaseDir -Force

if ($installerMsi) {
  Copy-Item -Path $installerMsi.FullName -Destination $releaseDir -Force
}

Write-Host "Artefatos copiados para $releaseDir"
Write-Host "Arquivos obrigatorios para publicar:"
Write-Host " - latest.json (Tauri updater)"
Write-Host " - pacote updater (*.msi.zip) e *.sig"
Write-Host " - instalador final (*.msi)"
