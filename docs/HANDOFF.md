# HANDOFF — Coordenação entre agentes

> **Desde 2026-10-10 o Antigravity está pausado.** O dono passou a trabalhar só com o Claude
> (Projeto no Claude Desktop e Claude Code), que agora cuida de tudo, backend e telas, na branch
> `feature/assistente-ia`. Para começar, leia `docs/CONTEXTO.md`. Este arquivo fica como
> histórico das entregas (seção 6) e dos contratos de API (seção 4). Se o Antigravity voltar,
> as regras abaixo continuam valendo.

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
| Claude Code | `feature/assistente-ia` | Tudo numa branch só (backend + todas as telas, inclusive as da `ag/operacao-e-atalhos`), candidata à versão 2.4.0; contexto em `docs/CONTEXTO.md` | aguardando teste do dono no banco real | 2026-10-10 |
| Antigravity | `ag/operacao-e-atalhos` | Pausado; o último trabalho (até `67bd3e2`) já está na `feature/assistente-ia` | pausado | 2026-10-10 |

**Mudanças de contrato de API pendentes** (backend alterou e o frontend precisa acompanhar):

- **Novo (2026-10-10, proteção de dados — branch `claude/protecao-dados`, já trazida para a
  `feature/assistente-ia`):**
  - `PUT /backup/base-oficial/config` aceita `server_token` (senha do servidor local, mín. 6;
    `null` mantém, `""` remove); `GET /backup/base-oficial/status` ganhou `server_token_set: bool`
    (a senha nunca volta). Com senha, o servidor 8765 exige o cabeçalho `X-Chronos-Senha` (o
    backend envia sozinho); `/health` informa `senha_exigida`/`senha_ok`.
  - `DELETE /produtos/{id}` com movimentações além do estoque inicial do cadastro → `400
    validation_error` com a mensagem "Não dá para excluir …: ele tem N movimentação(ões) no
    histórico. Para não perder o histórico, inative o produto." Pedido na seção 5.

- **Novo (2026-10-09, conhecimento entre as máquinas — Fase 2c):** o que o admin ensina vai
  sozinho para as outras máquinas, pelos caminhos da base oficial (pasta compartilhada e/ou
  servidor local). Duas rotas novas, sem admin (contrato em `docs/API_DOCS.md`):
  `GET /assistente/conhecimento/sincronizacao` →
  `{ papel, fonte, publicado_em, maquina, total_regras, atualizado_em, verificado_em, erro }` e
  `POST /assistente/conhecimento/sincronizar` ("Sincronizar agora", mesma resposta). Pedido na seção 5.

- **Mudou (2026-10-09, busca direta primeiro):** o formato do `POST /assistente/chat` não mudou,
  mas `modo` = `busca_direta` com `aviso` = `null` passou a ser a resposta **normal**: a busca
  direta responde primeiro quando entende a pergunta (código, veículo/motor, "temos essa daí?",
  resposta a "Qual é o motor?"). `modo` = `ia` só quando ela não entende (frase diferente, fora do
  assunto). `aviso` preenchido continua significando que a IA falhou. Motivo: na avaliação com o
  Groq real, o modelo gratuito errou 7 de 17 perguntas (trocava códigos ao copiar, buscava sem o
  "440"); com a busca direta primeiro, 17 de 17. Pedido de ajuste na seção 5.

- **Novo (2026-10-09, WhatsApp e propostas):** endpoints `/assistente/whatsapp/*` (status com
  QR, iniciar, parar, desconectar) e `/assistente/propostas` (listar, aprovar, recusar), todos
  de admin. Contrato em `docs/API_DOCS.md` ("Propostas" e "WhatsApp (modo copiloto)").

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

- [x] **[Claude Code → Antigravity] Revisão do commit `0f60808` (`ag/operacao-e-atalhos`): corrigir antes de usar.**
  Revisado lendo o código contra o backend (2026-10-10).
  1. **Movimentação rápida com AJUSTE ou TRANSFERÊNCIA EXTERNA sempre falha**
     (`QuickMovementModal.tsx`): o modal oferece essas naturezas, mas não manda `motivo_ajuste` (e
     a observação é obrigatória no AJUSTE) nem `local_externo`; o backend recusa
     (`movement_rules_service.validate_business_rules`). Mostrar esses campos quando a natureza
     pedir (como no formulário completo de Movimentações) ou deixar no modal rápido só
     OPERACAO_NORMAL/DEVOLUCAO, com um link "mais opções" para o formulário completo.
  2. **Atalho N pode movimentar o produto errado** (`ProductsPage.tsx`, ~linha 673): sem produto sob o
     mouse/selecionado/aberto, o N cai no **primeiro da lista** (`rows[0]`). Com o foco na
     quantidade e o Enter confirmando, são dois toques para dar baixa num produto que a pessoa não
     escolheu. Tirar esse último recurso: sem produto escolhido, o N não faz nada (ou abre a busca).
  3. **Indicador de sincronização no topo** (`SyncStatusBadge.tsx`): ele mostra o **conhecimento do
     assistente**, mas o texto diz "Base Oficial: …" — dá a entender que o estoque está
     sincronizado, e os estoques são separados por máquina. Trocar para "Conhecimento do
     assistente". Usar o campo novo `configurado` de `GET /assistente/conhecimento/sincronizacao`:
     `configurado = false` → cinza "não configurado" (hoje fica laranja "Sync pendente" em toda
     máquina que não usa o assistente); laranja só com `configurado = true` e `erro`; sem
     `verificado_em` → "ainda não sincronizou" (hoje aparece "Sincronizado").
  4. Menor: em `ProductCatalogTab.tsx`, `RelatedPieceCard` pega o **primeiro resultado** de
     `listProducts({ query: código })` para o selo de estoque; uma busca por parte do código pode
     trazer outro produto. Conferir se o produto encontrado tem mesmo aquele código.
  - Observação: a `ag/operacao-e-atalhos` nasceu da `ag/assistente-chat`, então essas melhorias
    gerais (atalho N, Spotlight) só chegam à `main` junto com o assistente. Se o dono quiser antes,
    elas precisam ir numa branch a partir da `main` (o indicador e o chat → produtos dependem do
    assistente).
  - Verificar com `npm run build` e `npm run lint`; registrar na seção 6.

- [x] **[Claude Code → Antigravity] Assistente: resumo diário na aba WhatsApp.**
  Rotas `GET /assistente/resumo` e `PUT /assistente/resumo` (admin), contrato em `docs/API_DOCS.md`.
  Na aba WhatsApp do admin, um bloco "Resumo diário":
  - interruptor "Mandar todo dia na 'Mensagem para mim'" (`ativo`) e horário (`hora`, HH:MM, padrão 08:00);
  - "último envio: <data>" (`ultimo_envio`) e o botão **"Ver o resumo de hoje"**, que mostra o
    `texto` renderizado como no chat (`*negrito*`, `•`);
  - nota curta: "Sai só com o WhatsApp do app conectado. Na conversa, /resumo manda na hora."
  - No quadro "Como usar", acrescentar `/resumo`. Verificar com `npm run build` e `npm run lint`;
    registrar na seção 6.

- [x] **[Claude Code → Antigravity] Assistente: foto da plaqueta no chat do app.**
  Rota nova `POST /assistente/chat/foto` (multipart: `foto`, `mensagem?`, `historico?` em JSON;
  contrato em `docs/API_DOCS.md`). No chat (`AssistantPage.tsx`):
  - botão de câmera/clipe ao lado do campo de texto (aceitar `image/*`; no celular abre a câmera);
    o texto digitado vai junto em `mensagem`, e o histórico como na conversa normal;
  - na conversa, a mensagem do usuário mostra uma miniatura da foto; a resposta mostra antes, em
    tom discreto, o `leitura_foto` ("Foto da plaqueta: 466646-5041S");
  - erro `422 foto_ilegivel`: mostrar a `message` (já explica o que fazer). A leitura leva alguns
    segundos: mostrar "lendo a foto…".
  - Na aba WhatsApp, no quadro "Como usar": "Foto da plaqueta: reaja com 🤖 na foto".
  - Verificar com `npm run build` e `npm run lint`; registrar na seção 6.

- [x] **[Claude Code → Antigravity] Senha do servidor e exclusão de produto (proteção de dados).**
  Contrato em "Novo (2026-10-10, proteção de dados)", seção 4. Fazer na `ag/assistente-chat`
  depois de `git merge feature/assistente-ia`.
  - **Backup > Base oficial**: campo de senha "Senha do servidor (a mesma em todas as máquinas)",
    nas duas funções (publica e consome). Nunca preencher com a senha salva; mostrar
    "Senha configurada" quando `server_token_set`; botões Salvar (`PUT … { …, server_token }`) e
    Remover (`server_token: ""`). Mínimo de 6 caracteres. Quando o servidor estiver ligado e
    `server_token_set` = false, aviso: "Sem senha: qualquer aparelho do Wi-Fi pode baixar o estoque".
  - **Produtos > Excluir**: o erro já explica e pede para inativar. Melhor: no modal de
    confirmação, avisar "Produtos com movimentações não podem ser excluídos; inative para tirar da
    lista", e quando a exclusão falhar com esse motivo, oferecer o botão **Inativar** ali mesmo.
  - Verificar com `npm run build` e `npm run lint`; registrar na seção 6.

- [x] **[Claude Code → Antigravity] Antes da versão nova: 2 correções na `ag/operacao-e-atalhos` (f7fc92a).**
  Revisados os commits `d62f457` e `f7fc92a`: as 4 correções da revisão do `0f60808` estão certas;
  testes (185), build e lint passam. Faltam:
  1. **"Salvar configuração" da Base oficial quebrou (bloqueia a versão).** Testado no app: o
     clique mostra "Converting circular structure to JSON" e nada é salvo. Causa:
     `OfficialBaseSection.tsx` faz `<Button onClick={onSaveConfig}>`, e `saveOfficialBaseConfig`
     (`useBackupOfficialBasePanel.ts`) agora recebe `tokenOverride`: o evento do clique vira a
     senha. Corrigir com `onClick={() => onSaveConfig()}` (e o tipo da prop continua `() => void`).
  2. **Cache das telas guarda consultas ainda carregando** (`app/providers.tsx`, desde `84bb741`):
     o `shouldDehydrateQuery` próprio substitui o padrão, que só guarda consultas com sucesso. Em
     Backup aparecem dezenas de "A query that was dehydrated as pending ended up rejecting" no
     console. Usar `defaultShouldDehydrateQuery(query) && !String(query.queryKey[0]).startsWith("assistant-admin")`
     (`defaultShouldDehydrateQuery` vem de `@tanstack/react-query`).
  - Verificar com `npm run build` e `npm run lint`, clicar em "Salvar configuração" em Backup >
    Base oficial e registrar na seção 6.

