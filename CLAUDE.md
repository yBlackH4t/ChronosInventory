# Chronos Inventory

App desktop de estoque para Windows (offline-first): backend Python/FastAPI + SQLite, telas
React/Mantine, Tauri. Mapa do projeto em `docs/PROJECT_MAP.md`; rotas em `docs/API_DOCS.md`.

## Antes de qualquer tarefa

- Leia `docs/CONTEXTO.md`: o que foi feito, branches, próximos passos e cuidados. Atualize-o
  quando o estado mudar (branch, versão, próximo passo).
- **Assistente de IA** (chat e WhatsApp): detalhes em `docs/ASSISTENTE_IA.md` (estado,
  decisões, onde está cada coisa, como testar no banco real) e `docs/PLANO_IA.md`.
- O Claude cuida de tudo, backend e telas; o Antigravity está pausado desde 2026-10-10.
  O `docs/HANDOFF.md` é histórico; registre as entregas na seção 6 dele.

## Regras

- O dono do projeto fala português do Brasil e não quer custos: o assistente usa o plano
  gratuito do Groq. Nunca peça nem mostre chaves de API; elas ficam em `assistente_config.json`,
  fora do git.
- Trabalhe na `feature/assistente-ia` (ou numa branch nova a partir dela); o merge na `main` e
  a tag de versão são feitos só pelo dono. A tag publica a atualização para todas as máquinas.
- Nunca teste no `estoque.db` original da empresa: use uma cópia (`CHRONOS_APP_DIR`).
- `docs/API_DOCS.md` está em cp1252: leia e grave nessa codificação.

## Verificações

```powershell
python scripts/check_versions.py
python -m pytest -q
cd frontend; npm run build; npm run lint
```
