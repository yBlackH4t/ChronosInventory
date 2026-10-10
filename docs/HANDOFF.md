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
| Claude Code | `feature/assistente-ia` | Assistente — base de conhecimento do especialista, admin e histórico (backend) prontos; próxima: distribuir o conhecimento e Fase 3 (WhatsApp) | aguardando revisão | 2026-10-09 |
| Antigravity | `ag/assistente-chat` | Assistente: área do admin (ensinar o assistente) | em andamento | 2026-10-09 |

**Mudanças de contrato de API pendentes** (backend alterou e o frontend precisa acompanhar):

- **Novo (2026-10-09, base de conhecimento):** admin, conhecimento, revisão e histórico do
  assistente. Contrato completo em `docs/API_DOCS.md` ("Admin do assistente", "Base de
  conhecimento do especialista", "Revisao e historico"); regras em `docs/PLANO_IA.md` (Fase 2b).
  - Admin = máquina **publicadora** da base oficial + **senha**. `POST /assistente/admin/login`
    devolve `token`; mandar no header `X-Admin-Token` nas rotas de admin. Sem isso:
    `403 admin_necessario` (mostrar a `message`, que explica o motivo). Guardar o token só em
    memória (estado/contexto), nunca em `localStorage`.
  - `POST /assistente/chat`: campos opcionais novos `canal` (`app` | `whatsapp`) e `autor`.
    A tela de chat não precisa mandar nada novo.

- **Mudou (2026-10-09, custo zero):** o provedor padrão agora é o **Groq gratuito**, e quando a IA
  não responde o backend responde pela **busca direta** (sem IA). Para o frontend:
  - `POST /assistente/chat` **não devolve mais `503`**. A resposta ganhou `"modo": "ia" | "busca_direta"`
    e `"aviso": string | null` (motivo de a IA não ter respondido, ex.: "Limite de uso do Groq
    atingido. Resposta pela busca direta (sem IA).").
  - `GET /assistente/config` ganhou `provedor` e `provedores` (lista). Os campos antigos
    (`configurado`, `origem_chave`, `chave_mascarada`, `modelo`, `esforco`) continuam no nível de
    cima e valem para o provedor atual — a tela de Configurações atual continua funcionando.
  - `PUT /assistente/config` aceita `provedor` (`groq`, `gemini`, `ollama`, `anthropic`, `nenhum`);
    `api_key` e `modelo` valem para o provedor enviado (ou o atual).
  - Pedido novo na seção 5 para mostrar isso na tela.

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
  - ~~`503` `assistente_indisponivel`~~ — não acontece mais (ver "Mudou" acima).
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

- [x] **[Claude Code → Antigravity] Tela "Assistente" (chat com a IA).**
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

- [x] **[Claude Code → Antigravity] Assistente: provedor gratuito e busca direta na tela.**
  Mesma branch `ag/assistente-chat` (traga as mudanças com `git merge feature/assistente-ia`).
  Contrato em "Mudou (2026-10-09)", seção 4.
  - Chat: quando `modo` = `busca_direta`, mostrar um selo discreto "Busca direta (sem IA)" na
    resposta e, se houver `aviso`, o texto do aviso em tom informativo (não é erro) com atalho
    para Configurações. O tratamento de `503` pode ficar, mas não deve mais aparecer.
  - Configurações → Assistente de IA: select de **provedor** a partir de `provedores`
    (mostrar "gratuito" quando `gratuito` = true; padrão Groq). Ao trocar, `PUT { provedor }`.
    O campo de chave e o modelo passam a valer para o provedor selecionado; esconder o campo de
    chave quando `precisa_chave` = false (Ollama, "nenhum").
  - Para o Groq, texto de ajuda: "Crie uma chave gratuita em console.groq.com → API Keys (não
    pede cartão)".
  - O esforço só faz diferença para Groq e Claude; pode ficar como está.
  - Mock: atualizar com `modo` e `aviso`.

- [ ] **[Claude Code → Antigravity] Assistente: área do admin (ensinar o assistente).**
  Branch `ag/assistente-chat` (ou `ag/assistente-admin`), depois de `git merge feature/assistente-ia`.
  Contrato em `docs/API_DOCS.md`. Sugestão: uma aba "Admin" dentro da página Assistente,
  visível sempre, com três abas internas: **Para revisar**, **Conhecimento**, **Histórico**.
  - **Entrada:** `GET /assistente/admin/status`.
    - `maquina_publicadora = false` → explicar: "Para ensinar o assistente, esta máquina precisa
      ser a publicadora da base oficial (Configurações > Base oficial)." e mostrar o
      Conhecimento só para leitura.
    - `senha_definida = false` → formulário "Criar senha de admin" (`POST /admin/senha`).
    - senão → campo de senha e "Entrar" (`POST /admin/login`); botão "Sair" (`/admin/logout`).
      Opção "Trocar senha" (pede a atual).
  - **Para revisar** (`GET /assistente/revisao`): um cartão por código — código, quantas vezes
    foi perguntado, última vez e um exemplo da pergunta. Para cada `sugestoes[]`: produto,
    estoque, `motivo`, e botões **"É igual"**, **"É similar"** (pede a ressalva, ex.: "muda o
    atuador") e **"Não serve"** — cada um faz `POST /assistente/conhecimento` com
    `codigo_a` = código do cartão e `codigo_b` = código da sugestão, tipo `igual` / `similar` /
    `diferente`. Também um formulário livre ("é igual/similar a outro código") e
    **"Nada a fazer"** (`POST /revisao/{codigo}/concluir`). Recarregar a lista depois.
    Mostrar `conhecimento[]` (o que já foi ensinado sobre o código), se houver.
  - **Conhecimento** (`GET /assistente/conhecimento?busca=`): tabela com Código A, relação,
    Código B, observação e data; busca por código; "Nova regra" (mesmo formulário) e excluir
    (`DELETE`, com confirmação). Explicar numa linha: "igual = troca direta; similar = serve
    com ressalva; diferente = não serve (o assistente nunca sugere)".
  - **Histórico** (`GET /assistente/historico?limite=&offset=`): lista com data, canal,
    pergunta, resposta (renderizar `*negrito*` como no chat), modo/aviso e paginação. Em cada
    conversa, "Corrigir resposta" (`PUT /historico/{id}/correcao`, mostrar a correção salva).
    Botão **"Exportar JSONL"**: `fetch` com o header e baixar o arquivo
    (`assistente_historico.jsonl`).
  - Verificar com `npm run build` e `npm run lint`; registrar na seção 6.

- [x] **[Claude Code → Antigravity] Seção "Assistente de IA" em Configurações.**
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

### 2026-10-09 — Antigravity — Assistente: provedor gratuito e busca direta na tela
- Branch: `ag/assistente-chat` (com merge de `feature/assistente-ia`)
- O que foi feito: no chat, respostas com `modo = busca_direta` ganham o selo "Busca direta (sem IA)"
  e, se houver `aviso`, um alerta informativo (azul, não é erro) com atalho para Configurações. Em
  Configurações → Assistente de IA: select de provedor a partir de `provedores` (marca "gratuito"),
  troca com `PUT { provedor }`; chave e modelo valem para o provedor atual; campo de chave oculto
  quando `precisa_chave = false`; ajuda do Groq (console.groq.com). Aviso de chave do ambiente usa o
  nome da variável do provedor. Mock atualizado com `modo`/`aviso` e provedores (estado em memória;
  mensagem com "busca" ou provedor sem chave → resposta por busca direta).
- Arquivos principais: `frontend/src/pages/AssistantPage.tsx`,
  `frontend/src/components/settings/AssistantSettingsPanel.tsx`, `frontend/src/lib/assistantApi.ts`,
  `frontend/src/types/assistant.ts`.
- Verificações: build ok / lint sem infrações nos arquivos alterados.
- Pendências ou observações para o outro agente: nenhuma. Nomes das variáveis de ambiente exibidos
  (`GROQ_API_KEY`, `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`) conferidos com `assistant_config_store.py`.

### 2026-10-09 — Antigravity — Seção Assistente de IA em Configurações
- Branch: `ag/assistente-chat`
- O que foi feito: Implementada a seção "Assistente de IA" na tela de Configurações. Adicionados campos de `api_key` mascarada (com função salvar/remover), seleção do Modelo e do Esforço de busca. Atualizado cliente da API com funções `getAssistantConfig` e `updateAssistantConfig` e suporte ao mock da feature flag.
- Arquivos principais: `frontend/src/components/settings/AssistantSettingsPanel.tsx`, `frontend/src/pages/SettingsPage.tsx`, `frontend/src/lib/assistantApi.ts`, `frontend/src/types/assistant.ts`.
- Verificações: build ok / lint sem novas infrações.
- Pendências ou observações para o outro agente: Tudo pronto, integrado e utilizando mock.

### 2026-10-09 — Antigravity — Tela Assistente de IA
- Branch: `ag/assistente-chat`
- O que foi feito: Implementada a UI de chat do assistente na tela "Assistente". Foi criado o cliente mock para consumo da IA baseado na flag `VITE_ASSISTENTE_MOCK`. Tratamento de mensagens com markdown de negrito e formatação em linhas, renderização de cards de produtos (com navegação para `/produtos`), envio de histórico de mensagens e função "Nova conversa".
- Arquivos principais: `frontend/src/pages/AssistantPage.tsx`, `frontend/src/lib/assistantApi.ts`, `frontend/src/types/assistant.ts`, `frontend/src/app/router.tsx`, `frontend/src/app/routePreload.ts`, `frontend/src/app/navigation.ts`.
- Verificações: build ok / lint com erros apenas em arquivos antigos/preexistentes (nada na nova feature).
- Pendências ou observações para o outro agente: A interface está pronta e utilizando mock com sucesso. Aguardando a Fase 2 no backend para testar integração real.

### 2026-10-09 — Claude Code — Assistente: conhecimento do especialista, admin e histórico
- Branch: `feature/assistente-ia`
- O que foi feito: base de conhecimento (igual / similar / diferente) usada pela busca; busca
  completa o final do código ("988-7101"); admin = máquina publicadora + senha; histórico das
  conversas em banco separado com lista "Para revisar", sugestões de similares, correção do
  admin e exportação JSONL. Buscas devolvem `texto_pronto` (a IA gratuita responde com ele).
- Arquivos principais: `app/services/assistant_knowledge_service.py`,
  `assistant_admin_service.py`, `assistant_history_service.py`, `assistant_answer_format.py`,
  `backend/app/api/routers/assistant.py`, testes `test_assistant_knowledge.py` e
  `test_assistant_admin.py`.
- Verificações: pytest ok (135 testes); avaliação sem IA 17/17.
- Para o Antigravity: contrato na seção 4 ("Novo, base de conhecimento") e pedido da área do
  admin na seção 5.

### 2026-10-09 — Claude Code — Assistente: IA gratuita (Groq) + busca direta
- Branch: `feature/assistente-ia`
- O que foi feito: o dono não quer custo, então o provedor padrão virou o plano gratuito do Groq
  (sem cartão). Integração genérica no formato de API do OpenAI (Groq, Gemini, Ollama) via
  `requests`; Claude continua como opção. Busca direta (sem IA) responde quando a IA falha ou
  quando o provedor é "nenhum". Ferramentas com modo compacto para o limite do Groq.
- Arquivos principais: `app/services/assistant_chat_service.py`, `assistant_openai_compat.py`,
  `assistant_direct_service.py`, `assistant_anthropic.py`, `assistant_common.py`,
  `assistant_config_store.py`, `backend/tests/test_assistant_chat.py`.
- Verificações: pytest ok (118 testes). Groq e Claude simulados nos testes; ainda sem teste com
  chave real.
- Para o Antigravity: contrato atualizado (seção 4, "Mudou") sem quebrar a tela atual de
  Configurações; pedido novo na seção 5.

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
