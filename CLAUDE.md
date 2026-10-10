# Chronos Inventory

App desktop de estoque para Windows (offline-first): backend Python/FastAPI + SQLite, telas
React/Mantine, Tauri. Mapa do projeto em `docs/PROJECT_MAP.md`; rotas em `docs/API_DOCS.md`.

## Antes de qualquer tarefa

- Leia `docs/HANDOFF.md`: coordenação entre os agentes (Claude Code e Antigravity), divisão de
  áreas, pedidos em aberto e registro de entregas. Atualize-o ao terminar.
- **Assistente de IA** (chat e WhatsApp): comece por `docs/ASSISTENTE_IA.md` (estado, decisões,
  onde está cada coisa, como testar no banco real). Detalhes em `docs/PLANO_IA.md`.

## Regras

- O dono do projeto fala português do Brasil e não quer custos: o assistente usa o plano
  gratuito do Groq. Nunca peça nem mostre chaves de API; elas ficam em `assistente_config.json`,
  fora do git.
- Cada agente trabalha na própria branch; o merge na `main` é feito só pelo dono.
- Nunca teste no `estoque.db` original da empresa: use uma cópia (`CHRONOS_APP_DIR`).
- `docs/API_DOCS.md` está em cp1252: leia e grave nessa codificação.

## Verificações

```powershell
python scripts/check_versions.py
python -m pytest -q
cd frontend; npm run build; npm run lint
```
