# Release Runbook (Chronos Inventory)

Guia pratico para testar, empacotar e publicar uma nova versao sem quebrar update, sidecar ou artefatos da release.

## 1) Pre-requisitos

- Windows + PowerShell
- Python 3.12 recomendado para build local do backend
- Node 20+
- Rust toolchain
- `.venv` criada na raiz do projeto
- chave privada do Tauri disponivel se a release local for assinada manualmente

Se voce nao tiver o ambiente completo local, prefira deixar o build final para o GitHub Actions.

## 2) Preparar ambiente

Na raiz do repositorio:

```powershell
cd "<pasta-do-repositorio>"
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
pip install -r backend\requirements-dev.txt
cd frontend
npm install
cd ..
```

## 3) Checklist antes da release

### 3.1 Validar versoes do projeto

```powershell
cd "<pasta-do-repositorio>"
python scripts/check_versions.py
```

### 3.2 Rodar testes do backend

```powershell
cd "<pasta-do-repositorio>"
.\.venv\Scripts\Activate.ps1
python -m pytest backend\tests\test_api.py -q
```

### 3.3 Validar build do frontend

```powershell
cd "<pasta-do-repositorio>\frontend"
npm run build
```

### 3.4 Rodar o checklist tecnico da release

Esse passo valida:
- `CHANGELOG.md` da versao atual
- `frontend/src/lib/changelog.ts`
- consistencia de versoes
- sidecar/backend embutido

```powershell
cd "<pasta-do-repositorio>\frontend"
npm run release:doctor
```

### 3.5 (Opcional) Smoke test desktop

Use quando houve mudanca em backend, sidecar, updater ou integracao Tauri:

```powershell
cd "<pasta-do-repositorio>\frontend"
npm run build:backend
npx tauri dev
```

Se quiser validar o sidecar isoladamente:

```powershell
cd "<pasta-do-repositorio>\frontend"
npm run verify:sidecar
```

## 4) Bump de versao

Use um numero no formato desejado, por exemplo `1.6.3`, `1.6.4` ou `1.7.0`.

```powershell
cd "<pasta-do-repositorio>\frontend"
npm run release:bump -- <versao>
cd ..
python scripts/check_versions.py
```

Depois ajuste a secao correspondente em `CHANGELOG.md`:
- `### Added`
- `### Changed`
- `### Fixed`

Sincronize a tela interna de novidades:

```powershell
cd "<pasta-do-repositorio>\frontend"
npm run changelog:sync
```

Por seguranca, rode novamente:

```powershell
cd "<pasta-do-repositorio>\frontend"
npm run release:doctor
```

## 5) Build local da release

Use esse fluxo quando voce tiver a chave local para assinatura.

### 5.1 Definir variaveis

```powershell
cd "<pasta-do-repositorio>\frontend"
$env:GITHUB_REPO="yBlackH4t/ChronosInventory"
$env:RELEASE_TAG="v<versao>"
$env:TAURI_PRIVATE_KEY = Get-Content "C:\Users\User\.tauri\estoque.key" -Raw
$env:TAURI_KEY_PASSWORD=""
```

### 5.2 Gerar artefatos

```powershell
npm run release:build
npm run release:publish
npm run release:check
```

O fluxo acima:
- recompila o backend sidecar
- roda `release:doctor`
- gera os bundles do Tauri
- publica o `latest.json`
- valida manifesto e artefatos finais

Arquivos finais ficam em `frontend\release\`.

## 6) Publicar no GitHub

### 6.1 Recomendado: tag + GitHub Actions

Antes de commitar, revise o status com cuidado. Nao use `git add .` no automatico se houver arquivos locais ou documentacao temporaria fora do escopo.

```powershell
cd "<pasta-do-repositorio>"
git status --short
```

Se `README_RELEASE.md` estiver modificado e nao fizer parte da entrega, deixe ele fora do commit.

Depois publique:

```powershell
cd "<pasta-do-repositorio>"
git add CHANGELOG.md core frontend app backend scripts
git commit -m "chore(release): <versao>"
git push origin main
git tag v<versao>
git push origin v<versao>
```

O workflow `.github/workflows/release.yml` faz o build, valida os artefatos e publica a release.

### 6.2 Publicacao manual da release

Se for necessario completar a release manualmente no GitHub, envie os artefatos de `frontend\release\`:
- `latest.json`
- `*.msi.zip`
- `*.sig`
- `*.msi`

## 7) Dados locais que nao entram no repo

- `%APPDATA%\Chronos Inventory\estoque.db`
- `%APPDATA%\Chronos Inventory\imagens\`
- `%APPDATA%\Chronos Inventory\backups\`
- `%APPDATA%\Chronos Inventory\exports\`
- configs locais operacionais que nao fazem parte da release

## 8) Troubleshooting rapido

### `.venv\Scripts\Activate.ps1` nao encontrado
- Rode o comando na raiz do repo.
- Se estiver dentro de `frontend`, volte um nivel com `cd ..`.

### `Python X.Y nao suportado para release local`
- `build_backend.ps1` bloqueia Python >= 3.13 por padrao.
- Use Python 3.12 para build local do backend.
- Override (`ALLOW_UNSUPPORTED_PYTHON=1`) so em ultimo caso.

### `Servico local indisponivel` ao abrir o app em dev
- Recompile o sidecar:

```powershell
cd "<pasta-do-repositorio>\frontend"
npm run build:backend
npx tauri dev
```

- Se persistir, confira se a porta `127.0.0.1:8000` esta livre e se nao ficou `estoque_backend.exe` antigo preso.

### `release:doctor` falhou
- Normalmente indica:
  - `CHANGELOG.md` sem a secao da versao atual
  - `frontend/src/lib/changelog.ts` fora de sincronia
  - sidecar/backend desatualizado
  - `README_RELEASE.md` modificado sem revisao

### `TAURI_PRIVATE_KEY` ausente
- Sem chave privada, nao gera `*.sig`.
- Sem `*.sig`, `release:publish` falha.

### `release:check` falhou
- Normalmente indica artefato antigo misturado ou `latest.json` fora da versao atual.
- Refaça a sequencia:
  - `npm run release:build`
  - `npm run release:publish`
  - `npm run release:check`

### Push rejeitado por arquivo grande
- Nao comite `target`, `release`, `dist`, `temp` ou artefatos do build.
- Binarios finais devem ir para o GitHub Release, nao para o historico do Git.
