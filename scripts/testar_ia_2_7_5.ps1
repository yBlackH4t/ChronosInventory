param(
    [string]$Exe = "",
    [string]$PythonExe = "C:\dev\chronos-venv\Scripts\python.exe"
)

$ErrorActionPreference = "Stop"
$project = Split-Path -Parent $PSScriptRoot
if (-not $Exe) {
    $Exe = Join-Path $project "frontend\src-tauri\target\release\Chronos Inventory.exe"
}
if (-not (Test-Path -LiteralPath $Exe)) { throw "Executavel nao encontrado. Informe -Exe com o caminho do Chronos 2.7.5." }
$productVersion = [System.Diagnostics.FileVersionInfo]::GetVersionInfo((Resolve-Path -LiteralPath $Exe).Path).ProductVersion
if ($productVersion -notin @("2.7.5", "2.7.5.0")) {
    throw "Executavel nao corresponde a 2.7.5 (versao: $productVersion). Compile a nova versao antes de testar."
}
if (-not (Test-Path -LiteralPath $PythonExe)) { throw "Informe -PythonExe com o Python 3.12 usado pelo projeto." }
if (Get-Process -Name "Chronos Inventory" -ErrorAction SilentlyContinue) {
    throw "Feche o Chronos anterior antes de abrir a copia de teste."
}
if (Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue) {
    throw "A porta 8000 esta ocupada. Feche o Chronos anterior antes de abrir a copia de teste."
}
$source = Join-Path $project "_comparacao\estoque_copia.db"
if (-not (Test-Path -LiteralPath $source)) { throw "Copia ausente: _comparacao\estoque_copia.db. O banco original nao sera usado." }
$testRoot = Join-Path $env:TEMP ("chronos-teste-ia-275-" + [Guid]::NewGuid().ToString("N"))
$data = Join-Path $testRoot "dados"
$appdata = Join-Path $testRoot "appdata"
$localAppdata = Join-Path $testRoot "localappdata"
$temporary = Join-Path $testRoot "temp"
New-Item -ItemType Directory -Path $data,$appdata,$localAppdata,$temporary -Force | Out-Null
$destination = Join-Path $data "estoque.db"
& $PythonExe -c "import sqlite3,sys; from pathlib import Path; source=sqlite3.connect(Path(sys.argv[1]).as_uri()+'?mode=ro',uri=True); target=sqlite3.connect(sys.argv[2]); source.backup(target); target.close(); source.close()" $source $destination
if ($LASTEXITCODE -ne 0) { throw "Falha ao preparar a copia. O aplicativo nao foi aberto." }
$previousData = $env:CHRONOS_APP_DIR
$previousAppdata = $env:APPDATA
$previousEnvironment = $env:APP_ENV
$previousLocalAppdata = $env:LOCALAPPDATA
$previousTemp = $env:TEMP
$previousTmp = $env:TMP
try {
    $env:CHRONOS_APP_DIR = $data
    $env:APPDATA = $appdata
    $env:APP_ENV = "dev"
    $env:LOCALAPPDATA = $localAppdata
    $env:TEMP = $temporary
    $env:TMP = $temporary
    Write-Host "Dados isolados: $testRoot"
    Write-Host "Configuracao de IA e WhatsApp separada da empresa. A copia sera preservada depois do teste."
    Start-Process -FilePath (Resolve-Path -LiteralPath $Exe).Path
} finally {
    $env:CHRONOS_APP_DIR = $previousData
    $env:APPDATA = $previousAppdata
    $env:APP_ENV = $previousEnvironment
    $env:LOCALAPPDATA = $previousLocalAppdata
    $env:TEMP = $previousTemp
    $env:TMP = $previousTmp
}
