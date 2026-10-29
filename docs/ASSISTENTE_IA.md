# Assistente de IA do Chronos — comece por aqui

## Atualização 2.7.5 — 26/10/2026

- Branch `codex/ia-estoque-garrett`, main 2.7.4 integrada. Sem merge do PR, tag ou publicação.
  Base existente do Claude, PIN de aprovação e restrições de ferramentas no WhatsApp preservados.
- `assistant_requests.py`: lista de pedidos, evidência dos códigos no texto, alternativas por
  “ou” (incluindo sufixo abreviado), versões/filial por item e limites explícitos. Modelo + ano
  como “Scania 440 2015” não são concatenados como código. Resultado por item inclui produtos,
  IDs, saldos por filial e erros separados de ausência de estoque. Estoque de alternativa do
  catálogo não equivale a saldo confirmado do código pedido.
- `assistant_examples_service.py` e Admin > Exemplos de interpretação: exemplos são aprovados
  pelo admin publicador e sincronizados com hash. Não aprendem saldo, não retreinam o modelo
  automaticamente e não convertem correções do histórico em regras. Novos termos e exemplos
  não exigem reinstalação depois desta atualização inicial.
- `assistant_attendance_service.py`: SQLite `assistente_atendimentos.db`, ao lado do histórico
  do assistente, fora do banco de estoque/base oficial. Isolamento por perfil, conta, conversa
  e participante. Guarda histórico confirmado, perguntas pendentes e rascunhos restauráveis.
- WhatsApp: uma pergunta só vale após o envio confirmado. `/descartar` não inventa histórico;
  o texto editado determina a pendência. Falhas preservam rascunhos e o saldo é reconsultado
  antes de `/enviar`. Se mudou, gerar novo rascunho com 🤖. Áudio com falha não gera resposta
  parcial. Respostas curtas não são aplicadas a vários itens; nesse caso pergunta qual peça.
- Prazo de contexto configurável em Admin > WhatsApp (20 min por padrão). `/atendimentos` lista
  e `/encerrar <id>` encerra contexto sem apagar histórico/conhecimento. Novo código inicia
  outro atendimento; resposta citada a atendimento expirado exige confirmar a peça novamente.
- Novas rotas de admin: GET/PUT `/assistente/exemplos`, GET `/assistente/whatsapp/atendimentos`,
  POST `/assistente/whatsapp/atendimentos/{id}/encerrar`; PUT revisão aceita `contexto_minutos`.
  Chat aceita mensagem até 8000 caracteres e retorna `pedidos`/`pendencias` opcionais.
- Cópia de 21/10: saldo 01 para 5005, alternativas 5005/5006 separadas e quatro pedidos
  executados. Produtos/saldo/movimentos = 3628/383/728 antes e depois; integridade OK/FK 0.
- Verificações anteriores à integração: 291 testes na bateria completa, 35 regressões específicas, 31 testes
  de frontend, Ruff/versões/build OK. Lint sem erros, 5 avisos existentes. Autodiagnóstico do
  backend aprovado; `scripts/check_assistant_bundle.py` confere 16 módulos contra o fonte.
  MSI local 2.5.5 antigo não corresponde à 2.7.5 e não deve ser publicado como esta versão.
  Roteiro isolado em `docs/TESTE_ASSISTENTE.md` e `scripts/testar_ia_2_7_5.ps1`, após gerar o executável 2.7.5.
- Falta homologação com áudio real do chefe e envio/continuação reais no WhatsApp. Nenhuma
  garantia de 100% de acerto: transcrição, catálogo e cadastros precisam continuar sendo revisados.

---

Correção de precisão em 2026-10-23, branch `codex/ia-estoque-garrett`: reproduzido na cópia
do banco de 21/10 o saldo 02 para `796155-5005`, composto por 1 dessa peça e 1 da
`796155-5011`. A expansão de família Garrett incluía o prefixo de seis dígitos e tratava
sufixos diferentes como nova/reman da mesma peça. O prefixo foi removido da equivalência;
a busca digitada pelo prefixo continua disponível. A consulta corrigida devolve 01, mantendo
reman e montada em linhas separadas. A versão da assinatura de vínculos força a atualização
dos códigos e vínculos automáticos legados, preservando os vínculos manuais. Falta validar
a correção no app instalado. O atendimento original do WhatsApp não foi auditado pelo histórico.
Verificações: 254 testes passaram, com 11 regressões novas de precisão do saldo e equivalência
Garrett, preservação de nova/reman/montada e atualização dos vínculos legados.

