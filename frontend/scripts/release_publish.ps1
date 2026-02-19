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

New-Item -ItemType Directory -Force -Path $releaseDir | Out-Null

# Limpa artefatos antigos para evitar mistura de releases
Get-ChildItem -Path $releaseDir -File -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -match '\.msi$|\.msi\.zip$|\.msi\.zip\.sig$|\.nsis\.zip(\.sig)?$|\.exe$|^latest\.json$|^update\.json$' } |
  ForEach-Object { Remove-Item -Force $_.FullName }

& (Join-Path $scriptDir "release_sign.ps1") -Repo $Repo -Tag $Tag

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

$installerMsi = Get-ChildItem -Path $bundleDir -Recurse -Filter "*.msi" -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -like "*$versionToken*" } |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1
if (-not $installerMsi) {
  Write-Error "Nenhum instalador .msi da versao $version encontrado. Rode 'npm run release:build' antes."
}

$bundleReleaseName = ($bundle.Name -replace " ", ".")
$bundleReleasePath = Join-Path $releaseDir $bundleReleaseName
$sigReleasePath = "$bundleReleasePath.sig"

Copy-Item -Path $bundle.FullName -Destination $bundleReleasePath -Force
Copy-Item -Path $sigPath -Destination $sigReleasePath -Force

$installerReleaseName = ($installerMsi.Name -replace " ", ".")
Copy-Item -Path $installerMsi.FullName -Destination (Join-Path $releaseDir $installerReleaseName) -Force

$releaseCheckScript = Join-Path $repoRoot "scripts\\check_release_artifacts.py"
if (-not (Test-Path $releaseCheckScript)) {
  Write-Error "Script de validacao nao encontrado: $releaseCheckScript"
}

python $releaseCheckScript --repo $Repo --tag $Tag --frontend-dir $frontendDir

Write-Host "Artefatos copiados para $releaseDir"
Write-Host "Arquivos obrigatorios para publicar:"
Write-Host " - latest.json (Tauri updater)"
Write-Host " - pacote updater (*.msi.zip) e *.sig"
Write-Host " - instalador final (*.msi)"
