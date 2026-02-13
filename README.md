# Estoque API (local)

Backend FastAPI para o app de estoque desktop (React + Tauri sidecar).

## Setup
```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
pip install -r backend\requirements-dev.txt
```

## Run (local only)
```powershell
uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
```

Com porta por env:
```powershell
$env:PORT=8000
uvicorn backend.app.main:app --host 127.0.0.1 --port $env:PORT --reload
```

## Endpoints principais
- `GET /health`
- `GET /version`
- `GET /produtos?query=&page=&page_size=&sort=`
- `GET /produtos/{id}`
- `POST /produtos`
- `PUT /produtos/{id}` (replace)
- `PATCH /produtos/{id}` (partial)
- `DELETE /produtos/{id}`
- `GET /produtos/{id}/historico`
- `GET /produtos/{id}/imagem` (principal base64)
- `POST /produtos/{id}/imagem` (compat, substitui principal)
- `GET /produtos/{id}/imagens` (multiplas)
- `POST /produtos/{id}/imagens` (multiplas)
- `PATCH /produtos/{id}/imagens/{image_id}/principal`
- `DELETE /produtos/{id}/imagens/{image_id}`
- `POST /movimentacoes`
- `GET /movimentacoes`
- `GET /dashboard/resumo`
- `GET /analytics/stock/summary`
- `GET /analytics/stock/distribution`
- `GET /analytics/movements/top-saidas`
- `GET /analytics/movements/timeseries`
- `GET /analytics/movements/flow`
- `GET /analytics/stock/evolution`
- `GET /analytics/products/inactive`
- `POST /backup/criar`
- `POST /import/excel`
- `POST /export/produtos`
- `POST /relatorios/estoque.pdf`

Contrato detalhado: `docs/API_DOCS.md`.

## Regras de dados
- IDs de banco nao sao renumerados.
- Coluna `#` da UI e apenas posicao na pagina.
- Edicao parcial de campos usa `PATCH`.
- Dados em producao ficam em `%APPDATA%\Chronos Inventory` (com migracao automatica de `%APPDATA%/%LOCALAPPDATA%` de `EstoqueRS` e `Estoque Local`).

## Imagens de produto (2.x)
- Suporte a ate **5 imagens por produto**.
- Uma imagem principal por produto.
- Migracao automatica de `produtos.imagem` para `product_images`.

# Desktop (Tauri)

## Build backend sidecar (PyInstaller)
```powershell
pip install pyinstaller
.\build_backend.ps1
```
Gera e copia para:
- `frontend\src-tauri\bin\estoque_backend.exe`
- `frontend\src-tauri\bin\estoque_backend-x86_64-pc-windows-msvc.exe`

## Build frontend (Vite)
```powershell
cd frontend
npm install
npm run build
```

## Build app (Tauri)
```powershell
cd frontend
npm run build:backend
npm run build:app
```

Atalho:
```powershell
npm run build:all
```

Saida:
- `frontend\src-tauri\target\release\bundle\msi\`
- `frontend\src-tauri\target\release\bundle\msi\*.msi.zip` (updater)

## Dev local
```powershell
cd frontend
npm run dev
```
A UI espera `http://127.0.0.1:8000/health` antes de liberar uso.

## Auto-update
Fluxo completo de release, assinatura e `latest.json` em:
- `README_RELEASE.md`
