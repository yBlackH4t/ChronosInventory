Param(
  [string]$Repo = $(if ($env:GITHUB_REPO) { $env:GITHUB_REPO } else { "yBlackH4t/ChronosInventory" }),
  [string]$Tag = $env:RELEASE_TAG
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$frontendDir = Split-Path -Parent $scriptDir
$bundleDir = Join-Path $frontendDir "src-tauri\\target\\release\\bundle"
$releaseDir = Join-Path $frontendDir "release"

$pkg = Get-Content -Path (Join-Path $frontendDir "package.json") | ConvertFrom-Json
$version = $pkg.version
if (-not $Tag) {
  $Tag = "v$version"
}

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

$signature = (Get-Content -Path $sigPath -Raw).Trim()
$pubDate = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
# Em releases do GitHub, nomes com espaco costumam ser normalizados com ponto.
# Gera URL compativel com o nome final publicado.
$assetName = ($bundle.Name -replace " ", ".")
$assetUrl = "https://github.com/$Repo/releases/download/$Tag/$([Uri]::EscapeDataString($assetName))"

$latest = @{
  version = $version
  notes = "Atualizacao automatica"
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
