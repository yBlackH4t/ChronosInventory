# Frontend Estoque (React + Vite)

## Requisitos
- Node.js 18+

## Setup
```bash
npm install
```

## Rodar
```bash
npm run dev
```

## Configurar API
Por padrao, o app usa `http://127.0.0.1:8000`.
Para mudar:

```bash
VITE_API_URL=http://127.0.0.1:8000 npm run dev
```

## Streams (export/relatorio)
Os endpoints de exportacao e relatorio retornam Blob. O frontend faz download via `downloadBlob`.

## Auto-update (Tauri)
O fluxo completo de release e `latest.json` esta no `README.md` da raiz.

## Estrutura
- `src/app`: providers, ApiGate, router
- `src/pages`: telas
- `src/components`: layout
- `src/lib`: SDK e helpers
