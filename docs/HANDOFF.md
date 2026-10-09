# HANDOFF — Coordenação entre agentes

Este arquivo é o canal de comunicação entre os agentes de IA que trabalham neste repositório
(Claude Code e Antigravity). **Leia este arquivo inteiro antes de começar qualquer tarefa
e atualize-o ao terminar.**

---

## 1. Regras de convivência

1. **Cada agente trabalha na sua própria branch**, nunca direto na `main`:
   - Claude Code → `claude/<tarefa>` (ex.: `claude/api-relatorios`)
   - Antigravity → `ag/<tarefa>` (ex.: `ag/tela-inventario`)
2. **Não edite arquivos da área do outro agente** (ver seção 3) sem registrar antes em
   "Pedidos entre agentes" (seção 5).
3. **Contrato de API**: mudanças em rotas ou schemas do backend (`backend/app/api/routers`,
   `backend/app/schemas`) devem ser anotadas em `docs/API_DOCS.md` e na seção 4 deste arquivo,
   para o frontend acompanhar.
4. **Antes de pedir merge**, rode as verificações da seção 2 e confirme que passam.
5. Commits em português, no padrão já usado no repositório:
   `feat(area): ...`, `fix(area): ...`, `docs: ...`, `refactor(area): ...`.
6. O merge na `main` é feito pelo **humano** (dono do projeto), não pelos agentes.

## 2. Projeto em resumo

App desktop de gestão de estoque, offline-first, para Windows.

| Camada | Tecnologia | Pasta |
|---|---|---|
| Domínio / serviços | Python 3.12 | `app/services`, `app/models` |
| Banco | SQLite (repositórios) | `core/database` |
| API local | FastAPI | `backend/app` (routers em `backend/app/api/routers`) |
| Interface | React + TypeScript + Mantine + TanStack Query | `frontend/src` |
| Desktop / instalador | Tauri (backend empacotado como sidecar) | `frontend/src-tauri` |
| Release | Scripts PowerShell/Python | `scripts`, `frontend/scripts` |

Referências: `docs/PROJECT_MAP.md`, `docs/API_DOCS.md`, `README.md`.

**Verificações (as mesmas da CI):**

```powershell
# Backend (na raiz do repositório)
python scripts/check_versions.py
python -m pytest -q

# Frontend
cd frontend
npm ci
npm run build
npm run lint
```

## 3. Divisão de áreas (proposta — o humano pode alterar)

| Área | Responsável | Pastas |
|---|---|---|
| Backend, regras de negócio, banco, testes Python | **Claude Code** | `app/`, `core/`, `backend/` |
| Release, build, CI | **Claude Code** | `scripts/`, `.github/`, `build_backend.ps1`, `*.spec` |
| Telas, componentes, UX, estilos | **Antigravity** | `frontend/src/pages`, `frontend/src/components`, `frontend/src/styles`, `frontend/src/theme` |
| Cliente da API no frontend, hooks, estado | **Antigravity** | `frontend/src/lib`, `frontend/src/hooks`, `frontend/src/state`, `frontend/src/types` |
| Tauri (`frontend/src-tauri`) | **Compartilhado** — avisar na seção 5 antes de mexer | |
| Documentação (`docs/`, `CHANGELOG.md`) | Compartilhado | |

## 4. Status atual

<!-- Cada agente atualiza a própria linha ao começar e ao terminar uma tarefa. -->

| Agente | Branch | Tarefa | Estado | Atualizado em |
|---|---|---|---|---|
| Claude Code | — | — | livre | — |
| Antigravity | — | — | livre | — |

**Mudanças de contrato de API pendentes** (backend alterou e o frontend precisa acompanhar):

- _(nenhuma)_

## 5. Pedidos entre agentes

<!-- Formato: - [ ] [DE → PARA] descrição (branch, arquivos envolvidos) -->

- _(nenhum)_

## 6. Registro de entregas

<!-- Mais recente no topo. Uma entrada por tarefa concluída. -->

<!--
### AAAA-MM-DD — <Agente> — <título curto>
- Branch: `...`
- O que foi feito: ...
- Arquivos principais: ...
- Verificações: pytest ok / build ok / lint ok
- Pendências ou observações para o outro agente: ...
-->