Resumo de tudo o que foi feito no assistente até 2026-10-10, para retomar o trabalho em
outra máquina (por exemplo, na empresa) sem precisar explicar de novo. Para os detalhes,
veja `docs/PLANO_IA.md` (plano e decisões), `docs/TESTE_ASSISTENTE.md` (roteiro de teste),
`docs/HANDOFF.md` (coordenação entre os agentes) e `docs/API_DOCS.md` (rotas).

---

## 1. O que é

Uma distribuidora de turbinas (só **Garrett, Holset e BorgWarner**) recebe do chefe, quase
sempre pelo WhatsApp e muitas vezes em áudio, perguntas como "temos turbina 4031196?",
"temos turbina do scania 440?" ou um código colado seguido de "temos essa daí?". O assistente
responde pelo estoque do Chronos:

- na tela **Assistente** do app (conversa + área do admin);
- no **WhatsApp da empresa**, em "modo copiloto": só responde quando alguém da equipe reage
  com 🤖 na mensagem do cliente; nunca responde sozinho.

O dono do projeto (que também é o especialista) ensina ao assistente o que o catálogo não sabe
("a 53279887101 é igual à 53279887210", "serve com ressalva"...). Só ele ensina.

## 2. Estado em 2026-10-10

| Parte | Estado |
|---|---|
| Buscas por código e por veículo/motor, respostas prontas | ✅ pronto e testado |
| Chat com IA gratuita (Groq) + busca direta | ✅ testado com a chave real (avaliação 17/17) |
| Base de conhecimento do especialista, admin, histórico, "Para revisar" | ✅ pronto e testado no app |
| Conhecimento distribuído para as outras máquinas (Fase 2c) | ✅ pronto; falta testar com duas máquinas da empresa |
| Ponte WhatsApp (🤖, áudio, `/ensinar`, `/pendentes`) | ✅ testada com celular (WhatsApp comum) |
| Telas (chat, admin, WhatsApp, propostas, status do conhecimento) | ✅ prontas (feitas pelo Antigravity, hoje pausado) |
| Teste com o **banco real da empresa** | ⏳ próximo passo (seção 6) |
| Decidir WhatsApp não oficial × oficial da Meta para o número da empresa | ⏳ com o dono |
| Resumo diário na "Mensagem para mim" (`/resumo` e envio na hora escolhida) | ✅ backend e tela prontos |
| Foto da plaqueta (WhatsApp e app) | ✅ backend e botão de foto no chat prontos |
| Senha do servidor local e exclusão de produto sem apagar histórico | ✅ backend e tela prontos |
| Instalador (`.msi`) com o assistente | ✅ backend empacotado testado (autodiagnóstico no `build_backend.ps1`); falta gerar o `.msi` completo |

Tudo está na branch **`feature/assistente-ia`**, nada na `main` ainda (seção 5). A versão nova
vai ser a **2.4.0** (seção 8).

## 3. Como funciona (o essencial)

```
WhatsApp (equipe reage com 🤖)      Tela "Assistente"
        │                                 │
 Ponte WhatsApp (neonize)                 │
 junta código + áudio, transcreve         │
        └──────────► AssistantChatService ◄──┘   POST /assistente/chat
                      1º busca direta (sem IA): código, veículo/motor, "essa daí"
                      2º se ela não entendeu: IA (Groq) com as mesmas buscas
                      3º a IA falhou (limite, internet): busca direta com aviso
                             │
                      AssistantToolsService ──► SQLite (produtos, estoque, catálogo,
                      buscar_por_codigo                 vínculos, conhecimento)
                      buscar_por_aplicacao
                      detalhe_produto
```

- **"A IA entende, o sistema responde."** Cada busca já devolve a resposta montada
  (`texto_pronto`). A busca direta responde primeiro porque o modelo gratuito errava ao copiar
  códigos e montar buscas (10/17 na avaliação; com a busca direta primeiro, 17/17). Se a IA
  responder, ela só pode acrescentar ao texto pronto, nunca estragá-lo.
