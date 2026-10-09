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
| Claude Code | `feature/assistente-ia` | Assistente de IA — Fases 0, 1 e 2 (backend) prontas; próxima: Fase 3 (WhatsApp) | aguardando revisão | 2026-10-09 |
| Antigravity | — | — | livre | — |

**Mudanças de contrato de API pendentes** (backend alterou e o frontend precisa acompanhar):

- **Novo (Fase 2, implementado na branch `feature/assistente-ia`):** `POST /assistente/chat`,
  `GET /assistente/config` e `PUT /assistente/config`. Plano completo em `docs/PLANO_IA.md`;
  resumo também em `docs/API_DOCS.md`.

  Requisição:
  ```json
  {
    "mensagem": "temos turbina do scania 440?",
    "historico": [
      { "papel": "usuario", "texto": "temos turbina 4031196?" },
      { "papel": "assistente", "texto": "Sim. *TURBINA HOLSET HX55W 4031196* — 2 em Canoas." }
    ]
  }
  ```
  - `historico`: mensagens anteriores da conversa, da mais antiga para a mais nova (máx. 20).
    O backend não guarda conversa; quem guarda é a tela.

  Resposta `200` (envelope padrão `{ "data": ..., "meta": null }`):
  ```json
  {
    "data": {
      "resposta": "Scania 440 depende do motor:\n• DC13 Euro 5 (2012+) → *temos 2* (Canoas)\n• DT12 Turbo Compound → *não temos*\nQual é o motor?",
      "produtos": [
        {
          "id": 7,
          "nome": "TURBO GTA42S - 779839-0025",
          "categoria": "TURBO",
          "estoque_total": 2,
          "estoque_por_local": { "Canoas": 2 }
        }
      ],
      "ferramentas_usadas": ["buscar_por_aplicacao"]
    },
    "meta": null
  }
  ```
  - `resposta`: texto no estilo WhatsApp — `*negrito*`, quebras de linha `\n`, listas com `•`.
  - `produtos`: produtos citados na resposta (pode ser `[]`). `categoria` é `TURBO` ou `CONJUNTO CENTRAL`.
    `estoque_por_local` só traz locais com quantidade > 0.

  Erros (envelope padrão `{ "error": { "code", "message", "details" } }`):
  - `503` `assistente_indisponivel` — IA não configurada (sem chave) ou sem internet.
    Mostrar a `message` e um atalho para Configurações.
  - `422` — mensagem vazia ou longa demais (limite: 1000 caracteres).
  - A resposta pode levar de alguns segundos a mais de 30 s (a IA pode fazer várias buscas).
    Não usar timeout curto no cliente; usar no mínimo 120 s.

  Configuração da IA:
  - `GET /assistente/config` →
    `{ "configurado": bool, "origem_chave": "configuracoes" | "ambiente" | null, "chave_mascarada": "sk-ant-...1234" | null, "modelo": "claude-opus-5-5", "esforco": "medium" }`.
    A chave nunca volta inteira.
  - `PUT /assistente/config` com corpo parcial `{ "api_key"?: str, "modelo"?: str, "esforco"?: "low" | "medium" | "high" | "xhigh" | "max" }`
    → mesma resposta do GET. `"api_key": ""` remove a chave salva.

## 5. Pedidos entre agentes

<!-- Formato: - [ ] [DE → PARA] descrição (branch, arquivos envolvidos) -->

