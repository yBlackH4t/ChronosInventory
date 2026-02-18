# Release 1.x (Chronos Inventory)

## 1) Preparar ambiente
```powershell
cd D:\User\Desktop\projeto_estoque_test
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
pip install -r backend\requirements-dev.txt
cd frontend
npm install
```

## 1.2) Bump de versao (automatico)
Antes de gerar release, atualize a versao em todos os arquivos com um comando:
```powershell
cd frontend
npm run release:bump -- 1.1.2
```

Esse comando atualiza automaticamente:
- `core/constants.py` (`APP_VERSION`)
- `frontend/package.json`
- `frontend/package-lock.json`
- `frontend/src-tauri/Cargo.toml`
- `frontend/src-tauri/tauri.conf.json`
- `frontend/src-tauri/Cargo.lock` (pacote `chronos_inventory_desktop`)

## 1.1) Dados do cliente (nao entram no bundle)
- Banco: `%APPDATA%\Chronos Inventory\estoque.db`
- Imagens: `%APPDATA%\Chronos Inventory\imagens\`
- Backups: `%APPDATA%\Chronos Inventory\backups\`
- Exports: `%APPDATA%\Chronos Inventory\exports\`

O instalador nao deve carregar `*.db` no pacote. O backend cria/migra em runtime para `%APPDATA%\Chronos Inventory`.

### Migracao automatica de dados legados
Na inicializacao, o backend migra automaticamente (sem sobrescrever arquivos existentes) de:
- `%APPDATA%\EstoqueRS`
- `%LOCALAPPDATA%\EstoqueRS`
- `%APPDATA%\Estoque Local`
- `%LOCALAPPDATA%\Estoque Local`

Itens migrados:
- `estoque.db`
- `imagens/`
- `backups/`
- `exports/`

## 2) Build do backend (PyInstaller)
Sempre usar o script para garantir venv correta e nome de sidecar esperado:
```powershell
cd D:\User\Desktop\projeto_estoque_test
.\build_backend.ps1
```

Valide sidecar:
```powershell
cd frontend
npm run verify:sidecar
```

Arquivos esperados em `frontend\src-tauri\bin`:
- `estoque_backend.exe`
- `estoque_backend-x86_64-pc-windows-msvc.exe`

## 3) Build do app desktop
```powershell
cd frontend
npm run build:app
```

Saida em:
- `frontend\src-tauri\target\release\bundle\msi\`
- `frontend\src-tauri\target\release\bundle\msi\*.msi.zip` (updater)
- `frontend\src-tauri\target\release\bundle\msi\*.msi.zip.sig`

## 4) Assinatura e latest.json
Defina variaveis de release:
```powershell
$env:GITHUB_REPO="yBlackH4t/ChronosInventory"
$env:RELEASE_TAG="v1.1.2"
$env:TAURI_PRIVATE_KEY = Get-Content "C:\Users\User\.tauri\estoque.key" -Raw
$env:TAURI_KEY_PASSWORD=""
```

Importante:
- Nunca versionar chave privada no repositorio (`*.key`).
- Mantenha a chave fora do projeto (exemplo: `C:\Users\User\.tauri\`).

Build de release:
```powershell
cd frontend
npm run release:build
```

Gerar `latest.json`:
```powershell
npm run release:sign
```

Preparar pasta `frontend\release` com assets:
```powershell
npm run release:publish
```

## 4.1) Gerar novas chaves (rotacao)
```powershell
cd frontend
npx tauri signer generate -w "$env:USERPROFILE\.tauri\chronos_inventory.key"
```

Depois:
1. Copie a `public key` mostrada no terminal.
2. Atualize `frontend/src-tauri/tauri.conf.json` em `tauri.updater.pubkey`.
3. Use a chave privada nova em `TAURI_PRIVATE_KEY`.

Importante para nao quebrar clientes:
- Se ja existem clientes em producao com chave antiga, primeiro publique uma versao de transicao assinada com a chave antiga e com `pubkey` novo no app.
- Na release seguinte, assine com a chave nova.

## 5) Publicar no GitHub Releases
No release com tag (`vX.Y.Z`), subir:
- `latest.json`
- `*.msi.zip`
- `*.sig` do pacote zip
- instalador final `*.msi`

## 5.1) CI/CD (GitHub Actions)
Workflows:
- `.github/workflows/ci.yml`:
  - roda `pytest`
  - roda `npm run build` no frontend
- `.github/workflows/release.yml`:
  - dispara em tags `v*.*.*` (ou manual)
  - builda backend sidecar + Tauri MSI/updater
  - gera `latest.json`
  - publica assets no GitHub Release

Segredos obrigatorios no repositorio:
- `TAURI_PRIVATE_KEY`
- `TAURI_KEY_PASSWORD` (pode ser vazio)

## 6) Checklist de validacao
- `python -m pytest -q` (backend)
- `cd frontend && npm run build` (frontend)
- instalar MSI e abrir app
- validar `GET /health` no startup
- testar botao "Verificar atualizacao" (apos publicar release)

## 7) Troubleshooting rapido
### "No module named fastapi"
- Sidecar foi buildado com Python errado.
- Rode novamente `build_backend.ps1` com venv correta.
- Confira `npm run verify:sidecar`.

### App abre e fecha
- Verifique logs do Tauri (`src-tauri/src/main.rs`) e `backend/logs/backend.log`.
- Garanta que sidecar esta em `src-tauri/bin` e `externalBin` configurado.

### Falha ao verificar atualizacao
- Sem release publicado, isso e esperado.
- Confirme endpoint em `tauri.conf.json > tauri.updater.endpoints`.
- Confirme `pubkey` e assinatura do bundle zip.

### Erro no build MSI: "arquivo em uso"
- Feche instaladores/atualizadores abertos.
- Feche janelas do Explorer abertas em `src-tauri/target/release/bundle/msi`.
- Rode novamente `npm run build:app`.
