$ErrorActionPreference = "Stop"

# Sempre roda a partir da pasta onde o script esta (raiz do repo)
Set-Location $PSScriptRoot

$entry = Join-Path $PSScriptRoot "backend\app\main.py"
if (!(Test-Path $entry)) {
  throw "Script file '$entry' does not exist."
}

# Usa o Python do venv para garantir dependencias (fastapi, etc.)
# Permite override por variavel de ambiente PYTHON_EXE (ex: caminho do Python 3.12)
$venv312Root = Join-Path $PSScriptRoot ".venv312"
$venvDefaultRoot = Join-Path $PSScriptRoot ".venv"
$venvPy = $null

if ($env:PYTHON_EXE) {
  if (!(Test-Path $env:PYTHON_EXE)) {
    throw "PYTHON_EXE invalido: '$($env:PYTHON_EXE)'"
  }
  $venvPy = $env:PYTHON_EXE
} else {
  $candidates = @(
    (Join-Path $venv312Root "Scripts\\python.exe"),
    (Join-Path $venvDefaultRoot "Scripts\\python.exe")
  )

  foreach ($candidate in $candidates) {
    if (!(Test-Path $candidate)) { continue }
    try {
      & $candidate -c "import sys" *> $null
      if ($LASTEXITCODE -ne 0) {
        throw "invalid_python_exit_$LASTEXITCODE"
      }
      $venvPy = $candidate
      break
    } catch {
      Write-Warning "Ignorando venv invalida: $candidate"
    }
  }
}

if (-not $venvPy) {
  throw "Python nao encontrado. Defina PYTHON_EXE ou crie venv: python -m venv .venv"
}

$venvRoot = Split-Path -Parent (Split-Path -Parent $venvPy)

# Forca uso da venv
$activate = Join-Path $venvRoot "Scripts\\Activate.ps1"
if (Test-Path $activate) {
  & $activate
}

# Bloqueia versoes muito novas por padrao (PyInstaller/FastAPI podem falhar)
# Override consciente: ALLOW_UNSUPPORTED_PYTHON=1
$pyVer = & $venvPy -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"
if ([version]$pyVer -ge [version]"3.13") {
  if ($env:ALLOW_UNSUPPORTED_PYTHON -eq "1") {
    Write-Warning "Python $pyVer detectado com override ALLOW_UNSUPPORTED_PYTHON=1."
  } else {
    throw "Python $pyVer nao suportado para release local. Use Python 3.12 (ou defina ALLOW_UNSUPPORTED_PYTHON=1 por sua conta e risco)."
  }
}

# Verifica se fastapi/uvicorn estao instalados no venv
& $venvPy -c "import importlib.util, sys; sys.exit('fastapi nao esta instalado no venv. Rode: pip install -r backend/requirements.txt') if importlib.util.find_spec('fastapi') is None else None"
& $venvPy -c "import importlib.util, sys; sys.exit('uvicorn nao esta instalado no venv. Rode: pip install -r backend/requirements.txt') if importlib.util.find_spec('uvicorn') is None else None"
& $venvPy -c "import importlib.util, sys; sys.exit('pyinstaller nao esta instalado no venv. Rode: pip install pyinstaller') if importlib.util.find_spec('PyInstaller') is None else None"

# Build do backend com PyInstaller do venv (forca incluir dependencias do FastAPI)
$sitePkgs = & $venvPy -c "import site; print(site.getsitepackages()[0])"
& $venvPy -m PyInstaller --clean --noconfirm `
  --paths $sitePkgs `
  --collect-all fastapi `
  --collect-all starlette `
  --collect-all pydantic `
  --exclude-module pytest `
  --exclude-module _pytest `
  --exclude-module py `
  --exclude-module tests `
  --onefile --noconsole $entry -n estoque_backend

# mover para src-tauri/bin (compat: nome simples e nome com target)
$src = Join-Path $PSScriptRoot "dist\estoque_backend.exe"
$dstDir = Join-Path $PSScriptRoot "frontend\src-tauri\bin"
New-Item -ItemType Directory -Force -Path $dstDir | Out-Null
Copy-Item -Force $src (Join-Path $dstDir "estoque_backend.exe")
Copy-Item -Force $src (Join-Path $dstDir "estoque_backend-x86_64-pc-windows-msvc.exe")