- **Busca por código:** aceita hífen, sufixo, OEM, versão nova/reman (BorgWarner 988↔990,
  Garrett 5xxx↔9xxx...), completa o final do código ("988-7101" → 53279887101) e usa o que o
  especialista ensinou. Tipos de regra: **igual** (troca direta, transitivo), **similar**
  (serve com ressalva) e **diferente** (nunca sugerir).
- **Busca por veículo/motor:** usa o catálogo Master Power embutido e os **vínculos
  produto ↔ ficha do catálogo** do banco. Por isso o banco real, que já tem os vínculos, deve
  responder melhor que o de teste.
- **Formato dos códigos na resposta:** só dígitos (53279887101); só a Garrett usa hífen
  (796155-5002).
- **Admin:** só a máquina **publicadora** da base oficial (Backup > Base oficial > "Papel desta
  máquina" = Publica a base) + senha. O login dura 8 h e fica só na memória do backend.
- **"A é igual a B?"** (igual, a mesma, equivalente, serve no lugar...): a busca direta usa
  `comparar_codigos` e responde a relação, sem falar de estoque: mesma peça (nova/reman), o que
  o especialista ensinou (igual/similar/diferente), "provavelmente iguais" quando o nome de um
  produto junta os dois ("53279907101/7210", "53279907210 (USE 7101)") ou "não sei". Sem
  confirmação do especialista, a pergunta vai para "Para revisar" com o outro código sugerido.
  "Mesma ficha do catálogo" **não** conta: uma ficha Master Power junta centenas de códigos.
- **Código de outro fabricante** (2026-10-13): quando o código não é de um produto nosso mas está
  no catálogo, a resposta é "*X*: temos." (o dono: se aparece Garrett, Borg ou Holset da ficha, é
  porque temos), depois de quem é o código ("É código OEM / Mahle / Biagio...; no catálogo Master
  Power é a *805314* (MP530w — turbo HX55W HE500WG)") e as nossas turbinas daquela ficha com
  estoque, sem o "conferir". O código da própria ficha vira "É o código Master Power da ficha...".
- **Ficha própria** (2.4.1): turbina que o catálogo não tem ganha aplicações e outros códigos na
  aba Catálogo do produto. Fica na tabela `fichas_proprias` e é copiada para as tabelas
  `catalogo_*` com a fonte "PROPRIA" (`core/catalog/own_fichas.py`), então todas as buscas a usam
  sem código novo. Edita a publicadora (ou uma máquina sem fonte configurada); viaja no mesmo JSON
  do conhecimento (chaves `fichas` e `fichas_sha256`, ignoradas pela 2.4.0).
- **Atualizar catálogo** (2.4.1): Backup > Catálogo importa o `CatalogoMasterPower_Aberto.db`
  (`POST /catalogo/importar`). A máquina fica marcada como "local:<versão>" e só um pacote de
  versão mais nova substitui o catálogo dela.
- **Movimentações e código Master Power** (2026-10-13): "quando saiu / vendemos / chegou a X?",
  "quantas saíram?" -> `movimentacoes_produto` (última saída, entrada e transferência, com data,
  quantidade, local e nota, e quanto saiu em 90 dias; estornos não contam). "Qual o código
  Master Power da X?" -> `codigo_master_power` (a ficha do catálogo, turbo antes do conjunto
  central). Só leitura, como as outras buscas: a IA não lê o banco inteiro nem roda SQL.
- **"Para revisar":** códigos perguntados que não temos aparecem para o admin, com sugestões só
  quando há motivo: o código com que perguntaram se é igual e o que o cadastro junta no nome
  (o "mesmo início de código" foi tirado em 2026-10-13: todo K27 começa com 5327988). O admin
  ensina com "É igual" / "É similar" / "Não serve" ou "Ensinar outro código". "Não serve" tira
  só a sugestão; o código continua na lista. Uma regra por código (o sistema recusa "A OU B").
- **Histórico:** toda pergunta e resposta vai para `assistente_historico.db` (separado do
  estoque). O admin corrige respostas e exporta em JSONL (sem o telefone).
- **Outras máquinas (Fase 2c):** a publicadora publica as regras num JSON pequeno, pela pasta
  compartilhada ou pelo servidor local da base oficial; as outras baixam ao abrir e a cada
  10 min, ou pelo "Sincronizar agora" na aba Conhecimento.
- **WhatsApp:** biblioteca **neonize** (não oficial; o número pode ser bloqueado). Entra como
  aparelho conectado ("Chronos"). Áudio é transcrito pelo Whisper do Groq. A resposta cita a
  mensagem e o 🤖 sai (⚠️ se deu erro). `/ensinar` vira **proposta** que o admin aprova no app.

## 4. Onde está cada coisa

**Backend** (`app/services/`):

| Arquivo | O que faz |
|---|---|
| `assistant_chat_service.py` | orquestra: busca direta primeiro, IA, reserva, histórico |
| `assistant_direct_service.py` | busca direta (sem IA), "essa daí", resposta a "Qual é o motor?" |
| `assistant_tools_service.py` | as três buscas (tool use) e o `texto_pronto` |
| `assistant_answer_format.py` | textos prontos no estilo WhatsApp, `display_code` |
| `assistant_common.py` | prompt, ajuste para WhatsApp, nota de preço, conferência do texto da IA |
| `assistant_openai_compat.py` / `assistant_anthropic.py` | Groq/Gemini/Ollama / Claude |
| `assistant_config_store.py` | `assistente_config.json` (provedor, chaves, admin, WhatsApp) |
| `assistant_admin_service.py` | publicadora + senha, sessão de 8 h |
| `assistant_knowledge_service.py` | regras igual/similar/diferente, sugestões |
| `assistant_knowledge_sync_service.py` | publicar/receber o conhecimento (Fase 2c) |
| `assistant_history_service.py` | histórico, "Para revisar", propostas, JSONL |
| `assistant_transcription_service.py` | áudio → texto (Whisper do Groq) |
| `assistant_vision_service.py` | foto da plaqueta → códigos (modelo com visão do Groq) |
| `assistant_daily_summary_service.py` | resumo diário (zerados, mais saídas, pedidos que não temos) |
| `whatsapp_bridge_service.py` | regras da ponte (🤖, agrupar código + áudio, comandos) |
| `whatsapp_neonize_transport.py` | única parte que conhece a neonize |
| `whatsapp_service.py` | liga/desliga, QR, estado (usado pela aba WhatsApp) |

Também: `core/database/repositories/assistant_repository.py` e `knowledge_repository.py`,
`core/database/migration_v2_4_0_knowledge.py`, rotas em `backend/app/api/routers/assistant.py`,
schemas em `backend/app/schemas/assistant.py`.

**Scripts:** `scripts/assistente_dev.py` (`gerar-banco`, `codigo`, `aplicacao`, `produto`,
`cobertura`, `perguntar`, `whatsapp`) e `scripts/assistente_avaliacao.py` (17 casos em
`scripts/assistente_casos.json`).

**Testes:** `backend/tests/test_assistant_*.py` e `test_whatsapp_*.py` (162 testes no total do
projeto passando em 2026-10-10).

**Telas** (`frontend/src/`): `pages/AssistantPage.tsx`, `components/assistant/*`
(admin: Para revisar, Conhecimento, Histórico, WhatsApp), `components/settings/AssistantSettingsPanel.tsx`,
`lib/assistantApi.ts`, `lib/assistantAdminApi.ts`, `types/assistant*.ts`.

**Fora do git (cada máquina tem os seus; nunca subir):**

| Arquivo | Onde | O que tem |
|---|---|---|
| `assistente_config.json` | pasta raiz do app* | **chave do Groq**, senha do admin (hash), WhatsApp ligado |
| `assistente_conhecimento.json` | pasta raiz do app* | última publicação/recebimento do conhecimento |
| `official_base_config.json` | pasta raiz do app* | papel da máquina (publicadora ou não) |
| `assistente_historico.db` | pasta do banco | histórico, revisão, propostas |
| `whatsapp_sessao.db` | pasta do banco | conexão do WhatsApp |

\* No app instalado: `%APPDATA%\Chronos Inventory`. Rodando pelo código: a pasta do projeto.
A pasta do banco é a do app, ou a de `CHRONOS_APP_DIR` quando essa variável está definida.

## 5. Branches e GitHub

- **`feature/assistente-ia`**: **tudo**, backend e todas as telas (inclusive as últimas do
  Antigravity: foto no chat, resumo diário, senha do servidor, atalho N). É a branch para
  trabalhar, testar e virar a versão 2.4.0.
- **`claude/protecao-dados`**: só a proteção de dados (1 commit), se o dono quiser uma 2.3.1 antes.
- **`ag/operacao-e-atalhos`** e **`ag/assistente-chat`**: do Antigravity (pausado). Já estão
  dentro da `feature/assistente-ia`; ficam só como histórico.
- A **`main`** não recebe nada do assistente até o dono decidir. O merge na `main` é sempre
  feito pelo dono, nunca pelo Claude.

Para puxar em outra máquina:

```powershell
git fetch origin
git checkout feature/assistente-ia
git pull
```

## 6. Testar no banco real da empresa

O banco real já tem os vínculos produto ↔ catálogo, então a busca por veículo deve achar muito
mais coisa. **Nunca use o `estoque.db` original**: abrir pelo app (ou pelos scripts) aplica as
migrações novas no banco. Sempre numa **cópia**.

1. **Código:** `git checkout feature/assistente-ia` e `git pull` (seção 5).
2. **Dependências** (uma vez por máquina):
   ```powershell
   python -m venv C:\dev\chronos-venv
   C:\dev\chronos-venv\Scripts\python.exe -m pip install -r backend\requirements.txt
   cd frontend; npm ci; cd ..
   ```
3. **Cópia do banco:** feche o Chronos e copie o `estoque.db` de `%APPDATA%\Chronos Inventory`
   (ou do estoque em uso) para uma pasta separada, ex.: `C:\teste_assistente\estoque.db`.
4. **Cobertura** (quantos produtos com estoque a busca por veículo enxerga):
   ```powershell
   C:\dev\chronos-venv\Scripts\python.exe scripts\assistente_dev.py --pasta C:\teste_assistente cobertura
   C:\dev\chronos-venv\Scripts\python.exe scripts\assistente_dev.py --pasta C:\teste_assistente codigo 4031196
   C:\dev\chronos-venv\Scripts\python.exe scripts\assistente_dev.py --pasta C:\teste_assistente aplicacao "scania 440"
   ```
5. **App com a cópia** (dois terminais; feche o Chronos instalado, que usa a porta 8000):
   ```powershell
   # terminal 1 (pasta do projeto)
   $env:CHRONOS_APP_DIR = "C:\teste_assistente"
   C:\dev\chronos-venv\Scripts\python.exe -m backend.app.main
   # terminal 2
   cd frontend; npm run dev
   ```
   Abra http://localhost:5173 e siga a parte B de `docs/TESTE_ASSISTENTE.md`.
6. **Configurar de novo nesta máquina** (não vem pelo git):
   - chave gratuita do Groq em Configurações > Assistente de IA (console.groq.com → API Keys);
     **nunca cole a chave no chat com a IA**;
   - Backup > Base oficial > "Papel desta máquina" = Publica a base, e a senha de admin;
   - WhatsApp: conectar de novo pelo QR (de preferência, primeiro num WhatsApp comum).
7. **Anotar as perguntas reais do chefe** (do histórico do WhatsApp) e acrescentar em
   `scripts/assistente_casos.json` para a avaliação.

## 7. Cuidados e problemas já resolvidos

- **Tela travada pedindo "Reinicie o sistema"** com `CHRONOS_APP_DIR`: corrigido no backend
  (`stock_profile_service.py`). Se aparecer de novo, reinicie o backend.
- **Login de admin some ao recarregar a página:** é de propósito (fica só na memória).
- **Não rode** o `assistente_dev.py whatsapp` e a aba WhatsApp do app ao mesmo tempo: os dois
  disputam a mesma conexão. "Desconectar este computador" tira o aparelho do celular, e depois
  precisa de QR de novo.
- **Limite gratuito do Groq:** perguntas de código e veículo não gastam (busca direta); só as que
  a busca direta não entende vão para a IA. Sem IA, o assistente continua respondendo.
- **Mensagem que mistura veículo e código de peça:** vale o código; o resto é ignorado.
- **"Essa/dessa" sem código:** vale o código da mensagem anterior do usuário; se ela não tem
  código, vale a turbina que a última resposta mostrou (o código de cada "*PRODUTO*", até 3), ou
  o código do assunto ("*4031196*: ..."). Assim "qual o código master dessa?" depois de uma busca
  por veículo responde a turbina mostrada. "Master" só é Master Power com "código", "power", "MP"
  ou "ficha" (senão é a Renault Master).
- **Depois de "Qual é o motor ou o ano do veículo?"** basta mandar "d13", "2015" ou "d13 2015":
  junta com a pergunta original, inclusive numa segunda resposta seguida. O ano vale pelo texto do
  catálogo ("A partir 2017", "Até final de 2018", "2019 – 2023"); aplicação sem ano continua na
  lista. "D13" acha também o "MD13". Só o ano, sem veículo nem conversa antes, não é busca.
- **Número de chassi** não é código de peça: com veículo junto, vale o veículo; só o chassi, a
  resposta pede o código da plaqueta ou o veículo e o motor. Uma regra ensinada para o chassi
  vale só para aquele caminhão; ensine de código para código.
- **Código falado com espaços** ("5327 988 7101"): a busca direta junta, se o código existir.
- **Código falado por extenso** (2.7.16): "cinco quatro cinco cinco meia zero nove" vira 5455609 antes de tudo; "quatrocentos e três, onze, noventa e cinco" vira 4031195 (`spoken_digits_to_numbers` em `assistant_spoken_numbers.py`, chamado no `AssistantChatService._answer` e no robô do WhatsApp). Precisa de 2 números por extenso e 5 dígitos; "uma"/"duas" não contam; número com "mil" (ano) fica sozinho; quebra de linha, código já escrito inteiro e pedaço que sozinho tem 5 dígitos separam os pedidos. Depois troca letra falada junto de outra letra ou número ("agá xis" = HX, "dê" só com acento) e veículo/motor falado ("quatrocentos e quarenta" = 440; "um".."nove" sozinho só depois de sigla como D, FH, OM). Sem isso a conferência da IA (`supported_codes`) descartava o código, porque ele não estava escrito no texto.
- **WhatsApp não oficial:** pode bloquear o número. Por isso só responde com 🤖 de alguém da
  equipe, sem mensagens em massa. A alternativa oficial (coexistência da Meta) está descrita
  em `docs/PLANO_IA.md`, Fase 3.

## 8. Próximos passos

Caminho até a **versão 2.4.0**:

1. ✅ Juntar tudo na `feature/assistente-ia` e corrigir o "Salvar configuração" da Base oficial
   (feito em 2026-10-10; testes, build, lint e clique no app conferidos).
2. Testar no banco real (seção 6), numa cópia, e medir a cobertura dos vínculos. Esta versão
   cria tabelas novas no banco.
3. Testar o conhecimento chegando numa segunda máquina (parte D do roteiro).
4. Trocar a versão para 2.4.0 com `frontend/scripts/bump_version.ps1 2.4.0` (mexe nos 6
   arquivos de versão; conferir com `python scripts/check_versions.py`), escrever a seção
   `## [2.4.0]` do `CHANGELOG.md` (é o texto de "Novidades da versão") e rodar
   `npm run changelog:sync` na pasta `frontend`.
5. O dono junta na `main` e cria a tag `v2.4.0`. **A tag publica a atualização para todas as
   máquinas** (`.github/workflows/release.yml` monta o instalador e a GitHub Release): só depois
   dos testes e a partir da `main`.

Depois: juntar as perguntas reais do chefe na avaliação e decidir o WhatsApp do número da
empresa (não oficial × oficial). O backend empacotado já é testado sozinho pelo
`build_backend.ps1` (`estoque_backend.exe --diagnostico-assistente <arquivo.json>`).

## 9. Como retomar com o Claude Code em outra máquina

Abra o Claude Code na pasta do projeto, na branch `feature/assistente-ia`. O `CLAUDE.md` da
raiz manda ler este arquivo e o `docs/HANDOFF.md`. Se precisar, peça: "leia
docs/ASSISTENTE_IA.md e docs/HANDOFF.md e continue o assistente de IA".

**Num Projeto do Claude Desktop:** dê como contexto o repositório do GitHub ou só os arquivos
`CLAUDE.md`, `docs/CONTEXTO.md`, `docs/ASSISTENTE_IA.md` e `docs/PROJECT_MAP.md`. **Nunca
arraste a pasta inteira do projeto**: ela tem arquivos que ficam fora do git de propósito,
como `assistente_config.json` (chave do Groq), `estoque.db`, `official_base_config.json`
(senha do servidor) e `backend/logs/`.