- [ ] **[Claude Code → Antigravity] Tela "Assistente" (chat com a IA).**
  Branch: `ag/assistente-chat`, criada a partir de `feature/assistente-ia`
  (`git checkout -b ag/assistente-chat feature/assistente-ia`).
  - Nova página `frontend/src/pages/AssistantPage.tsx` com rota e item no menu ("Assistente").
  - Chat: lista de mensagens (usuário à direita, assistente à esquerda), campo de texto,
    Enter envia e Shift+Enter quebra linha, indicador de "pensando…" enquanto espera.
  - Renderizar o texto da `resposta` no estilo WhatsApp: `*negrito*` → negrito, `\n` → quebra
    de linha. Não interpretar HTML.
  - Abaixo de cada resposta, cards dos `produtos` (nome, estoque total, estoque por local) que
    abrem o produto na tela de Produtos.
  - Enviar o `historico` da conversa atual a cada mensagem. Botão "Nova conversa" limpa tudo.
  - Tratar `503 assistente_indisponivel` com aviso amigável e atalho para Configurações.
  - Sugestões clicáveis quando o chat está vazio: "Temos turbina 4031196?",
    "Temos turbina do Scania 440?", "Turbina do Volvo FH 460".
  - O endpoint já existe. Um mock ligado por flag (ex.: `VITE_ASSISTENTE_MOCK=1`) continua útil
    para trabalhar sem chave da API; não deixar ligado por padrão.
  - Seguir os padrões atuais: Mantine, TanStack Query (mutation), tipos em `frontend/src/types`.
  - Verificar com `npm run build` e `npm run lint`; registrar a entrega na seção 6.
  - Fora do escopo agora: configurações do WhatsApp (QR code, números autorizados), que vêm
    com a Fase 3.

- [ ] **[Claude Code → Antigravity] Seção "Assistente de IA" em Configurações.**
  Mesma branch `ag/assistente-chat`. Usa `GET`/`PUT /assistente/config` (contrato na seção 4).
  - Status: "Configurado" / "Não configurado"; se a chave vier do ambiente, avisar
    ("usando ANTHROPIC_API_KEY deste computador").
  - Campo de senha para a chave da API, com botões "Salvar" e "Remover". Mostrar só a
    `chave_mascarada`; nunca preencher o campo com a chave salva.
  - Modelo (texto, padrão `claude-opus-5-5`) e esforço (select: low, medium, high, xhigh, max),
    com uma linha explicando que esforço menor responde mais rápido e gasta menos.
  - O atalho do aviso `503` da tela "Assistente" deve levar para esta seção.

## 6. Registro de entregas

<!-- Mais recente no topo. Uma entrada por tarefa concluída. -->

### 2026-10-09 — Claude Code — Assistente de IA: Fase 2 (backend)
- Branch: `feature/assistente-ia`
- O que foi feito: `POST /assistente/chat` com a API da Claude (tool use com as três buscas,
  prompt com as regras do negócio, fallback em recusas, cache do prompt); `GET`/`PUT
  /assistente/config` com a chave salva fora do banco; comando `perguntar` em
  `scripts/assistente_dev.py`.
- Arquivos principais: `app/services/assistant_chat_service.py`,
  `app/services/assistant_config_store.py`, `backend/app/api/routers/assistant.py`,
  `backend/app/schemas/assistant.py`, `backend/tests/test_assistant_chat.py`.
- Nova dependência: `anthropic==1.13.0` (`backend/requirements.txt`; `--collect-all anthropic`
  no `build_backend.ps1`).
- Verificações: pytest ok (108 testes). A API da Claude foi simulada nos testes; ainda não
  rodou com chave real. O build do executável não foi testado.
- Para o Antigravity: o endpoint do chat já existe; novo pedido na seção 5 (Configurações).

### 2026-10-09 — Claude Code — Assistente de IA: Fases 0 e 1
- Branch: `feature/assistente-ia`
- O que foi feito: plano do assistente (`docs/PLANO_IA.md`); banco de teste gerado a partir
  do catálogo embutido; ferramentas de busca somente leitura para a IA (por código, por
  aplicação/veículo e detalhe do produto), que respeitam as marcas atendidas (Garrett,
  Holset e BorgWarner).
- Arquivos principais: `app/services/assistant_tools_service.py`,
  `core/database/repositories/assistant_repository.py`, `core/catalog/normalization.py`
  (`search_words`), `scripts/assistente_dev.py`, `backend/tests/test_assistant_tools.py`.
- Verificações: pytest ok (100 testes), `check_versions` ok. Frontend não foi alterado.
- Para o Antigravity: tarefa da tela de chat na seção 5 e contrato da API na seção 4.

<!--
### AAAA-MM-DD — <Agente> — <título curto>
- Branch: `...`
- O que foi feito: ...
- Arquivos principais: ...
- Verificações: pytest ok / build ok / lint ok
- Pendências ou observações para o outro agente: ...
-->