- [x] **[Claude Code → Antigravity] Assistente: tela quebra ao digitar nos formulários do admin (urgente).**
  Achado no teste do dono: em "Ensinar outro código", ao digitar o código, a tela quebra e o app
  recarrega (o login de admin, que fica em memória, se perde; o `POST /assistente/conhecimento`
  nem chega ao backend). Causa: `e.currentTarget.value` lido **dentro** do atualizador do
  `setState` (`setX((prev) => ({ ...prev, campo: e.currentTarget.value }))`). O React roda o
  atualizador depois do evento, quando `currentTarget` já é `null` → "Cannot read properties of
  null (reading 'value')". Correção: ler antes — `const value = e.currentTarget.value;
  setX((prev) => ({ ...prev, campo: value }))`. Pontos:
  - `AdminReviewTab.tsx:571` (ressalva do "É similar"), `:607` (código do "Ensinar outro
    código") e `:635` (observação do mesmo modal);
  - `AdminHistoryTab.tsx:384` e `:399` (modal "Corrigir resposta").
  - Os `setX(e.currentTarget.value)` diretos estão certos. Testar digitando em cada modal;
    `npm run build` e `npm run lint`; registrar na seção 6.

- [x] **[Claude Code → Antigravity] Assistente: telas ilegíveis no tema escuro (urgente, achado no teste do dono).**
  Branch `ag/assistente-chat`. No tema escuro, cartões com fundo claro fixo recebem o texto claro
  do tema: a barra do admin ("Admin Autenticado", "Máquina Publicadora", "Sair") e as sugestões de
  "Para revisar" (nome, código, estoque e os botões "É igual"/"É similar"/"Não serve") ficam quase
  invisíveis. Trocar os fundos fixos por cores que acompanham o tema (Mantine 7: sem `bg` no
  Card/Paper, `var(--mantine-color-default-hover)` para o cinza, `var(--mantine-color-<cor>-light)`
  para os coloridos, ou `light-dark(...)`) e tirar `c="black"`:
  - `AssistantAdminPanel.tsx:393` (`gray-0`, barra do admin);
  - `AdminReviewTab.tsx:315` (`teal-0`, propostas) e `:463` (`gray-0`, sugestões);
  - `AdminKnowledgeTab.tsx:205` (`blue-0`) e `:214` (`gray-0`);
  - `AdminHistoryTab.tsx:277` (`gray-0`) e `:315` (`green-0`);
  - `AdminWhatsAppTab.tsx:299` (`green-0`) e `:337` (`gray-0`); em `:260` (`bg="white"`) o
    branco pode ficar **só atrás do QR code** (o celular precisa de fundo claro para ler);
  - `AssistantPage.tsx:236` (balão do assistente `gray.0` com `c="black"`);
  - `settings/AssistantSettingsPanel.tsx:153` (`gray-0`).
  - Conferir as telas do assistente nos dois temas (botão de tema no topo); `npm run build` e
    `npm run lint`; registrar na seção 6.

- [x] **[Claude Code → Antigravity] Assistente: ajustes rápidos (fazer primeiro).**
  Branch `ag/assistente-chat`, depois de `git merge feature/assistente-ia` (o conflito esperado é
  só no `docs/HANDOFF.md`, seções 4 e 6: manter as entradas dos dois lados).
  - **Selo do chat** (`AssistantPage.tsx`): "Busca direta (sem IA)" agora apareceria em quase toda
    resposta e parece defeito. Mostrar o selo e o alerta **só quando vier `aviso`** (a IA falhou).
    Sem aviso, nada de selo; o modo de cada resposta continua visível no Histórico do admin.
  - **Texto errado** em `AssistantAdminPanel.tsx` (~linha 261): "Configurações > Base oficial" →
    "Backup > Base oficial > Papel desta máquina: Publica a base" (é onde fica a opção).
  - **Formato dos códigos** (decisão do dono): em exemplos, placeholders e mocks, só dígitos
    (53279887101); só a Garrett usa hífen (796155-5002). Hoje o mock em `assistantAdminApi.ts`
    usa "5327-988-7101". As respostas do backend já vêm nesse formato.
  - Verificar com `npm run build` e `npm run lint`; registrar na seção 6.

- [x] **[Claude Code → Antigravity] Assistente: conhecimento nas outras máquinas (status e botão).**
  Contrato em "Novo (Fase 2c)", seção 4. Na aba **Conhecimento** (que as outras máquinas veem só
  para leitura), uma linha de status com `GET /assistente/conhecimento/sincronizacao`:
  - `papel` = `publisher`: "Publicado para as outras máquinas (<fonte>) em <atualizado_em> —
    <total_regras> regras";
  - senão: "Recebido da máquina <maquina> (<fonte>) em <atualizado_em> — <total_regras> regras";
  - `erro` preenchido: mostrar o texto num aviso (ele diz o que configurar em Backup > Base oficial);
  - botão **"Sincronizar agora"** (`POST /assistente/conhecimento/sincronizar`), que atualiza a
    linha e, nas outras máquinas, recarrega a lista de regras.
  - Datas no formato do app (vêm em ISO). Verificar com `npm run build` e `npm run lint`; registrar na seção 6.

- [x] **[Claude Code → Antigravity] WhatsApp do assistente e propostas na área do admin.**
  Mesma área do admin (exige login de admin; contrato em `docs/API_DOCS.md`).
  - **Aba "WhatsApp"** (ou seção em Configurações > Assistente, só para o admin):
    - estado em português ("Desligado", "Conectando…", "Escaneie o QR code", "Conectado ao
      número X", "Desconectado do celular — conecte de novo", "Erro: …");
    - botão **"Conectar WhatsApp"** (`POST /whatsapp/iniciar`) e, enquanto o estado for
      `aguardando_qr`, **desenhar o QR code** a partir do texto `qr` (biblioteca de QR para
      React; atualizar a cada 2–3 s com `GET /whatsapp/status`, porque o código muda);
      instrução: "No celular: WhatsApp > Configurações > Aparelhos conectados > Conectar um aparelho";
    - quando conectado: **"Desligar"** (`/whatsapp/parar`) e **"Desconectar este computador"**
      (`/whatsapp/desconectar`, com confirmação);
    - um quadro curto "Como usar": reagir com 🤖 na mensagem do cliente; comandos na conversa
      "Mensagem para mim" (`/ajuda`, `/pendentes`, `/ensinar`);
    - aviso fixo: "Conexão não oficial: o WhatsApp pode bloquear o número. Use com moderação."
  - **Propostas** (no topo de "Para revisar"): `GET /assistente/propostas` → cartões
    "Código A — relação — Código B (observação), enviada pelo WhatsApp em <data>", com
    **"Aprovar"** (`POST /propostas/{id}/aprovar`) e **"Recusar"** (`/recusar`).
  - Verificar com `npm run build` e `npm run lint`; registrar na seção 6.

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

- [x] **[Claude Code → Antigravity] Assistente: área do admin (ensinar o assistente).**
  Branch `ag/assistente-chat` (ou `ag/assistente-admin`), depois de `git merge feature/assistente-ia`.
  Contrato em `docs/API_DOCS.md`. Sugestão: uma aba "Admin" dentro da página Assistente,
  visível sempre, com três abas internas: **Para revisar**, **Conhecimento**, **Histórico**.
  - **Entrada:** `GET /assistente/admin/status`.
    - `maquina_publicadora = false` → explicar: "Para ensinar o assistente, esta máquina precisa
      ser a publicadora da base oficial (Backup > Base oficial > Papel desta máquina: Publica a
      base)." e mostrar o
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

### 2026-10-30 — Claude Code — 2.7.31: bibliotecas com falha conhecida
- Branch: `claude/project-thread-sxyros`. Dependabot e CodeQL ligados pelo dono; 77 + 42 alertas.
- `backend/requirements.txt`: pillow 12.1.1 → 13.0.0, starlette 0.52.1 → 1.10.0, fastapi 0.146.0 → 0.162.0 (pip-audit sem pendências). `frontend`: vitest 3 → 5 (`npm audit` 0).
- Pendente: `zip` 4.6.1 no Cargo.lock vem do tauri-plugin-updater 2.10; corrigir exige Tauri 2.12 (Rust e `@tauri-apps/*`). Risco baixo (atualização assinada é conferida antes de abrir o zip).

### 2026-10-30 — Claude Code — 2.7.30: desempenho (Painel, Produtos, buscas)
- Branch: `claude/project-thread-7x8daq` (sobre a main 2.7.27; 2.7.28 está no PR #60, 2.7.29 no #61). Auditoria medida num banco de teste com os 4.279 produtos do CSV, o catálogo real e 150 mil movimentações.
- `MovementRepository.get_stock_items_overview`: saídas numa passada agrupada por produto (antes subconsulta por produto que o SQLite resolvia pelo índice de tipo). Mesmo resultado; 14 s → 0,5 s.
- `DatabaseConnection.refresh_query_planner_stats()` (ANALYZE com `analysis_limit`) na abertura e no `ensure_schema`. Índice `idx_produtos_vinculado`.
- `GET /analytics/stock/health`: o Painel recebe contagem + parados do topo, não a lista inteira.
- Prefixo de código com GLOB (usa índice) em `catalog_repository`/`knowledge_repository`; `search_catalog` filtra referências por subconsulta indexada. Cache das palavras das aplicações em `assistant_tools_service`. pandas importado só dentro das funções.
### 2026-10-30 — Claude Code — 2.7.29: atualização automática
- Branch: `claude/project-thread-pfk96d` (sobre a main 2.7.28). Opção escolhida pelo dono: baixar escondido e instalar ao fechar.
- `frontend/src-tauri/src/auto_update.rs`: procura ao abrir e a cada hora, baixa em segundo plano e instala (cópia `POST /backup/pre-update` antes) ao fechar a janela, em "Sair do Chronos", quando a janela está escondida na bandeja, ou ao abrir quando a versão já tinha sido baixada antes (`desktop.json` `versao_baixada`). O instalador MSI reabre o app; `depois_de_atualizar` em `desktop.json` faz ele voltar na bandeja ou continuar fechado. Tela: `hooks/useTauriUpdater.tsx` (aviso "Atualização pronta" + "Reiniciar agora"; comandos `atualizacao_estado`, `instalar_atualizacao_agora`). Só vale a partir da 2.7.29 instalada.

### 2026-10-30 — Claude Code — 2.7.28: layout limpo fase 3 (telas da engrenagem)
- Branch: `claude/project-thread-1yjko1` (sobre a main 2.7.27). Fase 3 e última do plano aprovado.
- Inventário (`EmptyState` com "Nova sessão" quando não há sessão; botão "Folha de contagem"), Relatórios (sem `resetView`), Configurações (`.vv-pals` 3 por 3; `DesktopSettingsPanel` retorna null fora do app), Exportar (`ExportCard`), Perfis (caminhos em Accordion "Detalhes"), Comparar (cards só com `compareResult`), Importar (`Stepper` steps até 720 px), Base oficial (`OfficialBaseSection`: URLs só com servidor ligado, tabela só com base publicada) e Backup (`BackupHome`: "Pegar a base" só com servidor remoto).

### 2026-10-30 — Claude Code — 2.7.27: layout limpo fase 2 (telas do dia a dia)
- Branch: `claude/project-thread-1yjko1` (sobre a main 2.7.26). Fase 2 do plano aprovado.
- Painel: relógio nas ações do `PageHeader`; `AlertsBlock` numa linha com ponto colorido e motivo curto (`lib/dashboardActions.ts`); KPI sem "+" quando há seta e sem fonte mono; Sistemas ocupa a altura toda.
- Produtos: `versionTag` (Nova não aparece), `productMonogram(brand)` só com marca, `ProductThumb hideEmpty` na lista; colunas sem a contagem repetida na faixa e com código antes do #ID.
- Etiquetas: `CopiesInput` com – e + (em "1 por item" passa para manual só naquele item). Assistente: `PageHeader`, largura total com a conversa em até 960 px e "Admin" como botão no cabeçalho.

### 2026-10-30 — Claude Code — 2.7.26: layout limpo e sistema organizado
- Branch: `claude/project-thread-1yjko1` (sobre a main 2.7.25). Pedido do dono: "zerar o design", deixar cada tela limpa e o sistema organizado. Plano aprovado em 3 fases; esta é a fase 1 mais a organização que ele pediu com prints.
- Base comum: `PageHeader` sem ícone; `useLocations().branchColumns` (vazio com uma filial ativa) decide colunas por filial em Etiquetas, Ativação em massa, Relatórios e "para Canoas" em Movimentações; chip de código `.pm-code`/`.pm-code-cell` no estilo do nome em Produtos; Movimentação em lote com `MOVEMENT_TYPES`/`MOVEMENT_NATURES`; selo "Saldo inicial" (`lib/movementTimeline.ts`); perfil e selo da base oficial na barra só quando fazem sentido.
- Organização: filtros de Produtos (estoque e ordenação) e de Movimentações (tipo, ordem, Por dia/Tabela pela chave `MOVEMENTS_VIEW_KEY`, estornados) dentro do botão Filtros; lixeira do Assistente ao lado do campo; `pages/OfficialBasePage.tsx` em `/base-oficial`; Catálogo e Cadastro da empresa em Importar; grupos novos em `ADMIN_NAV`.

### 2026-10-30 — Claude Code — 2.7.25: paletas completas e Chronos mais animado
- Branch: `claude/project-thread-pimrnb` (sobre a main 2.7.24). Pedido do dono: Painel mais vivo, mais cores além do azul e ideias para as outras telas; ele aprovou tudo do protótipo (A1-A9, T1-T7, B1-B9, C1).
- Paletas: `frontend/src/lib/palettes.ts` (8 paletas + "Minha cor"; escreve variáveis no :root pelo `PaletteVars` de `app/providers.tsx`; petróleo não escreve nada e fica o global.css). Preferências novas em `lib/appearance.ts` (paleta, cores próprias, menu, fundo, cantos, brilho, tema pelo horário); a antiga "Cor principal" vira a paleta inicial.
- Visual e animações em `frontend/src/styles/vivo.css` (vv-* e cc-* novas). Fundo em `components/shell/LiveBackdrop.tsx`; WhatsApp na barra em `components/shell/WhatsAppPill.tsx` (anota a faixa "WhatsApp hoje", `lib/whatsappUptime.ts`).
- Painel: `components/dashboard/command/*` (SystemsBlock, HealthCore, FlowChart com lupa e zoom, LiveTicker, AlertsBlock). Outras telas: estorno que encolhe (`hooks/useEstornoLeaving.ts`), holofote das listas (`hooks/useRowSpotlight.ts`), coletor, etiqueta saindo (`components/labels/PrintOut.tsx`), confete (`lib/confetti.ts`), ✓ desenhado (`components/ui/DrawnCheck.tsx`).
- Testes: `lib/palettes.test.ts` (inclui contraste >= 4,5:1 de todas as paletas) e `lib/whatsappUptime.test.ts`.

### 2026-10-29 — Claude Code — 2.7.24: celular lê a etiqueta certa e tem modos
- Branch: `claude/project-thread-uaek4n` (sobre a 2.7.23). Pedido do dono: a foto da caixa lia o código errado (EM7559, "1", "BR") e o celular era confuso.
- A página do celular (`backend/app/api/routers/scanner_page.py`) acha cada faixa de código de barras da foto e lê todas; `POST /api/scanner/ler` escolhe a peça pelo cadastro e pelos padrões Garrett/BorgWarner/Holset (`app/services/label_reader_service.py`).
- Modos Inventário (`/api/scanner/inventario/...`, `InventoryService.count_one`), Contagem e NF-e; −1/+1 e quantidade digitada; a aba Inventário se atualiza pelo evento `chronos:inventario-celular` (`lib/useScanner.ts`).
- Testes em `backend/tests/test_scanner_etiqueta.py`.

### 2026-10-29 — Claude Code — 2.7.23: progresso do inventário
- Branch: `claude/project-thread-0s9gwk`. Pedido do dono: sessão aparecia "100% contado" porque o modo bip zera tudo e "0 de 0" contava como conferido.
- `inventory_counts.contado` (criada e preenchida em `core/database/connection.py`); `PUT /inventario/sessoes/{id}/itens` aceita `contado` (padrão true).
- Resumo e sessão mandam `to_count_items`; "Não contados" = saldo no sistema e não contado; "Conferidos OK" só os contados.
- Coluna Motivo em `components/inventory/InventoryCountsTable.tsx` com largura fixa.

### 2026-10-29 — Claude Code — 2.7.22: proteção de dados, bandeja e telas simples
- Branch: `claude/project-thread-4hyxjk`. Pedido do dono depois da avaliação do sistema inteiro.
- Pegar a base avisa o que só existe neste PC (`app/services/official_base_local_changes.py`).
- Bandeja, abrir com o Windows, religar o backend e porta livre (`frontend/src-tauri/src/main.rs`).
- Bancos do assistente no backup (`app/services/backup_assistant_files.py`); gatilho contra saldo negativo.
- Celular pareado e com saldo (`backend/app/api/routers/scanner.py`).
- Backup e Configurações simplificados (`components/ui/SimpleScreen.tsx`, `styles/telas-simples.css`); aviso de atualização em `components/shell/UpdateDialog.tsx`.

### 2026-10-28 — Claude Code — Release mais rápido (testes em paralelo)
- Branch: `claude/project-thread-1tkomm`. Pedido: o release ainda demora (2.7.11: 12 min, testes do
  backend 3 min 39 s com 347 testes).
- `pytest-xdist` (`-n auto`) no release e no CI: 54 s → 19 s no Linux, sem mudar nenhum teste.
- `release.yml` em 4 jobs: `backend-tests` (Windows), `frontend-tests` (lint + vitest, Ubuntu) e
  `build` rodam juntos; `build` guarda os arquivos como artefato e `publish` só cria a GitHub
  Release se os três passarem. O instalador não muda.
- Aviso "eslint@9 deprecated": só aviso; ESLint 10 fica para outro momento.

### 2026-10-28 — Claude — Aviso de remessa SC x RS no WhatsApp (2.7.15)
- Branch `claude/project-thread-37xwog`. Nota entre matriz e filial com natureza de remessa/transferência
  (ou CFOP x152/x949) vira `remessa_interna`: cada item tem Estoque, Serviço, Casco ou Garantia (lembrado
  por código em `nfe_item_tipos_aviso`). Casco e garantia não movimentam.
- Mensagem montada na tela (`frontend/src/lib/remessaAviso.ts`, com testes) e enviada por
  `POST /nfe/aviso/enviar` (robô do WhatsApp deste PC, `NeonizeTransport.send_text`). Contatos em
  `nfe_config.json` (`contatos_aviso`), editados em NF > Configurar.

### 2026-10-28 — Claude — Painel novo: Centro de comando (2.7.9)
- Branch `claude/project-thread-ytbzeq`. O dono escolheu, entre 5 modelos, o "Centro de comando" com o
  gráfico de entradas e saídas do modelo "Fluxo" embaixo (modelos em `/mnt/project-files/dashboard/modelos/`).
- `frontend/src/components/dashboard/command/` substitui `dashboard/bento/`. Contas puras em
  `frontend/src/lib/commandCenter.ts` (com testes). Coluna Sistemas usa rotas que já existiam:
  `/health`, `/assistente/painel`, `/backup/base-oficial/status`, `/nfe/config`, `/backup/listar`.
- Saiu do Painel: escolha de semana/mês e data, "Mais saídas" e o bloco do assistente (virou linhas
  em Sistemas). Com movimento "Nenhum" nada se mexe.

### 2026-10-26 — Codex — Integração da IA com a main 2.7.4 e preparação da 2.7.5
- Branch `codex/ia-estoque-garrett`. Trabalho de IA registrado em `5683696`; main 2.7.4
  integrada em `ef326ac`, preservando telas, cadastro da empresa, PIN e restrições do WhatsApp.
- Versão atualizada pelo `npm run release:bump -- 2.7.5`; changelog com notas concretas da IA.
- A entrega anterior abaixo é histórica: seu MSI 2.5.5 não representa esta versão.
- Roteiro atualizado: `scripts/testar_ia_2_7_5.ps1`, somente após recompilar o executável.
- Próximo passo: validação completa, commit/push e PR para a main, sem merge do PR nem tag.
- NF-e particular e script local de certificado não fazem parte do trabalho de IA e ficaram fora dos commits.

### 2026-10-26 — Codex — IA e atendimentos, preparação local da 2.5.5
- Branch `codex/ia-estoque-garrett`, preservando o trabalho do Claude, sem commit/push/tag.
- Pedidos estruturados, alternativas abreviadas, condições/filial por item e evidência dos
  saldos. Limites explícitos, sem descartar o quarto item; erro de consulta não vira saldo zero.
- Atendimentos e rascunhos em armazenamento separado, com conta/perfil/cliente, perguntas após
  envio aprovado, texto editado como contexto real e encerramento/expiração sem apagar histórico.
- Reconsulta antes do envio impede aprovação de saldo antigo. Falha mantém o rascunho; áudio
  com falha bloqueia resposta parcial. Novos códigos não herdam motor/ano de conversa anterior.
- Aba de exemplos aprovados e sincronização de dados com hash, mantendo permissões existentes.
- Versões 2.5.5 consistentes, novas regressões e roteiro reproduzível na cópia em
  `scripts/test_assistant_release.py`. Na cópia: 5005 responde 01; 3628 produtos, saldo 383,
  728 movimentos preservados, integridade OK/FK 0. Homologação com WhatsApp real permanece pendente.
- Concluído: 291 testes na bateria geral, 35 regressões atuais da IA e 31 testes de frontend;
  Ruff/versões/build/autodiagnóstico aprovados, lint com 0 erros/5 avisos anteriores.
- MSI local gerado em `frontend/src-tauri/target/release/bundle/msi/Chronos Inventory_2.5.5_x64_en-US.msi`.
  Verificados 16 módulos do backend empacotado contra o código atual. Spec reescrito pelo
  PyInstaller restaurado, sem alterações de máquina no patch. Não houve instalação/publicação.
- Extraído o backend de dentro do MSI com WiX/dark (sem instalar): os 16 módulos correspondem
  ao fonte e o SHA-256 é idêntico ao backend verificado pelo autodiagnóstico.
- Homologação segura atualizada para a 2.7.5: `scripts/testar_ia_2_7_5.ps1`; orientação em `docs/TESTE_ASSISTENTE.md`.

### 2026-10-23 — Codex — Precisão do saldo Garrett no assistente
- Branch: `codex/ia-estoque-garrett`, descendente da `feature/assistente-ia`.
- Reproduzido na cópia de 21/10: `796155-5005` respondia 02, somando o saldo 1 da peça
  com o saldo 1 da `796155-5011`. A família Garrett compartilhava o prefixo de seis dígitos.
- Removido o prefixo da equivalência, preservando a busca por prefixo e a separação nova/reman/montada.
- Versionada a assinatura de vínculos para atualizar códigos e vínculos automáticos antigos;
  vínculos manuais, produtos, estoque e movimentações são preservados.
- Arquivos: `core/catalog/normalization.py`, `core/catalog/bundle.py`,
  `backend/tests/test_assistant_stock_accuracy.py`.
- Na cópia, a consulta corrigida retorna 01; integridade OK e sem violações de chaves estrangeiras.
- Verificações: 254 testes passaram, incluindo 11 regressões novas; Ruff e versões consistentes.
  Build do frontend concluído; lint sem erros (5 avisos em arquivos não alterados).
- Pendente: validar no app atualizado. Sem publicação, commit ou alteração do banco original.

<!-- Mais recente no topo. Uma entrada por tarefa concluída. -->

### 2026-10-26 — Claude Code — 2.7.4, Vidro suave nas telas que faltavam e tabela de Produtos
- Branch: `claude/project-thread-oq7mai` (a partir da `main` 481d293, 2.7.2).
- Produtos (`ProductsListTable.tsx`): colunas Foto | Código (`.pm-code-cell`) | Produto | filiais | Total | Saídas 90 dias | ações. `useStockTotals` saiu para `hooks/useStockTotals.ts` (também nos Relatórios).
- CSS novo `styles/vidro-telas.css` (classes `vt-*`): `ProgressRing` (`components/ui`), herói da sessão do Inventário, selos de diferença, miniatura da folha (`ReportPaperPreview`) e faixa do relatório ativo. Animações só fora do nível "Nenhum".
- Etiquetas: as abas viraram `SegmentedControl`; lista com código em destaque e `StockNumber` no total.
- Correções: `sessionLocalLabel` (`lib/inventoryView.ts`) usa `local` do backend (antes "Local #null"); botão `light` no Grafite escuro (global.css).
- Microinterações (mesmo PR): `styles/microinteracoes.css` (classes `mi-*`), `ProgressButton`, `CopyCode`, `SortableList`, `ApiStatusDot`, `SpotlightPreview` (prévia do Ctrl+K), `MovementsMinimap`, `notifyUndo`, `themeReveal` (View Transitions), `rowExit`, `cursorGlow`. Tudo gated por `data-motion`.
- Fotos: `/mnt/project-files/visual/2.7.4/` (animações em `animacoes/`, com o clipe `animacoes-2.7.4.mp4`).
- Verificações: pytest ok / build ok / lint ok (só avisos antigos) / vitest ok.

### 2026-10-19 — Claude Code — 2.6.3, NF-e, Assistente e leitura de código (Vidro suave)
- Branch: `claude/nf-assistente` (a partir da `main` 0ac4bd4, 2.6.0; versão, CHANGELOG e regras
  do backend sem mudar). Arquivos compartilhados (`global.css`, `theme.ts`, `AppLayout.tsx`) intactos:
  os estilos novos ficam em `components/scanner/scanner.css` e `components/assistant/assistantChat.css`.
- **Lançar nota fiscal** (`NfeMovementModal.tsx`): etapas ler a chave → conferir itens → confirmar,
  com indicador (`NfeStepper.tsx`, lógica em `lib/nfeSteps.ts`) e um bloco por etapa (o da etapa
  atual com a borda da cor principal). Itens entram um a um; "Hoje → Fica" numa coluna, com o
  "Fica" rolando até o valor (`AnimatedNumber`/NumberFlow). Produto escolhido num seletor novo
  (`NfeProductPicker.tsx`, Combobox com a busca dentro da lista) que quebra o nome em duas linhas;
  a coluna do produto é a mais larga (janela de 1040 px). Natureza, local externo, motivo do ajuste,
  observação e "Ignorar (casco)" continuam iguais (o item ignorado fica riscado, não apagado).
  Cabeçalho da janela opaco (o título se sobrepunha ao conteúdo rolando).
- **Assistente** (`AssistantPage.tsx`, `AssistantAnswer.tsx`, `ThinkingIndicator.tsx`, lógica em
  `lib/assistantAnswer.ts`): balões (pergunta à direita na cor principal; resposta num cartão à
  esquerda), cada código de peça como etiqueta com borda (Garrett com hífen e códigos só de números;
  não pega GT4594, anos ou quantidades), linhas da resposta, botões e cartões de produto entrando em
  sequência (150 ms cada, `components/ui/Reveal.tsx` + `lib/reveal.ts`), três pontos "Pensando…".
  Igual/Similar/Diferente, Pesquisar na internet, Configurações e Copiar resposta mantidos. O mock
  (`VITE_ASSISTENTE_MOCK=1`) ganhou o caso "A é igual a B?" com os botões de ensinar.
- **Leitura de código**: na Movimentação em lote, o item lido ganha uma moldura verde que pulsa e a
  lista rola até ele; chave "Bipe ao ler" (desligada por padrão, lembrada na máquina,
  `lib/scanFeedback.ts`); anúncio para leitor de tela. Página do celular
  (`backend/app/api/routers/scanner.py`, só HTML/CSS/JS da página) no visual escuro, botão "Bipe"
  (desligado por padrão, lembrado no celular) e moldura verde no último lido.
- Animações: Completo = desloca e pulsa; Suave = só esmaece; Nenhum = nada (a moldura fica parada
  1,6 s). Contraste conferido (>= 4,5:1) no claro e no escuro, nas três cores principais.
- Verificações: build, lint (0 erros), vitest 58 (18 novos em `lib/nfAssistenteScan.test.ts`),
  pytest 262, ruff. Telas em `/mnt/project-files/visual/2.6.3/` (banco de teste + mock).

### 2026-10-19 — Claude Code — 2.6.2: Produtos, ficha, Movimentar e Movimentações
- Branch: `claude/produtos-movimentacoes` (a partir da `main` 2.6.0; versão, CHANGELOG e Python
  sem mudar). Só telas.
- Produtos: código da peça como rótulo da linha (`lib/productView.ts`, `splitProductCode`), marca
  e versão em texto com um ponto de cor, saldo grande (verde/âmbar com dica "Estoque baixo"/
  vermelho), "Movimentar" sempre visível e o resto no menu "⋯"; coluna de filial sem saldo some
  (se só uma tem saldo, a coluna vira "Saldo · Canoas"); filtros em chips (Todos, Com estoque,
  Zerados). Busca ao vivo: linhas deslizam/esmaecem (FLIP, `hooks/useFlipList.ts` + `lib/flip.ts`,
  sem o pacote de layout do motion; a virtualização continua).
- Ficha: foto grande, código e ações no topo; zero da filial em cinza, vermelho só no total
  zerado; gráfico com um rótulo por mês; últimas 5 movimentações logo abaixo; "foto que viaja"
  da linha até a ficha (`lib/sharedFlight.ts`, mede e anima, como o `NavIndicator`).
- Movimentar: o saldo da linha pisca verde/laranja e rola até o valor novo (NumberFlow).
- Movimentações: linha do tempo compacta (uma linha por movimento), selo "Cadastro" no lugar da
  observação padrão, estornada riscada (e sem botão de estornar de novo), movimento novo entra
  no topo, ações visíveis. Corrigido: o estorno não atualizava as listas (chaves erradas).
- Níveis de animação: Completo tudo; Suave só esmaecer (sem voo, sem rolar); Nenhum nada.
- Capturas: `/mnt/project-files/visual/2.6.2/`. Verificações: build ok / lint 0 erros (5 avisos
  antigos) / vitest 59 ok.

### 2026-10-19 — Claude Code — 2.6.1, Painel em blocos ("bento")
- Branch: `claude/painel-bento` (a partir da `main` 0ac4bd4, 2.6.0; versão, CHANGELOG e constantes
  sem mudar). Só o Painel, os blocos dele, Relatórios > Análises e duas rotas novas.
- Painel (`pages/DashboardPage.tsx`, `components/dashboard/bento/`): cabe em ~1,5 tela (1520 px a
  1440 de largura, antes ~2.400). Topo com 4 números que rolam e linha dos 30 dias que se desenha
  (unidades, saídas em 30 dias com ritmo de 7 dias, produtos com estoque, zerados); filtro de
  filial, semana/mês e data mantidos. Blocos: "Pede ação hoje" (o maior: zerados que venderam,
  perto de zerar e parados que mais ocupam numa lista só, com etiqueta Zerado/Repor/Parado; clicar
  abre a ficha do produto pela mesma rota `?openId=` da busca), Saúde do estoque (medidor circular),
  Assistente e WhatsApp (perguntas de hoje, respostas e códigos para revisar, robô com ponto que
  pulsa; some se a rota não existir), Movimento da semana/mês (barras que crescem; saldo num
  gráfico pequeno separado, sem eixo duplo), Mais saídas (barras enchem em sequência) e Atividade ao
  vivo (últimas movimentações a cada 20 s; a nova desce do topo). Sem Recharts no Painel.
- Animações respeitam os níveis: Completo cresce/desenha/desliza, Suave só esmaece, Nenhum aparece
  pronto (`lib/dashboardMotion.ts` + testes). Contraste conferido no claro e no escuro (todos os
  textos do Painel >= 4,5:1). Funciona de 1100 px para cima sem rolagem lateral.
- Saíram do Painel para Relatórios > Análises (`components/reports/ReportsAnalysisSection.tsx`,
  `AnalysisPanels.tsx`): distribuição por filial, dias com mais movimento, para onde foram as saídas,
  marca e versão, transferências externas. Os cartões por filial do topo foram tirados.
- Backend: `GET /analytics/stock/count-history` (produtos com saldo e zerados por dia) e
  `GET /assistente/painel` (só contagens, sem login); testes em `backend/tests/test_dashboard_bento.py`.
- Capturas: `/mnt/project-files/visual/2.6.1/`.
- Verificações: pytest 264 ok / ruff ok / versões ok / build ok / lint 0 erros (5 avisos antigos) /
  vitest 52 ok.

### 2026-10-18 — Claude Code — 2.6.0, passo "base nova" (estilo Vidro suave)
- Branch: `claude/vidro-suave-base` (a partir da `claude/project-thread-vw3djm`, 2.5.5; versão,
  CHANGELOG e Python sem mudar). Só a base do app; o redesenho de cada tela vem depois.
- Tema (`theme/theme.ts`, `styles/global.css`): azul-petróleo #0E7490 (escala `petrol`, padrão de
  "Cor principal") com degradê até o céu #38BDF8, Sora embutida (`@fontsource/sora`), fundo #EEF3F6
  com três manchas que se movem (14 s), vidro (rgba branco .62 + blur 18px saturate 1.4, raio 16)
  em Card/Paper/Modal/Drawer/Menu/Popover/barra do topo pelo CSS global, tema escuro equivalente,
  números tabulares. Contraste de texto conferido (>= 4,5:1 sobre fundo, vidro e manchas).
- Movimento: `framer-motion` -> `motion` 12.43 (`motion/react`, `LazyMotion` + `domAnimation`),
  troca de tela com esmaecer e deslizar (~250 ms), pílula da aba ativa deslizando
  (`components/shell/NavIndicator.tsx`), cartões entram com desfoque em sequência, cartão de número
  sobe no mouse, ponto de status pulsando, números dos cartões com `@number-flow/react`.
- Configurações > Aparência > Animações: Completo, Suave, Nenhum (`chronos.appearance.motion`;
  `lib/motion.ts` + testes). Nenhum também tira o desfoque. "Efeitos de animação" desligado no
  Windows faz o Completo virar Suave.
- Mantine 9.6.3 em commit separado (só `Grid gutter`->`gap` e `Collapse in`->`expanded`).
- Capturas antes/depois: `/mnt/project-files/visual/2.6.0/`.
- Verificações: build ok / lint ok (5 avisos antigos) / vitest 40 ok.

### 2026-10-18 — Claude Code — Versão 2.5.5 (correções da avaliação completa)
- Branch: `claude/project-thread-vw3djm`, juntando `claude/frontend-correcoes-a11y-copy` e
  `claude/seguranca-backend`. Tela do PIN do WhatsApp (`components/assistant/WhatsAppPinButton.tsx`,
  `POST /assistente/admin/pin-whatsapp`). O saldo do gráfico do Painel usa `estoque_inicial`, que
  saiu das entradas. Versão 2.5.5 e CHANGELOG.
- Verificações: pytest 262 ok / ruff ok / build ok / lint ok (5 avisos antigos) / vitest 32 ok.

### 2026-10-18 — Claude Code — Correções de telas (acessibilidade, cores, textos, dependências)
- Branch: `claude/frontend-correcoes-a11y-copy` (sobre a `main` 65d638d, versão 2.5.4 sem mudar).
- Contraste (texto ≥ 4,5:1 nos dois temas; âmbar/verde escuros no claro via `cssVariablesResolver`),
  badges 11/12px, linhas clicáveis pelo teclado (`lib/clickableRow.ts`), cores só do tema
  (`danger/info/success/warning`; laranja só "Saída"), acentos e termos técnicos nos textos
  (`OUTDATED_APP_MESSAGE` e `ASSISTANT_UNREACHABLE_MESSAGE` em `lib/notify.ts`), Node 22 no CI,
  dependências na última minor, reqwest 0.12.
- Verificações: build ok / lint ok (5 avisos antigos) / vitest 31 ok / cargo check ok.
- Ficou de fora: D3/D5/D7, tela do PIN do WhatsApp, `@tauri-apps/*` (andam junto com os crates).

### 2026-10-15 — Claude Code — Disco e backups (2.5.3)
- Branch: `claude/project-thread-2j0v1i`. Verificação no PC da empresa: 23 pastas `_MEI*` no TEMP
  (1,1 GB, do backend onefile até a 2.3.x; não são apagadas pelo app porque outros programas
  PyInstaller usam o mesmo nome), 12 backups pre-update e 13 `.bak` de migração nunca apagados,
  backup automático só em 28/09 e 05/10 (só rodava com o app aberto às 18h), banco e backups só no SSD.
- Cópias de segurança (`backup_pre_*`) e `.bak` de migração: ficam as 3 últimas (ao criar e ao abrir
  o app, em `BackupService.housekeeping`). Backup automático em atraso sai ao abrir (`_last_scheduled_time`).
  Segunda pasta: `app/services/backup_second_copy.py`, `GET/PUT /backup/segunda-pasta`, config em
  `backup_segunda_pasta.json` (por máquina, fora do banco). Log do Tauri em `<app>/logs/tauri.log`,
  1 MB + `.1`; apaga os antigos em `%LOCALAPPDATA%\ChronosInventory` e TEMP.
- Versão 2.5.3 e CHANGELOG.

### 2026-10-15 — Claude Code — NF-e recém-emitida dizia "sem autorização" (2.5.1)
- Branch: `claude/project-thread-dcq6wk`. NF 14566, emitida na hora: a conferência dizia "O XML não
  tem a autorização da SEFAZ". `find_nfe_by_chave` ficava com o primeiro XML da chave, mesmo sem o
  protocolo, quando havia mais de um (assinado e procNFe). Agora prefere o autorizado e, se o achado
  pelo nome não tem protocolo, procura nos outros arquivos. O aviso mostra o arquivo lido.
- Versão 2.5.1 e CHANGELOG.

### 2026-10-15 — Claude Code — Release mais rápido (cache)
- Branch: `claude/project-thread-1tkomm`. Pedido: "o release build and publish demora uns 15 min".
- Medido na 2.4.5 (14 min 24 s): compilar o Rust do zero 6 min 13 s, testes 2 min, PyInstaller
  1,5 min, pip 1 min, WiX 1 min.
- `release.yml` lê o cache do Rust (`Swatinem/rust-cache`, chave `tauri-release`) e do pip.
  Tags não enxergam cache de outras tags, então quem grava é o job `warm-release-cache` do
  `ci.yml` a cada push na main (`tauri build --no-bundle` com backend falso; não gera
  instalador). Nos PRs o mesmo job só confere que o Rust compila. O instalador não muda.
- Conferir no log do próximo release se "Compiling tauri v2" sumiu.

### 2026-10-15 — Claude Code — Novo visual (2.5.0)
- Branch: `claude/project-thread-8wdsu2`. Pedido: "temos o melhor layout?"; o dono escolheu as 11
  ideias do mockup.
- Cores fixas por significado (`frontend/src/lib/semantic.ts`) e cor do app/modo compacto em
  Configurações > Aparência (`lib/appearance.ts`, `data-accent`/`data-density` no `<html>`).
- Dashboard: KPIs com sparkline e % contra os 30 dias anteriores, movimento + saldo, saídas por
  natureza, estoque por marca × versão, saúde do estoque, calendário de 12 semanas
  (`components/dashboard/DashboardInsights.tsx`, `lib/dashboardMath.ts`).
- Produtos: miniatura, saldo colorido, vendas 90 dias; ficha com foto e gráfico de saldo de 6 meses.
- Movimentações agrupadas por dia (`MovementsDayList.tsx`), tabela no botão "Tabela".
- Assistente: cartão do produto e "Copiar resposta". Atalhos com "?" (`ShortcutsModal.tsx`).
- Rotas novas: `/analytics/stock/items`, `/analytics/movements/by-nature`,
  `/analytics/products/{id}/stock-history`, `/produtos/resumo-visual`. A evolução do estoque não
  fica mais negativa (corte em 0).
- Verificações: pytest ok, vitest ok, build ok, lint sem erros, `check_versions` ok.
### 2026-10-15 — Claude Code — Ícone novo (caracol em C)
- Branch: `claude/project-thread-wunxnv`. Pedido: o ícone antigo (relógio com caixa) não tinha
  personalidade. Guilherme escolheu a opção A entre quatro: a carcaça do turbo em forma de C,
  rotor âmbar, fundo índigo.
- `frontend/src-tauri/icons/icon.ico` (16 a 256 px; 16, 20 e 24 px usam o desenho simplificado)
  e `icon.png` (512 px, já citado no `tauri.conf.json` mas faltava no git). Fontes em
  `frontend/src-tauri/icons/source/`.
- O topo do app usa o ícone no lugar da ampulheta (`src/assets/chronos-icon.svg`) e a aba do
  navegador usa `public/favicon.svg` no lugar do `vite.svg`. Sem mudança de versão: vai junto
  da próxima.

### 2026-10-15 — Claude Code — Ignorar item da NF-e que não é estoque (2.4.4)
- Branch: `claude/project-thread-dcq6wk`. Pedido: a NF 14564 (remessa para conserto) tinha o item
  CASCO (cód. 294), só embalagem de transporte, e a baixa não fechava.
- Cada item da conferência tem "Ignorar (não é estoque)": não movimenta e fica lembrado por
  CNPJ do emitente + código (`nfe_itens_ignorados`); escolher produto para ele desfaz.
- Versão 2.4.4 e CHANGELOG.

### 2026-10-14 — Claude Code — Natureza e observação na baixa por NF-e (2.4.3)
- Branch: `claude/project-thread-dcq6wk`. Pedido: a NF da matriz (e de outras filiais) é
  transferência externa, não entrada de fábrica; a conferência da nota precisa deixar escolher a
  natureza e a observação.
- A tela traz Natureza (operação normal, transferência externa ou ajuste), Local externo, Motivo do
  ajuste e Observação, já sugeridos: outra parte com a mesma raiz de CNPJ da loja vem como
  transferência externa (`_suggested_movement` em `app/services/nfe_service.py`).
- Nota com todas as movimentações estornadas fica livre para lançar de novo (`_active_baixa`).
- Versão 2.4.3 e CHANGELOG. Verificações: `pytest`, `npm run build`, `npm run lint`.

### 2026-10-14 — Claude Code — Baixa por NF-e bipando o DANFE
- Branch: `claude/project-thread-dcq6wk` (PR para `main`, separado do PR #11).
- Pedido: bipar com o celular o código de barras da NF de saída e o Chronos dar baixa nos itens.
- O código de barras do DANFE é só a chave (44 dígitos). O app procura o XML dessa chave nas
  pastas do Questor (`C:\nQuestorEmp\NFe\Geradas` e `...\Distribuicao`, editáveis em
  "Pastas dos XMLs"), mostra os itens ligados aos produtos (pelo código de peça da descrição,
  ou pelo que já foi usado antes para o mesmo código do emissor) e lança tudo de uma vez com o
  documento "NF <número>". Nota cancelada, sem autorização ou já baixada é recusada.
- Onde: `core/nfe_xml.py`, `app/services/nfe_service.py`, `backend/app/api/routers/nfe.py`,
  `frontend/src/components/scanner/NfeMovementModal.tsx` (aberto de qualquer tela pelo
  `NfeScanHost` no layout; botão "Baixa por NF-e" em Movimentações).
- Entrada de NF de fornecedor: com o certificado A1 da empresa (Baixa por NF-e > Configurar), a
  nota que não está nas pastas tem o XML baixado da SEFAZ pela chave (`core/nfe_sefaz.py`, só
  consulta). Testado pelo dono com o certificado real em 2026-10-14 (NF 74883 veio completa).
- Celular: pelo IP (http) o navegador bloqueia a câmera ao vivo; a página lê o código de uma foto.
- Verificações: `pytest` (206 ok), `npm run build`, `npm run lint` sem erros, `vitest` ok; tela
  conferida no navegador (bipe pelo celular abre a nota, baixa, segunda leitura avisa "já baixada").

### 2026-10-13 — Claude Code — Fotos de produto não somem ao "Atualizar base"
- Branch: `claude/project-thread-itvf2t` (PR para `main`, junto da 2.4.1).
- Causa: as fotos ficam dentro do banco (`product_images`). "Atualizar base" (base oficial)
  troca o banco inteiro pelo publicado, então fotos colocadas só numa máquina sumiam.
  A atualização do app (.msi) não mexe no banco.
- O que foi feito: ao aplicar a base oficial, as fotos do banco anterior voltam para os produtos
  que ficaram sem foto (`app/services/product_photo_recovery.py`). Novo botão "Recuperar só as
  fotos" em Backup > Restaurar backup (`POST /backup/recuperar-fotos`): traz as fotos de um backup
  sem restaurar o resto.
- Verificações: `pytest` (195 ok), `npm run build`, `npm run lint` sem erros.

### 2026-10-13 — Claude Code — Teste no banco real e versão 2.4.0
- Branch: `claude/project-thread-bwu9lo` (PR para `feature/assistente-ia`).
- O que foi feito, a partir do teste do dono numa cópia do banco da empresa: "A é igual a B?"
  (`comparar_codigos`), "Para revisar" só com sugestões que têm motivo e "Não serve" mantendo o
  código, movimentações (`movimentacoes_produto`), código Master Power (`codigo_master_power`),
  "é código OEM/Mahle/... da ficha X: temos", busca por veículo respondendo só o motor ou o ano
  (filtro de ano pelo texto do catálogo, "D13" = "MD13"), "essa/dessa" usando a turbina da última
  resposta, e a versão 2.4.0 com o CHANGELOG.
- Arquivos principais: `app/services/assistant_*.py`, `core/database/repositories/assistant_repository.py`,
  `backend/app/api/routers/assistant.py`, `frontend/src/components/assistant/AdminReviewTab.tsx`,
  `CHANGELOG.md`, `frontend/scripts/bump_version.ps1`.
- Verificações: versões, pytest, Ruff, build, lint e Vitest; respostas conferidas na cópia do banco.

### 2026-10-10 — Claude Code — Backend empacotado em pasta, sem UPX
- Branch: `claude/project-thread-caz59j` (PR para `feature/assistente-ia`).
- O que foi feito: o `build_backend.ps1` passou de `--onefile` para `--onedir` com
  `--contents-directory estoque_backend_lib` e `--noupx`. O exe não se descompacta mais no TEMP a
  cada abertura e o antivírus tem menos motivo para barrar. A pasta `estoque_backend_lib` vai para
  `frontend/src-tauri/bin/` e o Tauri a instala ao lado do exe (`bundle.resources`).
- Arquivos principais: `build_backend.ps1`, `frontend/src-tauri/tauri.conf.json`,
  `frontend/scripts/verify_sidecar.ps1`, `.gitignore`.
- Verificações: no Linux, um build PyInstaller 6.19 com as mesmas opções acha o pacote do catálogo
  via `_MEIPASS` com o exe copiado (e renomeado com o target) para outra pasta junto da
  `estoque_backend_lib`. Falta o teste no Windows: `npm run build:app`, instalar o MSI e abrir.
- Pendências ou observações para o outro agente: quem roda `tauri dev` precisa rodar o
  `build_backend.ps1` de novo, porque o `tauri.conf.json` agora exige a pasta `bin/estoque_backend_lib`.

### 2026-10-10 — Claude Code — Tudo numa branch só e Antigravity pausado
- Branch: `feature/assistente-ia` (merge da `ag/operacao-e-atalhos` até `67bd3e2`, sem conflito).
- Revisados os commits `d62f457`, `f7fc92a` e `67bd3e2` do Antigravity: corretos.
- Verificações no resultado do merge: versões (2.3.0), 185 testes, build e lint (0 erros).
  No app (cópia do banco de teste): "Salvar configuração" em Backup > Base oficial salva
  (`PUT` 200, `server_token: null` mantém a senha) e não aparece mais "dehydrated as pending".
- O dono vai trabalhar só com o Claude: contexto para começar em `docs/CONTEXTO.md`; `CLAUDE.md`
  e `docs/ASSISTENTE_IA.md` atualizados.

### 2026-10-10 — Claude — Dashboard: um local só e "Perto de zerar"
- Branch: `claude/project-thread-9wgnwi` (sobre a branch do PR #4)
- O que foi feito:
  - Com um único local ativo, a dashboard esconde o seletor de filiais, a "Distribuição por filial"
    e os cards por filial (fica "Em estoque" + "Itens sem estoque").
  - Novo painel **"Perto de zerar"**: itens com saldo que zeram em até 15 dias no ritmo de venda
    real dos últimos 30 dias (rota `GET /analytics/products/stockout-risk`). Com um local, ocupa o
    lugar da distribuição; com mais de um, fica em largura total abaixo dos gráficos.
- Validação: pytest, ruff, `npm run build`, `npm run lint` e `npm test`; tela conferida no navegador
  com um e com dois locais.

### 2026-10-10 — Antigravity — Correções pré-release: salvamento da base oficial e desidratação segura do cache
- Branch: `ag/operacao-e-atalhos`
- O que foi feito:
  - **Correção no salvamento da base oficial (`OfficialBaseSection.tsx` e `useBackupOfficialBasePanel.ts`)**:
    - Ajustado o botão "Salvar configuração" para `onClick={() => onSaveConfig()}`, impedindo que o evento de clique do React seja repassado como argumento e tratado como `tokenOverride`.
    - Adicionada blindagem adicional em `saveOfficialBaseConfig` validando estritamente `typeof tokenOverride === "string"` ou `null`, prevenindo erro de serialização circular ("Converting circular structure to JSON").
    - Testado no app: o clique em "Salvar configuração" em Backup > Base oficial salva com sucesso exibindo a notificação "Configuracao da base oficial salva." sem nenhum erro.
  - **Desidratação segura de queries no cache (`app/providers.tsx`)**:
    - Atualizado `shouldDehydrateQuery` para usar `defaultShouldDehydrateQuery(query) && !String(query.queryKey[0]).startsWith("assistant-admin")`.
    - Evita que queries em estado pendente sejam desidratadas para o IndexedDB e rejeitadas na recuperação.
- Validação: `npm run build` e `npm run lint` executados com sucesso (0 erros). Testado no navegador com confirmação visual.

### 2026-10-10 — Antigravity — Correções da revisão do commit 0f60808: movimentação rápida, atalho N e status de conhecimento
- Branch: `ag/operacao-e-atalhos`
- O que foi feito:
  - **Movimentação rápida com AJUSTE e TRANSFERÊNCIA EXTERNA (`QuickMovementModal.tsx`)**:
    - Adicionados campos dinâmicos no modal: `motivo_ajuste` (`PRODUCT_ADJUSTMENT_REASON_OPTIONS`) exibido quando natureza é `AJUSTE`, e `local_externo` quando natureza é `TRANSFERENCIA_EXTERNA`.
    - Validação antes da submissão: `motivo_ajuste` e `observacao` obrigatórios no `AJUSTE`, e `local_externo` obrigatório na `TRANSFERENCIA_EXTERNA`.
    - Envio dos campos no payload de criação da movimentação (`MovementCreate`).
    - Refatoração com separação do formulário interno (`QuickMovementForm`) com chave no modal para garantir inicialização limpa de estado sem uso inadequado de efeitos.
  - **Atalho N sem produto alvo (`ProductsPage.tsx`)**:
    - Removido o fallback para o primeiro produto da lista (`rows[0]`). Pressionar `N` sem produto sob o mouse, selecionado ou aberto no drawer agora não executa nenhuma ação indevida.
  - **Indicador de sincronização do conhecimento (`SyncStatusBadge.tsx` e `types/assistantAdmin.ts`)**:
    - Atualizados textos e tooltips de "Base Oficial: ..." para "Conhecimento do assistente".
    - Adicionado suporte ao campo `configurado` de `GET /assistente/conhecimento/sincronizacao`:
      - `configurado === false` → indicador neutro cinza "Não configurado";
      - `configurado === true && erro` → indicador de aviso laranja "Sync pendente";
      - `!verificado_em` → indicador cinza "Ainda não sincronizou";
      - caso contrário → indicador ativo com brilho ("Publicadora" azul ou "Sincronizado" verde-azulado).
  - **Conferência de código no catálogo de peças relacionadas (`ProductCatalogTab.tsx`)**:
    - Na função `RelatedPieceCard`, implementada conferência `matchesPieceCode` para assegurar que o produto retornado pela busca contém exatamente o código da peça antes de exibir o selo de estoque e link.
- Validação: `npm run build` e `npm run lint` executados com sucesso (0 erros).

### 2026-10-10 — Antigravity — Senha do servidor, exclusão/inativação de produto, foto da plaqueta no chat e resumo diário na aba WhatsApp
- Branch: `ag/assistente-chat`
- O que foi feito:
  - **Senha do servidor e proteção de dados (Backup > Base oficial)**:
    - Atualizados tipos `OfficialBaseStatusOut` (`server_token_set`) e `OfficialBaseConfigIn` (`server_token`).
    - Adicionado campo protegido `PasswordInput` para "Senha do servidor (a mesma em todas as máquinas)" na seção de configuração (disponível tanto para publicadora quanto consumidora), sem nunca preencher a senha salva em texto claro.
    - Exibição de indicador visual e status dot "Senha configurada" quando `server_token_set: true`.
    - Botões dedicados "Salvar senha" (validação mínima de 6 caracteres) e "Remover senha" (`server_token: ""`).
    - Alerta de advertência em destaque no painel do servidor quando este estiver em execução sem senha configurada: *"Sem senha: qualquer aparelho do Wi-Fi pode baixar o estoque"*.
  - **Exclusão de produto e inativação no lugar (Produtos)**:
    - Adicionado aviso preventivo no modal de confirmação de exclusão: *"Produtos com movimentações não podem ser excluídos; inative para tirar da lista"*.
    - Ao tentar excluir um produto que possui histórico de movimentações (erro 400 com mensagem *"inative o produto"*), é aberto modal que oferece a ação imediata de **"Inativar produto"** chamando `api.bulkUpdateProductStatus` (`ativo: false`), permitindo inativar na hora sem perda de histórico e sem desorientar o operador.
  - **Foto da plaqueta no chat do app (Assistente)**:
    - Implementada rota `POST /assistente/chat/foto` multipart em `sendAssistantPhotoMessage` (`frontend/src/lib/assistantApi.ts`), enviando imagem (`foto`), mensagem opcional e histórico de mensagens em JSON.
    - Adicionado botão de câmera (`FileButton` com `IconCamera` aceitando `image/*`) ao lado da caixa de mensagem no chat do app (`AssistantPage.tsx`).
    - Miniatura de pré-visualização da foto com botão de cancelamento/remoção antes do envio.
    - Miniatura da foto renderizada no balão de mensagem do usuário.
    - Exibição discreta da identificação da peça (`leitura_foto`, ex.: *"Foto da plaqueta: 466646-5041S"*) logo acima da resposta do assistente.
    - Indicador de carregamento adaptativo *"Lendo a foto…"* durante a análise da imagem.
    - Tratamento de erro 422 (`foto_ilegivel`) exibindo a mensagem explicativa retornada pelo backend.
  - **Resumo diário e comando WhatsApp (Admin)**:
    - Integradas rotas `GET /assistente/resumo` e `PUT /assistente/resumo` com `X-Admin-Token` em `frontend/src/lib/assistantAdminApi.ts`.
    - Adicionado card "Resumo diário" na aba WhatsApp do Admin com interruptor *"Mandar todo dia na 'Mensagem para mim'"*, campo de horário com validação (`HH:MM`), exibição do horário de último envio e botão *"Ver o resumo de hoje"* que abre modal renderizando o texto com formatação WhatsApp (`*negrito*`, `•`).
    - Inclusão do comando `/resumo` e instrução de reação com robô em fotos de plaqueta (*"Foto da plaqueta: reaja com 🤖 na foto"*) no quadro informativo "Como usar o Modo Copiloto".
  - **Validação**: `npm run build` e `npm run lint` executados com sucesso (0 erros).

### 2026-10-10 — Antigravity — Operação ágil: atalho N de movimentação, integração Assistente ➔ Produtos, Spotlight ao vivo, SyncStatusBadge e equivalências
- Branch: `ag/operacao-e-atalhos`
- O que foi feito:
  - **Atalho de movimentação rápida (tecla N)**:
    - Criação de `QuickMovementModal.tsx` com seleção dinâmica de operação (Baixa/Saída [Alt+S], Entrada [Alt+E], Transferência [Alt+T]), exibição de saldos por filial, pré-seleção inteligente da filial com maior estoque, foco automático imediato na quantidade e confirmação ágil com Enter.
    - Rastreamento de hover do mouse (`onMouseEnter`/`onMouseLeave`) e foco na tabela de produtos (`ProductsListTable.tsx`), permitindo passar o mouse sobre qualquer produto (ex.: 4031195) e pressionar `N` para abrir a baixa/entrada na hora, além de botão dedicado de ação rápida na linha.
  - **Integração Assistente ➔ Produtos**:
    - Ajustado o clique no card de produto do chat (`AssistantPage.tsx`) para navegar com `search` e `openId`, abrindo diretamente o Drawer lateral de detalhes (`ProductDetailsDrawer`) com o produto selecionado e seu estoque por filial.
  - **Spotlight Global (`Ctrl+K` / `Ctrl+P` / `/`) enriquecido**:
    - Busca em tempo real de produtos no `GlobalSpotlight.tsx` com debounce, exibindo código `#ID`, marca, condição, saldo total e saldo por filial com badges visuais diretamente na lista do Spotlight, permitindo abrir o produto com um clique ou Enter.
  - **Indicador de Sincronização & Conexão no Header (`SyncStatusBadge.tsx`)**:
    - Componente no TopBar informando status da Base Oficial e conhecimento (Publicadora / Cliente sincronizado / Sync pendente), com Popover contendo detalhes da fonte, total de regras aprendidas, data do último sync e botão "Sincronizar agora".
  - **Visualizador de Equivalências Turbina ⇄ Conjunto Central (`ProductCatalogTab.tsx`)**:
    - Componente `RelatedPieceCard` verificando disponibilidade de estoque em tempo real para cada peça relacionada (conjunto central ou turbo compatível), exibindo badge de saldo e botão para abrir a peça relacionada diretamente no catálogo.
- Arquivos principais:
  - `frontend/src/components/products/QuickMovementModal.tsx`
  - `frontend/src/components/products/ProductsListTable.tsx`
  - `frontend/src/pages/ProductsPage.tsx`
  - `frontend/src/pages/AssistantPage.tsx`
  - `frontend/src/components/common/GlobalSpotlight.tsx`
  - `frontend/src/components/shell/SyncStatusBadge.tsx`
  - `frontend/src/components/shell/TopBar.tsx`
  - `frontend/src/components/products/ProductCatalogTab.tsx`
- Verificações: `npm run build` ok (`7.42s`) / `npx eslint` ok sem erros nos arquivos da tarefa.
- Pendências ou observações para o outro agente: nenhuma pendência. Funcionalidades integradas e prontas.

### 2026-10-10 — Claude Code — Assistente: foto da plaqueta, resumo diário, ajustes e instalador
- Branch: `feature/assistente-ia`
- O que foi feito:
  - **Foto da plaqueta** (WhatsApp com 🤖 na foto e `POST /assistente/chat/foto` no app): o Groq lê
    os códigos com um modelo com visão (`qwen/qwen3.8-27b`, gratuito), sem número de série.
  - **Resumo diário** na "Mensagem para mim" (zerados desde ontem, mais saídas em 7 dias,
    perguntaram e não temos), na hora que o admin escolher, e `/resumo` na hora.
  - **Ajustes da busca direta:** código falado com espaços ("5327 988 7101") e número de chassi
    (não é código de peça; com veículo junto, vale o veículo).
  - **Instalador:** `estoque_backend.exe --diagnostico-assistente` testa o pacote por dentro
    (DLLs e uma pergunta de verdade num banco temporário); o `build_backend.ps1` falha se algo faltar.
- Verificações: pytest ok (185 testes); avaliação sem IA 17/17; build real do backend + diagnóstico ok.
- Para o Antigravity: pedidos na seção 5 (botão de foto no chat, resumo diário na aba WhatsApp,
  senha do servidor e exclusão de produto).

### 2026-10-10 — Claude Code — Proteção de dados (auditoria P1 #2 e #5)
- Branch: `claude/protecao-dados` (a partir da `main`, pode ir para a `main` sozinha), já trazida
  para a `feature/assistente-ia`.
- O que foi feito: excluir produto não apaga mais o histórico (só exclui cadastro sem nada além
  do estoque inicial; senão pede para inativar). Senha do servidor local (porta 8765) para a base
  oficial, a comparação de estoque e o conhecimento do assistente; sem senha configurada continua
  aberto como antes.
- Arquivos principais: `core/database/repositories/product_repository.py`,
  `app/services/local_share_service.py`, `official_base_config_store.py`,
  `backend/app/schemas/backup.py`; testes em `test_api.py`, `test_local_share_token.py` e
  `test_assistant_knowledge_sync.py`.
- Verificações: pytest ok (93 na `claude/protecao-dados`, 167 na `feature/assistente-ia`).
- Para o Antigravity: pedido na seção 5 (campo da senha e exclusão de produto).

### 2026-10-10 — Claude Code — Branch única para testar na empresa e resumo do assistente
- Branch: `feature/assistente-ia` (enviada ao GitHub, junto com `ag/assistente-chat`).
- O que foi feito: a pedido do dono, que vai testar no banco real da empresa sem levar nada para
  a `main`, a `ag/assistente-chat` foi trazida para a `feature/assistente-ia` (merge sem
  conflitos; telas idênticas às da `ag`). Agora a `feature/assistente-ia` tem backend e telas.
  O Antigravity continua na `ag/assistente-chat`, trazendo a `feature/assistente-ia` como antes.
  Novo `docs/ASSISTENTE_IA.md` (estado, decisões, arquivos, o que fica fora do git, teste no
  banco real) e `CLAUDE.md` na raiz apontando para ele e para este HANDOFF.
- Também: regra do conhecimento com dois códigos num campo ("A OU B") agora é recusada.
- Verificações: pytest ok (162 testes), `check_versions` ok, nenhum segredo nem banco no que subiu.

### 2026-10-10 — Antigravity — Assistente: correção de digitação nos formulários do admin (urgente)
- Branch: `ag/assistente-chat`
- O que foi feito:
  - Correção do acesso assíncrono ao SyntheticEvent do React (`e.currentTarget.value`) dentro de callbacks funcionais do `setState` (`(prev) => ({ ...prev, campo: ... })`), que causava `TypeError: Cannot read properties of null (reading 'value')` e quebrava o app/perdia o login em memória ao digitar:
    - `AdminReviewTab.tsx`: captura de `const value = e.currentTarget.value` antes do `setState` no campo de ressalva do modal "É similar" (linha 571), no código equivalente do modal "Ensinar relação" (linha 608) e no campo de observação livre (linha 635).
    - `AdminHistoryTab.tsx`: captura de `const value = e.currentTarget.value` antes do `setState` no campo de resposta correta do especialista (linha 382) e no campo de observação interna (linha 398) do modal "Corrigir resposta".
  - Testado e validado interativamente nos modais de revisão e correção sem nenhum erro ou crash de renderização.
- Arquivos principais:
  - `frontend/src/components/assistant/AdminReviewTab.tsx`
  - `frontend/src/components/assistant/AdminHistoryTab.tsx`
- Verificações: `npm run build` ok (`7.35s`) / `npx eslint` ok sem erros.
- Pendências ou observações para o outro agente: nenhuma pendência. Modais funcionando com digitação fluida.

### 2026-10-10 — Antigravity — Assistente: telas legíveis no tema escuro (urgente)
- Branch: `ag/assistente-chat`
- O que foi feito:
  - Substituição de fundos claros fixos (`gray-0`, `teal-0`, `blue-0`, `green-0`, `bg="white"`, `c="black"`) por tokens e variáveis dinâmicos do Mantine 7 que acompanham automaticamente os temas claro e escuro:
    - `AssistantAdminPanel.tsx`: barra superior do admin trocada para `bg="var(--mantine-color-default-hover)"`.
    - `AdminReviewTab.tsx`: cartões de propostas do WhatsApp atualizados para `bg="var(--mantine-color-teal-light)"` com borda `var(--mantine-color-teal-light-border)` e cartões de sugestões de códigos para `bg="var(--mantine-color-default-hover)"`.
    - `AdminKnowledgeTab.tsx`: cartão de legenda de relações atualizado para `bg="var(--mantine-color-blue-light)"`, borda `var(--mantine-color-blue-light-border)` e texto `c="var(--mantine-color-blue-light-color)"`; cartão de status de sincronização para `bg="var(--mantine-color-default-hover)"`.
    - `AdminHistoryTab.tsx`: balão de resposta enviada trocado para `bg="var(--mantine-color-default-hover)"`; cartão de resposta correta do especialista atualizado para `bg="var(--mantine-color-green-light)"`, borda `var(--mantine-color-green-light-border)` e título `c="var(--mantine-color-green-light-color)"`.
    - `AdminWhatsAppTab.tsx`: Paper de conexão pareada atualizado para `bg="var(--mantine-color-green-light)"` com texto e borda adaptáveis; quadro "Como usar" trocado para `bg="var(--mantine-color-default-hover)"`; no painel de QR code, fundo branco isolado estritamente ao redor do `QRCodeSVG` com `p="xs"` e bordas arredondadas (garantindo leitura por celular sem clarear o Paper de carregamento).
    - `AssistantPage.tsx`: balão de mensagem do assistente trocado para `bg="var(--mantine-color-default-hover)"` e remoção do `c="black"` estático (herda a cor do tema).
    - `settings/AssistantSettingsPanel.tsx`: cartão de chave da API do assistente atualizado para `bg="var(--mantine-color-default-hover)"`.
- Arquivos principais:
  - `frontend/src/pages/AssistantPage.tsx`
  - `frontend/src/components/assistant/AssistantAdminPanel.tsx`
  - `frontend/src/components/assistant/AdminReviewTab.tsx`
  - `frontend/src/components/assistant/AdminKnowledgeTab.tsx`
  - `frontend/src/components/assistant/AdminWhatsAppTab.tsx`
  - `frontend/src/components/assistant/AdminHistoryTab.tsx`
  - `frontend/src/components/settings/AssistantSettingsPanel.tsx`
- Verificações: `npm run build` ok (`9.67s`) / `npx eslint` ok sem erros nos arquivos alterados.
- Pendências ou observações para o outro agente: nenhuma pendência. Todas as telas do assistente e do admin plenamente legíveis e integradas no tema escuro e claro.

### 2026-10-10 — Claude Code — Tela travada pedindo reinício no teste
- Branch: `feature/assistente-ia`
- O que foi feito: com `CHRONOS_APP_DIR` (banco de teste do roteiro), `GET /sistema/estoques`
  devolvia `restart_required = true` para sempre (comparava com o banco do estoque "Principal") e
  o app ficava travado com "Reinicie o sistema". Agora, com o banco fixado pela variável, não pede
  reinício. Arquivo: `app/services/stock_profile_service.py`; teste em `test_api.py`.
- Verificações: pytest ok (162 testes).

### 2026-10-09 — Antigravity — Assistente: sincronização de conhecimento (Fase 2c), ajustes rápidos e revisão final
- Branch: `ag/assistente-chat`
- O que foi feito:
  - **Assistente: ajustes rápidos**:
    - Selo "Busca direta (sem IA)" e alerta informativo na tela de chat (`AssistantPage.tsx`) exibidos estritamente quando vier `aviso` (a IA falhou), mantendo as respostas diretas sem poluição visual.
    - Orientação de máquina publicadora em `AssistantAdminPanel.tsx` ajustada para `Backup > Base oficial > Papel desta máquina: Publica a base`.
    - Formato de códigos automotivos ajustado em mocks e componentes (`assistantAdminApi.ts`, `AdminReviewTab.tsx`, `AdminKnowledgeTab.tsx`): códigos de fabricantes como BorgWarner e Holset com dígitos puros (ex.: `53279887101`, `4031196`) e apenas Garrett com hífen (ex.: `779839-0025`, `452174-0001`, `758160-0007`).
  - **Assistente: conhecimento nas outras máquinas (Fase 2c)**:
    - Integrados endpoints `GET /assistente/conhecimento/sincronizacao` e `POST /assistente/conhecimento/sincronizar` (sem autenticação de admin) em `assistantAdminApi.ts` e tipos em `types/assistantAdmin.ts`.
    - Na aba **Conhecimento** (`AdminKnowledgeTab.tsx`), adicionada linha de status de sincronização:
      - Publicadora: "Publicado para as outras máquinas (<fonte>) em <atualizado_em> — <total_regras> regras".
      - Demais máquinas: "Recebido da máquina <maquina> (<fonte>) em <atualizado_em> — <total_regras> regras".
      - Alerta visual caso venha `erro` retornado pelo backend (orienta configuração em Backup > Base oficial).
      - Botão **"Sincronizar agora"** chamando `POST /assistente/conhecimento/sincronizar`, atualizando a linha de status e recarregando a lista de regras de conhecimento.
      - Datas formatadas em pt-BR a partir de ISO (`toLocaleString("pt-BR")`).
  - **WhatsApp do assistente e propostas na área do admin**:
    - Aba "WhatsApp" (`AdminWhatsAppTab.tsx`) com QR code em tempo real via `qrcode.react`, estados em português ("Desligado", "Conectando…", "Escaneie o QR code", "Conectado ao número X", "Desconectado do celular — conecte de novo", "Erro: …"), botões Iniciar, Parar e Desconectar com confirmação, além de quadro de instruções do copiloto e aviso fixo.
    - Propostas enviadas pelo WhatsApp (`/ensinar`) exibidas no topo de "Para revisar" (`AdminReviewTab.tsx`) com ações de "Aprovar" (`POST /assistente/propostas/{id}/aprovar`) e "Recusar" (`POST /assistente/propostas/{id}/recusar`).
- Arquivos principais:
  - `frontend/src/types/assistantAdmin.ts`
  - `frontend/src/lib/assistantAdminApi.ts`
  - `frontend/src/components/assistant/AdminKnowledgeTab.tsx`
  - `frontend/src/components/assistant/AdminWhatsAppTab.tsx`
  - `frontend/src/components/assistant/AdminReviewTab.tsx`
  - `frontend/src/components/assistant/AssistantAdminPanel.tsx`
  - `frontend/src/pages/AssistantPage.tsx`
- Verificações: `npm run build` ok (`6.61s`) / `npx eslint` ok sem erros nem warnings nos arquivos alterados.
- Pendências ou observações para o outro agente: nenhuma pendência. Todas as entregas solicitadas concluídas.

### 2026-10-09 — Claude Code — Assistente: conhecimento nas outras máquinas (Fase 2c)
- Branch: `feature/assistente-ia`
- O que foi feito: a máquina publicadora publica as regras do especialista num JSON pequeno
  (`conhecimento_assistente.json`) na pasta da base oficial (`latest/`) e no servidor local
  (rota `/knowledge`), depois de cada regra criada/excluída/aprovada, ao abrir o backend e a cada
  10 min. As outras máquinas baixam do servidor da publicadora (endereço configurado; se falhar,
  da pasta) ao abrir o backend e a cada 10 min, conferem o arquivo (impressão digital SHA-256 e
  cada regra) e trocam as regras locais pelas publicadas; arquivo alterado ou de versão mais nova
  não muda nada e o `erro` explica. Estado em `assistente_conhecimento.json` (separado do
  `assistente_config.json`, que guarda a chave e a senha).
- Arquivos principais: `app/services/assistant_knowledge_sync_service.py`,
  `local_share_service.py` (rota `/knowledge`), `core/database/repositories/knowledge_repository.py`
  (`export_rules`, `replace_all`), `backend/app/api/routers/assistant.py`, `backend/app/main.py`,
  testes em `test_assistant_knowledge_sync.py`.
- Verificações: pytest ok (161 testes), `check_versions` ok. Testado com pasta e com o servidor
  local de verdade (porta livre); ainda não testado entre duas máquinas da empresa.
- Para o Antigravity: contrato na seção 4 ("Novo, Fase 2c") e pedido na seção 5.

### 2026-10-09 — Claude Code — Assistente: códigos no formato da empresa
- Branch: `feature/assistente-ia`
- O que foi feito: decisão do dono: código só com dígitos (53279887101); só a Garrett usa hífen
  (796155-5002). As respostas (chat e WhatsApp), o "Entendi X como Y", o que o especialista
  ensinou, o motivo das sugestões do admin e a confirmação do `/ensinar` seguem esse formato,
  mesmo quando o código vem com hífens ("532-7988-7101" na transcrição do áudio). Garrett
  digitada sem hífen aparece com hífen quando a busca reconhece pelo produto ou pelo catálogo.
- Arquivos principais: `app/services/assistant_answer_format.py` (`display_code`),
  `assistant_tools_service.py`, `assistant_knowledge_service.py`, `whatsapp_bridge_service.py`.
- Verificações: pytest ok (154 testes); avaliação sem IA 17/17.
- Para o Antigravity: item novo em "ajustes rápidos" (seção 5).

### 2026-10-09 — Claude Code — WhatsApp: primeiro teste com celular e correções
- Branch: `feature/assistente-ia`
- O que foi feito: o dono testou na "Mensagem para mim": código + áudio + 🤖 deram a resposta
  certa e o `/ajuda` funcionou, mas a resposta veio sem citar a mensagem e o 🤖 não saiu. A
  citação agora leva o autor no mesmo tipo de endereço da conversa (número ou LID) e só o
  conteúdo da mensagem citada; o 🤖 sai com a mesma chave que o WhatsApp da equipe mandou.
  O aparelho conectado passa a se chamar "Chronos" (conexões novas). O teste grava um registro
  com endereços mascarados em `whatsapp_dev.log`. Também: "Desligar" agora encerra a conexão da
  biblioteca (antes a thread dela ficava presa e o backend podia travar ao fechar), e
  `POST /whatsapp/iniciar` depois de o celular remover o aparelho abre uma conexão nova com QR
  (antes ficava preso no estado "desconectado" até reiniciar o backend). O
  `assistente_dev.py whatsapp` sai sozinho, explicando, quando o aparelho foi removido ou o QR expirou.
- Arquivos principais: `app/services/whatsapp_neonize_transport.py`, `scripts/assistente_dev.py`,
  `backend/tests/test_whatsapp_neonize_transport.py` (monta as mensagens da neonize sem conectar).
- Verificações: pytest ok (153 testes). **Confirmado no celular** (segundo teste): a resposta cita
  o áudio, o 🤖 sai, e o código falado no áudio é entendido.

### 2026-10-09 — Antigravity — WhatsApp do assistente, propostas e ajustes rápidos
- Branch: `ag/assistente-chat`
- O que foi feito:
  - **Ajustes rápidos**:
    - Selo "Busca direta (sem IA)" e alerta informativo na tela de chat (`AssistantPage.tsx`) agora só são exibidos quando vier `aviso` (a IA falhou), mantendo a resposta limpa no fluxo padrão de busca direta.
    - Correção do texto de orientação de máquina publicadora em `AssistantAdminPanel.tsx` para indicar `Backup > Base oficial > Papel desta máquina: Publica a base`.
  - **Propostas (/ensinar via WhatsApp)**:
    - Integrado no topo da aba "Para revisar" (`AdminReviewTab.tsx`): listagem das propostas pendentes enviadas pelo WhatsApp com data, código A, relação, código B, observação e autor.
    - Ações de "Aprovar" (`POST /assistente/propostas/{id}/aprovar`) e "Recusar" (`POST /assistente/propostas/{id}/recusar`).
    - Contador de propostas pendentes integrado ao badge da aba "Para revisar" em `AssistantAdminPanel.tsx`.
  - **Aba WhatsApp do assistente**:
    - Nova aba "WhatsApp" no painel do admin (`AdminWhatsAppTab.tsx`) com status dinâmico em português ("Desligado", "Conectando…", "Escaneie o QR code", "Conectado ao número X", "Desconectado do celular — conecte de novo", "Erro: …").
    - Renderização do QR code com `qrcode.react` (`QRCodeSVG`) com atualização periódica (polling a cada 2.5s) enquanto aguarda leitura.
    - Ações para iniciar (`/whatsapp/iniciar`), desligar (`/whatsapp/parar`) e desconectar o computador com confirmação (`/whatsapp/desconectar`).
    - Quadro explicativo "Como usar o Modo Copiloto" e aviso fixo sobre conexão não oficial.
  - Mock de testes em `assistantAdminApi.ts` atualizado para suportar todo o ciclo de vida do WhatsApp e propostas.
- Arquivos principais:
  - `frontend/src/pages/AssistantPage.tsx`
  - `frontend/src/components/assistant/AssistantAdminPanel.tsx`
  - `frontend/src/components/assistant/AdminReviewTab.tsx`
  - `frontend/src/components/assistant/AdminWhatsAppTab.tsx`
  - `frontend/src/lib/assistantAdminApi.ts`
  - `frontend/src/types/assistantAdmin.ts`
- Verificações: `npm run build` ok (`6.72s`) / `npx eslint` ok sem erros nos arquivos alterados.
- Pendências ou observações para o outro agente: nenhuma pendência. Tudo pronto e integrado.

### 2026-10-09 — Claude Code — Assistente: busca direta primeiro e roteiro de teste
- Branch: `feature/assistente-ia`
- O que foi feito: avaliação com o Groq real mostrou 10 de 17 acertos (o modelo gratuito trocava
  códigos e nomes ao copiar o texto pronto e montava buscas erradas). Agora a busca direta
  responde primeiro quando entende a pergunta e a IA só entra quando ela não entende; se a IA
  estragar o texto pronto, vale o texto pronto; pergunta de preço ganha a nota "Não tenho
  informação de preço" pelo próprio sistema; com o motor já informado ("dc13"), a resposta
  lista as opções sem perguntar o motor de novo. `assistente_dev.py whatsapp` abre o QR numa
  página do navegador (no terminal o QR saía deformado e o celular não lia). Roteiro de teste
  para o dono em `docs/TESTE_ASSISTENTE.md`.
- Arquivos principais: `app/services/assistant_chat_service.py`, `assistant_direct_service.py`,
  `assistant_common.py`, `assistant_answer_format.py`, `scripts/assistente_dev.py`,
  `scripts/assistente_avaliacao.py`.
- Verificações: pytest ok (148 testes); avaliação com o Groq real 17/17 (15 pela busca direta,
  2 pela IA: fora do assunto e pergunta vaga).
- Para o Antigravity: pedido "ajustes rápidos" na seção 5; contrato inalterado (seção 4).

### 2026-10-09 — Claude Code — Assistente: ponte WhatsApp (modo copiloto)
- Branch: `feature/assistente-ia`
- O que foi feito: ponte WhatsApp que entra como aparelho conectado (neonize) e só responde
  quando alguém reage com 🤖 na mensagem do cliente; junta código colado + áudio, transcreve
  pelo Whisper do Groq, responde citando a mensagem. Comandos na "Mensagem para mim":
  `/ajuda`, `/pendentes`, `/ensinar` (vira proposta para o admin aprovar). Endpoints de
  WhatsApp e de propostas; `assistente_dev.py whatsapp` para testar com QR no terminal.
- Nova dependência: `neonize==0.5.2` (traz a DLL para Windows); `--collect-all neonize` no build.
- Verificações: pytest ok (144 testes); conversão das mensagens da neonize conferida offline.
  **Ainda não testado com um celular de verdade.**
- Para o Antigravity: pedido novo na seção 5 (aba WhatsApp com QR e propostas).

### 2026-10-09 — Antigravity — Assistente: área do admin (ensinar o assistente)
- Branch: `ag/assistente-chat`
- O que foi feito:
  - Adicionada aba "Admin (Especialista)" na tela do Assistente (`AssistantPage.tsx`), com controle de permissão e sessão:
    - Verificação de máquina publicadora (`GET /assistente/admin/status`). Se `maquina_publicadora = false`, exibe alerta orientando sobre Configurações > Base oficial e expõe a base de conhecimento apenas em modo leitura.
    - Criação de senha de admin inicial (`POST /admin/senha`) quando `senha_definida = false`.
    - Login do admin (`POST /admin/login`) com token guardado estritamente em memória (`useAdminSession`). Ao receber `403 admin_necessario`, a sessão local é limpa e um aviso explicativo é exibido. Opção de logout (`POST /admin/logout`) e troca de senha de admin (`POST /admin/senha`).
    - Exclusão do prefixo `assistant-admin` na persistência do IndexedDB no `AppProviders` para máxima segurança/privacidade.
  - Criadas 3 abas internas no admin:
    - **Para revisar** (`AdminReviewTab.tsx`): cartões por código pesquisado sem estoque, contagem de buscas, data formatada, exemplo de pergunta e tags de conhecimento prévio. Ações rápidas nas sugestões ("É igual", "É similar" com modal de ressalva, "Não serve"), ação livre "Ensinar outro código" e "Nada a fazer" (`POST /revisao/{codigo}/concluir`).
    - **Conhecimento** (`AdminKnowledgeTab.tsx`): legenda clara de relações, busca instantânea por código, listagem tabular completa, modal para cadastrar nova regra e exclusão com diálogo de confirmação.
    - **Histórico** (`AdminHistoryTab.tsx`): lista de conversas (App e WhatsApp), renderização do texto no padrão WhatsApp (`*negrito*`), códigos pesquisados sem estoque, modo/aviso, formulário para "Corrigir resposta" do especialista (gabarito) e botão "Exportar JSONL" fazendo download de `assistente_historico.jsonl`.
  - Mocks atualizados em `assistantAdminApi.ts` simulando toda a suíte de endpoints do admin com estado em memória.
- Arquivos principais:
  - `frontend/src/components/assistant/AssistantAdminPanel.tsx`
  - `frontend/src/components/assistant/AdminReviewTab.tsx`
  - `frontend/src/components/assistant/AdminKnowledgeTab.tsx`
  - `frontend/src/components/assistant/AdminHistoryTab.tsx`
  - `frontend/src/pages/AssistantPage.tsx`
  - `frontend/src/lib/assistantAdminApi.ts`
  - `frontend/src/lib/assistantFormat.tsx`
  - `frontend/src/state/assistantAdminSession.ts`
  - `frontend/src/types/assistantAdmin.ts`
  - `frontend/src/app/providers.tsx`
- Verificações: `npm run build` ok / `npm run lint` ok sem erros nos arquivos da funcionalidade.
- Pendências ou observações para o outro agente: nenhuma pendência. Tudo pronto e integrado.

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

### 2026-10-19 — Claude Code — 2.6.2, correção da publicação
- A tag v2.6.1 falhou no `build_backend.ps1`: o autodiagnóstico do executável (`app/services/assistant_packaging_check.py`) usava o Host padrão `testserver` do TestClient, que a trava de Host da 2.5.5 recusa fora de `APP_ENV=test`. Agora usa `base_url="http://127.0.0.1"`. Teste novo em `backend/tests/test_packaging_check.py` roda o autodiagnóstico sem `APP_ENV`.
- A v2.6.1 nunca foi publicada; a 2.6.2 leva tudo (2.5.5, 2.6.0 e 2.6.1). Não recriar a tag v2.6.1.

### 2026-10-21 — Claude Code — 2.7.0, cadastro da empresa (CSV da loja)
- Branch: `claude/project-thread-7n35k7`.
- O que foi feito: Backup > Catálogo > "Cadastro da empresa" importa o `produtos_completos.csv` do sistema da loja. Prévia antes de gravar; depois cadastra os produtos que faltam (saldo zero, observação "material N") e guarda as aplicações e similares de turbos e conjuntos que o catálogo Master Power não tem na tabela `cadastro_fichas`, copiada para `catalogo_*` com a fonte `CADASTRO` ("Cadastro da empresa"), como as fichas próprias.
- Arquivos principais: `core/catalog/company_register.py` (leitura do texto livre, fichas, cópia para o catálogo, casamento com produtos), `app/services/company_register_service.py`, rotas em `backend/app/api/routers/catalog.py`, tela `frontend/src/components/backup/CompanyRegisterSection.tsx`.
- Verificações: pytest ok (269) / ruff ok / build ok / lint ok / vitest ok.
- 2026-10-22: o id do produto passa a seguir o CD_MATERIAL (o cadastro do Chronos veio desse sistema: #866 = material 866). `plan_ids`/`apply_ids` em `company_register.py`: mesmo id → nome do arquivo (se o código bate, ou se o produto nunca teve saldo nem movimentação); mesmo nome (ou mesmo código, tipo e versão) num id que o arquivo não usa ou usa para outra peça → muda para o id do arquivo em todas as tabelas (`PRAGMA defer_foreign_keys`); novos com o id do arquivo; o resto vai para "Para conferir". Nome antigo anotado na observação e códigos dele em `produto_codigos` (origem `NOME_ANTIGO`).
- Observações: nova, reman e montada só casam com a mesma versão (senão viram produto novo). Não sincroniza pelo conhecimento do assistente: as outras máquinas recebem com "Aplicar base oficial". O pacote do catálogo ignora a fonte CADASTRO ao decidir se o catálogo é local.

### 2026-10-22 — Claude Code — 2.7.1, etiqueta da NF depois da baixa
- `GET /nfe/{chave}/xml` (`NfeService.xml`) devolve o XML da nota; `NfeMovementModal` fica aberto depois de uma saída e oferece "Imprimir etiqueta" (`printNfeShippingLabels` em `components/labels/nfeDesignerUtils.ts`, com o layout salvo no localStorage). Nota já baixada de saída também mostra o botão.
- Modelo `halfSheetShippingLabelLayout` (190 x 135 mm) em `lib/labelsPrint.ts`; tokens novos `endereco`, `cep`, `cidadeUf`, `remetente`, `remetenteLocal`; blocos com `frame` (moldura) e `inverted` (fundo preto). O layout anterior fica em `chronos.nfe.designer_layout.anterior`.
- Correção: o HTML de impressão tinha quebra de linha e recuo dentro de cada bloco com `white-space: pre-wrap`, e o texto saía uma linha abaixo do desenho. Peso agora com vírgula e " kg".

### 2026-10-26 — Claude Code — 2.7.2, nota com produto desativado, CNPJs salvos e perfis de etiqueta
- Branch: `claude/project-thread-dcq6wk` (a partir da `main` 53bd21e, 2.7.1).
- NF-e (`app/services/nfe_service.py`): a sugestão de produto procura também os desativados (`ativo` em cada candidato; com a mesma pontuação o ativo vem antes). `cProd` só com dígitos que é o id de um produto com o mesmo nome (`_same_name`, ignora espaços e traços) ganha +10: nas notas da empresa o código é o CD_MATERIAL. A baixa continua recusando produto inativo (MovementService); a tela reativa com `PUT /produtos/status-lote`.
- Tela da nota: "Reativar" no item desativado, "Cadastrar novo" em cada item (`NfeNewProductModal.tsx`, `POST /produtos` com saldo 0), busca com `listProductsStatus(status: TODOS)`.
- CNPJs: `nfe_config.json` ganha `cnpjs` `[{cnpj, nome}]`; o primeiro vira `cnpj_loja`. `_download` tenta cada CNPJ salvo menos o emitente (próximo em 137/593/640/641; para em XML, resumo ou outro erro). `_store_cnpj` escolhe o CNPJ desta loja se ele estiver na nota, senão o salvo que está nela (destinatário, depois emitente) para o tipo e a natureza sugeridos; o preview traz `loja`.
- Etiquetas: perfis em `components/labels/nfeLabelProfiles.ts` (localStorage `chronos.nfe.etiqueta_perfis.v1`, ativo em `chronos.nfe.etiqueta_perfil_ativo`). Primeira vez: "Perfil 1" com o layout de hoje e "Crua (sem marca)" (`rawShippingLabelLayout`: meia folha sem logo e remetente). O perfil ativo é salvo a cada mudança; importar layout cria perfil novo. A janela da nota escolhe o perfil antes de imprimir.
- Verificações: pytest ok / ruff ok / build ok / lint ok (só avisos antigos) / vitest ok.

### 2026-10-26 — Claude Code — 2.7.3, estornos fora da lista de Movimentações
- Branch: `claude/project-thread-mswsxd` (a partir da `main` 481d293, 2.7.2).
- `GET /movimentacoes?ocultar_estornados=true` (`MovementRepository._OCULTAR_ESTORNADOS`): esconde a movimentação que tem um estorno apontando para ela (`movimento_ref_id`) e o estorno em si. Só a lista; `/produtos/{id}/historico`, saldo e relatórios não mudam. Com o filtro `natureza=ESTORNO` o parâmetro é ignorado.
- Tela: chave "Mostrar estornados" na barra de filtros de Movimentações (desligada por padrão, guardada no estado da aba). O aviso do estorno conta que os dois saem da lista.
- Teste: `backend/tests/test_movements_estornados.py`.

### 2026-10-28 — Claude Code — 2.7.10 (feito como 2.7.8), turbo montado faturado pelo conjunto central
- Branch: `claude/project-thread-xr0e9i` (a partir da `main` 98c5528, 2.7.6; a 2.7.7 é o PR #39).
- Caso: a empresa fatura a montada pelo conjunto central. A entrada vai no conjunto e o turbo fica vinculado a ele (`produtos.produto_vinculado_id`, filho → pai). O dono decidiu: todo o saldo do conjunto conta como montada do turbo.
- `ProductRepository._attach_inventories` junta `produto_vinculado_inventories` (saldo do pai, só para mostrar); a API devolve também `produto_vinculado_estoque`. `total_stock`, filtros e relatórios não mudam: o saldo é só do conjunto.
- Telas: `assembledViaCore` (`lib/productView.ts`) só vale para turbo → conjunto (nome com CONJ/CENTRAL/MIOLO). Lista: "N montada" ao lado do saldo e "Faturada como #id". Ficha: `AssembledViaCorePanel` ("Tem montada" no turbo, "Montado como" no conjunto). Cartão do assistente mostra "Temos montada" e "Abrir conjunto".
- Assistente: `_product_summary` põe `montada_no_conjunto`; `available_stock` (answer_format) usa esse saldo quando o turbo está zerado. Só para o próprio código; o conjunto que já aparece como montada sai da lista e da busca por aplicação (não conta duas vezes).
- Testes: `test_assembled_turbo_*` em `backend/tests/test_assistant_tools.py`; `assembledViaCore` em `productView.test.ts`.

### 2026-10-28 — Claude Code — 2.7.11, aba Produtos em colunas
- Branch: `claude/project-thread-b83yb7`, em cima da `claude/project-thread-xr0e9i` (2.7.8, PR #41). A 2.7.9 é o PR #40 (Painel).
- Modelo escolhido pelo dono no protótipo `/mnt/project-files/produtos/colunas/`: pesquisar um código abre colunas Turbina nova / reman / montada / Conjunto central / Similares; coluna vazia some; se sobra só uma, ela ocupa a largura toda.
- Backend: `GET /produtos/colunas?codigo=` (`app/services/product_columns_service.py`) reaproveita `AssistantToolsService.search_by_code` (mesmas peças que o assistente acha) e separa por `categoria`/`condicao`/`correspondencia`. A montada é o conjunto (saldo dele, sem contar duas vezes), com `turbo_id`/`turbo_nome`. Vínculos feitos na tela que a busca não traz entram como "Vinculado".
- Telas: `ProductColumnsBoard` (+ `lib/productColumns.ts`, `styles/product-columns.css`). `ProductsPage` usa as colunas quando a busca parece um código (`looksLikeCode`), com o seletor Colunas/Lista. Clicar num cartão abre a ficha na própria coluna; as outras viram faixas. Animações por CSS, desligadas em "Nenhum".
- Testes: `backend/tests/test_product_columns.py`, `frontend/src/lib/productColumns.test.ts`.
- O #42 foi mesclado na branch do #41 depois que o #41 já tinha entrado na main, e a tag v2.7.10 saiu só com a montada. As colunas entram na main por um PR novo, como 2.7.11.

### 2026-10-28 — Claude Code — 2.7.13, código inteiro das peças
- Branch: `claude/project-thread-iwypfq`, a partir da main (2.7.11). Era 2.7.12; virou 2.7.13 porque o #45 (conserto das colunas) ficou com a 2.7.12.
- `findProductCode` (`frontend/src/lib/productView.ts`) achava só a parte numérica: 157.070000422 virava 070000422, e ACR-01679 virava 01679. Agora estende o trecho até o próximo espaço ou parêntese, sem ponto ou traço solto nas pontas. Isso vale para a lista, a ficha, as colunas, as movimentações e as etiquetas (`deriveLabelCode`).
- Simulado no `produtos_completos.csv`: as 329 peças do checklist (`/mnt/project-files/produtos/codigos-cortados/`) saem com o código inteiro. Só a exibição muda; banco e busca ficam iguais.

### 2026-10-28 — Claude Code — 2.7.14, correção da busca em colunas (era 2.7.12; o #44 entrou antes como 2.7.13)
- Na 2.7.11, código sem resultado derrubava o app inteiro: `ok()` devolve o dicionário direto (sem os padrões do schema), `codigos_possiveis` não vinha e a tela lia `.length`. O serviço agora manda todos os campos sempre; a tela tolera a falta deles; `ColumnsErrorBoundary` troca as colunas por um aviso com "Ver em lista" em vez de derrubar o programa.
- Teste: `test_empty_answer_still_has_every_field`.

### 2026-10-29 — Claude Code — 2.7.16, código falado por extenso no assistente
- Branch: `claude/project-thread-2b8t5e`, a partir da main (2.7.15).
- "tem a cinco quatro cinco cinco meia zero nove?" respondia "o catálogo só tem turbinas de marcas com que não trabalhamos": nenhum código com algarismos, então virava busca por veículo; e o código que a IA lia era descartado por `supported_codes`. Agora `spoken_digits_to_numbers` (`app/services/assistant_spoken_numbers.py`: dígito a dígito, números compostos, letras e veículo/motor falados) troca a sequência falada por algarismos na mensagem e no histórico do usuário (app e WhatsApp).
- Testes: `test_code_spoken_in_words_becomes_digits`, `test_spoken_digits_to_numbers`.

### 2026-10-29 — Claude Code — 2.7.17, perguntas do dia (modo entrevista da IA)

- `app/services/assistant_interview_service.py`: a IA escolhe 5 dúvidas por dia (Para revisar, mesma ficha Master Power, nome do produto que junta dois códigos, aplicação do catálogo), as peças com estoque e saída primeiro, e guarda em `entrevista` no `assistente_historico.db`.
- Respostas pelo fluxo de ensino que já existia (`AssistantTeachService`, `mark_reviewed`, "Não se aplica"); "não sei" volta em 30 dias.
- Tela: Assistente > Admin > "Perguntas do dia" (`AdminInterviewTab.tsx`). WhatsApp: `/perguntas`, `/r`, `/confirmar <PIN>`, envio diário só no PC que publica a base.
- Testes: `backend/tests/test_assistant_interview.py`.

### 2026-10-29 — Claude Code — 2.7.18, observações do cadastro da empresa viram vínculos
- Branch: `claude/project-thread-3slo65`, a partir da main (2.7.15). 2.7.16 (#48) e 2.7.17 (#49) estão em PR; esta é a 2.7.18.
- `core/catalog/company_register.py`: `parse_details(linhas, kind)` separa as observações por tipo (`_RELATION_MARKS`): PAR (faz par), CONJUNTO (conjunto do turbo), TURBO (turbo do conjunto, inclusive "MESMO CODIGOS BORG" num conjunto), SUBSTITUI, TROCAR_POR, IGUAL (igual, mesmo, código antigo, reman) e SIMILAR (com a ressalva entre parênteses). Código na linha de baixo e lista de códigos que continua na linha seguinte são tratados. Par, conjunto e substituto saem dos códigos da ficha e das aplicações; a anotação fica na observação da ficha. Marca pelo jeito do número (`_CODE_MAKERS`).
- `build_relations(items)`: todas as peças (com ou sem ficha Master Power, inclusive embreagem/válvula) -> tabela `cadastro_relacoes` (migration_v2_4_0_knowledge). Na planilha real: 2.752 relações (1.759 similar, 552 conjunto, 358 turbo, 54 igual, 11 par, 18 substitui/trocar). Aplicações que eram anotação: de 599 para 157 (o resto é a descrição do próprio conjunto).
- Busca (`AssistantToolsService._register_relations`): lê dos dois lados (`REVERSE_RELATION`). Igual/similar entram como equivalente com `obs_cadastro`; o resto vai em `relacoes_cadastro` e no texto (`register_lines`). Par escrito errado de um lado (846016 -> 883860-5013) cai quando há outro par com o mesmo começo que temos.
- Aba Produtos: coluna `par` ("Par do biturbo", sem botão de vincular); conjunto e substituto do cadastro nas colunas de conjunto e similares.
- Precisa reimportar o produtos_completos.csv na máquina que publica a base e depois "Publicar base".
- Testes: `test_reads_pair_core_replacement_and_old_code`, `test_search_shows_the_biturbo_pair_and_the_core`.

### 2026-10-29 — Claude Code — 2.7.19, fotos em lote
- Branch: `claude/project-thread-0jhj1z`, a partir da main (2.7.18).
- `app/services/photo_batch_service.py`: o nome do arquivo é o código (`178045.jpg`, `178045_2.jpg`, `178045 (3).jpg`, `178045-4.jpg`; sufixo de até 2 dígitos, para não cortar `856457-009`). Vai para todo produto cujo nome cita o código exato (`codes_cited_in_name`, sem nova/reman), com busca de reserva pelo número grudado no modelo (`S200G-12709880050`). Código em mais de 5 produtos fica de fora (kit). Não duplica (sha1 da foto já normalizada), respeita o limite de 5 e não troca a principal que o produto já tinha.
- Rotas `POST /produtos/fotos-lote/previa` e `POST /produtos/fotos-lote`. Tela: Importar > "Fotos em lote" (`PhotoBatchImport.tsx`): pasta inteira ou arrastar, prévia (arquivo -> produto, sem produto), envio uma a uma com barra de progresso.
- Testes: `backend/tests/test_photo_batch.py`.

### 2026-10-29 — Claude Code — 2.7.21, foto sem código não derruba o texto no WhatsApp
- Branch: `claude/project-thread-4zlxci`, a partir da main (2.7.19; 2.7.20 está no PR #52).
- `WhatsAppBridge._answer_locked`: falha ao ler uma foto do grupo (mensagens do mesmo contato em até 3 min) não descarta mais os textos; responde pelo texto e avisa na "Mensagem para mim". Áudio não transcrito continua bloqueando (pode ser a própria pergunta).
- Teste: `test_unreadable_photo_does_not_drop_the_text_sent_with_it` em `backend/tests/test_whatsapp_bridge.py`.
