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
$venvRoot = if ($env:PYTHON_EXE) { Split-Path -Parent $env:PYTHON_EXE } elseif (Test-Path (Join-Path $venv312Root "Scripts\\python.exe")) { $venv312Root } else { $venvDefaultRoot }
$venvPy = if ($env:PYTHON_EXE) { $env:PYTHON_EXE } else { Join-Path $venvRoot "Scripts\\python.exe" }
if (!(Test-Path $venvPy)) {
  throw "Python nao encontrado. Defina PYTHON_EXE ou crie venv: python -m venv .venv"
}

# Forca uso da venv
$activate = Join-Path $venvRoot "Scripts\\Activate.ps1"
if (Test-Path $activate) {
  & $activate
}

# Alerta para versoes muito novas (PyInstaller/FastAPI podem falhar)
$pyVer = & $venvPy -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"
if ([version]$pyVer -ge [version]"3.13") {
  Write-Warning "Python $pyVer detectado. Para evitar erros no PyInstaller, recomendo usar Python 3.12."
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
