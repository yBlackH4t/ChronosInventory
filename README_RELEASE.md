# Release Runbook (Chronos Inventory)

Guia atualizado para testar e publicar novas versoes sem quebrar update.

## 1) Pre-requisitos

- Windows + PowerShell
- Python 3.12 (recomendado para release local)
- Node 20+
- Rust toolchain
- Venv criada na raiz do projeto (`.venv`)

Se voce nao tiver Python 3.12 local, prefira publicar via GitHub Actions.

## 2) Preparar ambiente (raiz do repo)

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

## 3) Teste antes de publicar

### 3.1 Validar versoes

```powershell
cd "<pasta-do-repositorio>"
python scripts/check_versions.py
```

### 3.2 Rodar testes backend

```powershell
cd "<pasta-do-repositorio>"
.\.venv\Scripts\Activate.ps1
python -m pytest -q
```

### 3.3 Build frontend

```powershell
cd "<pasta-do-repositorio>\frontend"
npm run build
```

### 3.4 (Opcional) Teste integrado desktop

```powershell
cd "<pasta-do-repositorio>\frontend"
npm run build:backend
npm run verify:sidecar
npx tauri dev
```

Checklist manual:
- versao no topo direito correta
- entrada/saida/transferencia
- devolucao com `Mov. referencia`
- documento e observacao gravando no historico
- ajuste com `Motivo do ajuste` + observacao obrigatorios
- backup automatico (configurar horario/retenção e salvar)
- botao `Testar restauracao` no modulo Backup
- fluxo de inventario (criar sessao, contar, aplicar ajustes)
- tela `Novidades` abrindo historico de changelog

## 4) Bump de versao

```powershell
cd "<pasta-do-repositorio>\frontend"
npm run release:bump -- 1.2.0
cd ..
python scripts/check_versions.py
```

Depois preencha a secao da versao em `CHANGELOG.md`:
- `### Added`
- `### Changed`
- `### Fixed`

Sincronize a tela interna de novidades com o changelog:

```powershell
cd "<pasta-do-repositorio>\frontend"
npm run changelog:sync
```

## 5) Release local (manual)

Use esse fluxo quando voce tiver chave de assinatura local.

### 5.1 Definir variaveis

```powershell
cd "<pasta-do-repositorio>\frontend"
$env:GITHUB_REPO="yBlackH4t/ChronosInventory"
$env:RELEASE_TAG="v1.2.0"
$env:TAURI_PRIVATE_KEY = Get-Content "C:\Users\User\.tauri\estoque.key" -Raw
$env:TAURI_KEY_PASSWORD=""
```

### 5.2 Gerar artefatos e manifest

```powershell
npm run release:build
npm run release:publish
npm run release:check
```

`release:check` valida:
- versao do `latest.json` = versao do `package.json`
- URL do updater apontando para a tag correta
- existencia de `*.msi.zip`, `*.sig` e `*.msi` da versao atual
- consistencia do asset referenciado no manifest

Arquivos finais ficam em `frontend\release\`.

## 6) Publicar no GitHub

### 6.1 Recomendado (GitHub Actions)

```powershell
cd "<pasta-do-repositorio>"
git add .
git commit -m "chore(release): 1.2.0"
git push origin main
git tag v1.2.0
git push origin v1.2.0
```

O workflow `.github/workflows/release.yml` faz build, valida artefatos e publica release.

### 6.2 Manual (se necessario)

No GitHub Release da tag, envie:
- `frontend/release/latest.json`
- `frontend/release/*.msi.zip`
- `frontend/release/*.sig`
- `frontend/release/*.msi`

## 7) Dados de cliente (nao entram no repo)

- `%APPDATA%\Chronos Inventory\estoque.db`
- `%APPDATA%\Chronos Inventory\imagens\`
- `%APPDATA%\Chronos Inventory\backups\`
- `%APPDATA%\Chronos Inventory\exports\`

## 8) Troubleshooting rapido

### `.venv\Scripts\Activate.ps1` nao encontrado
- Rode o comando na raiz do repo.
- Se estiver em `frontend`, volte um nivel: `cd ..`.

### `Python X.Y nao suportado para release local`
- `build_backend.ps1` bloqueia Python >= 3.13 por padrao.
- Use Python 3.12 para release local.
- Override (`ALLOW_UNSUPPORTED_PYTHON=1`) so em emergencia.

### `TAURI_PRIVATE_KEY` ausente
- Sem chave privada, nao gera `*.sig`.
- Sem `*.sig`, `release:publish` falha.

### `release:check` falhou
- Normalmente indica artefato antigo/misturado ou `latest.json` fora da versao.
- Rode novamente: `release:build` -> `release:publish` -> `release:check`.

### Push rejeitado por arquivo > 100MB
- Nao comitar artefatos de build (`target`, `release`, `temp`).
- Publique binarios no GitHub Release, nao no Git.
