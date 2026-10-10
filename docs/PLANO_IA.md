# Plano — Assistente de IA do Chronos

Assistente que responde perguntas sobre o estoque em linguagem natural, primeiro dentro
do app e depois pelo WhatsApp. Exemplo do uso principal:

> **Chefe:** temos turbina 4031196?
> **Assistente:** Sim. *TURBINA HOLSET HX55W 4031196* — 2 em Canoas.
> Aplicação: Volvo FH/FM 460–540 (MD13 Euro 5), Renault Magnum.

> **Chefe:** temos turbina do scania 440?
> **Assistente:** Scania 440 depende do motor:
> • DC13 Euro 5 (2012+) → Garrett GTA42 / Holset HE500WG — *temos 2* (Canoas)
> • DT12 Turbo Compound → Holset HX52 — *não temos*
> Qual é o motor do cliente?

---

## 1. Princípios

1. **A IA não procura nada sozinha e nunca inventa estoque.** Quem busca é o backend, com
   SQL determinístico. O modelo de linguagem só interpreta a pergunta, escolhe a
   ferramenta e escreve a resposta com o que a ferramenta devolveu.
2. **Somente leitura.** Nenhuma ferramenta altera estoque, produtos ou cadastros.
3. **Só as marcas com que a empresa trabalha:** Garrett, Holset e BorgWarner. Códigos de
   outras marcas (OEM, Mahle, Master Power...) servem para *encontrar* a peça, mas não
   aparecem na resposta.
4. **Na dúvida, perguntar.** O mesmo veículo pode usar turbinas diferentes conforme motor
   e ano. Nesse caso a resposta lista as opções e pergunta qual é.
5. **A API do Chronos continua fechada para a rede.** O assistente roda no PC da empresa
   e acessa os dados por dentro.
6. **Custo zero.** O provedor padrão é o plano gratuito do Groq, que não pede cartão, então
   não há como gerar cobrança. Quando a IA não responde (limite gratuito do dia, sem
   internet, sem chave), a **busca direta** (sem IA) responde no lugar: sempre há resposta.

## 2. Arquitetura

```
 WhatsApp da empresa (chefe)          Tela "Assistente" no app
        │  equipe reage com 🤖                 │
        ▼                                      │
 Ponte WhatsApp, modo copiloto (Fase 3)        │
   - aparelho conectado (QR), não oficial      │
   - junta código + áudio, transcreve          │
   - responde citando; /ensinar → proposta     │
        │                                      │
        └──────────► AssistantChatService ◄────┘   (POST /assistente/chat)
                            │
                            ▼
                AssistantChatService (Fase 2)
                 - escolhe o provedor de IA (padrão: Groq gratuito;
                   opções: Gemini, Ollama local, Claude, nenhum)
                 - prompt com as regras do negócio + tool use
                 - se a IA falhar → AssistantDirectService
                   (busca direta, sem IA, textos prontos)
                            │  pede ferramentas
                            ▼
                AssistantToolsService (Fase 1)  ──► SQLite (produtos, estoque, catálogo)
                 - buscar_por_codigo
                 - buscar_por_aplicacao
                 - detalhe_produto
```

## 3. Fases

| Fase | O que entrega | Responsável | Estado |
|---|---|---|---|
| 0 | Banco de teste gerado a partir do catálogo embutido | Claude Code | ✅ pronto |
| 1 | Ferramentas de busca determinísticas + testes | Claude Code | ✅ pronto |
| 2 | Cérebro (IA gratuita via Groq + busca direta de reserva), `POST /assistente/chat` e configuração | Claude Code | ✅ pronto (falta testar com chave real) |
| 2 | Tela de chat e configuração da IA no app | Antigravity | a fazer (ver `docs/HANDOFF.md`) |
| 2 | Avaliação com perguntas reais do chefe | Claude Code + dono | em andamento (Groq real: 10/13 → corrigido com `texto_pronto`) |
| 2b | Base de conhecimento do especialista, admin, histórico, "Para revisar" (backend) | Claude Code | ✅ pronto |
| 2b | Telas: Conhecimento, Para revisar, Admin, Histórico | Antigravity | a fazer (ver `docs/HANDOFF.md`) |
| 2c | Distribuir o conhecimento da máquina publicadora para as outras | Claude Code | a fazer |
| 3 | Ponte WhatsApp em modo copiloto (reação 🤖, áudio, propostas) | Claude Code | núcleo pronto; falta testar com celular |
| 3 | Tela WhatsApp (QR, ligar/desligar) e propostas na área do admin | Antigravity | a fazer (ver `docs/HANDOFF.md`) |
| 4 | Extras: foto da plaqueta, resumo diário | — | ideia |

### Fase 0 — Banco de teste (pronto)

O banco real fica na empresa. Para desenvolver sem ele, `scripts/assistente_dev.py`
cria um banco com:

- os nomes reais enviados (`TURBINA HOLSET HX55W 4031196`, `TURBO HE200WG - 3799431 / 3785294`,
  `TURBO HOLSET HX55 4031195`, `TURBO K27 - 53279887116`, `TURBO GARRETT 466646-5041S`);
- ~250 produtos sorteados do catálogo Master Power, com nomes no mesmo padrão;
- fichas do Scania 440 com e sem estoque, e alguns produtos sem ficha;
- estoque fictício em Canoas e Passo Fundo.

```powershell
python scripts/assistente_dev.py gerar-banco
python scripts/assistente_dev.py codigo 4031196
python scripts/assistente_dev.py aplicacao "scania 440"
python scripts/assistente_dev.py produto 1
```

Para abrir o app com esse banco, defina `CHRONOS_APP_DIR` com a pasta do banco de teste
(padrão: `%TEMP%\chronos_assistente`).

### Fase 1 — Ferramentas (pronto)

`app/services/assistant_tools_service.py` (consultas em
`core/database/repositories/assistant_repository.py`, testes em
`backend/tests/test_assistant_tools.py`).

| Ferramenta | Entrada | O que devolve |
|---|---|---|
| `buscar_por_codigo` | `codigo` (como o usuário escreveu: hífen, sufixo S/RX, OEM...) | Nossos produtos com estoque por local e o tipo de correspondência: `exato`, `familia` (nova/reman: BorgWarner 988↔990, Garrett 5xxx↔9xxx...) ou `equivalente_catalogo` (outro código que o catálogo diz ser intercambiável). Fichas do catálogo com aplicações. |
| `buscar_por_aplicacao` | `texto` (ex.: "scania 440", "vw 8.150", "mb om 366") | Fichas cujas aplicações contêm todas as palavras, cada uma com as aplicações encontradas e nossos produtos ligados (com estoque). Ordem: com estoque → sem estoque → sem produto. |
| `detalhe_produto` | `produto_id` | Estoque por local, observação e todas as fichas ligadas ao produto. |

Detalhes da busca por aplicação:
- ignora acentos, maiúsculas e palavras sem valor ("temos", "turbina", "do", "caminhão"...);
- separa letras de números ("R440" = "R 440", "366LA" = "366 LA") e mantém números com
  ponto juntos ("8.150" é o modelo, não "8" + "150");
- apelidos de montadora: VW, MB, CAT, MF, NH, JD, Chevrolet→GM.

### Fase 2 — Cérebro (pronto no backend)

**Decisão: custo zero.** Provedor padrão: **Groq, plano gratuito** (sem cartão; segundo a
documentação deles, não usa os dados para treinar modelos). Modelo `openai/gpt-oss-120b`.

| Provedor | Custo | Observação |
|---|---|---|
| `groq` (padrão) | grátis, sem cartão | ~30–60 perguntas/dia; limite de 8 mil tokens/minuto |
| `gemini` | créditos da assinatura Google AI Pro (US$ 10/mês) | exige cartão no Google Cloud; o que passar dos créditos é cobrado |
| `ollama` | grátis, roda no PC | precisa de um PC forte; mais lento |
| `anthropic` | pago | Claude; melhor qualidade |
| `nenhum` | grátis | só a busca direta |

Arquivos: `assistant_chat_service.py` (escolhe o provedor e faz a reserva),
`assistant_openai_compat.py` (Groq, Gemini e Ollama, que usam o formato de API do OpenAI;
chamado com `requests`, sem dependência nova), `assistant_anthropic.py` (Claude),
`assistant_direct_service.py` (busca direta), `assistant_common.py` (prompt e partes
comuns), `assistant_config_store.py` (configuração). Testes em `backend/tests/test_assistant_chat.py`.

- **Como funciona:** a pergunta vai para o provedor com as três ferramentas. O modelo pede
  buscas, o backend executa e devolve o JSON (compacto); isso se repete até a resposta final
  (no máximo 6 rodadas). A lista `produtos` vem dos resultados das ferramentas, filtrada
  pelos nomes que a resposta cita — não do texto do modelo.
- **Limite gratuito do Groq:** as ferramentas devolvem respostas menores (modo compacto) e o
  raciocínio do modelo fica em `low`. Se o Groq pedir para esperar até 20 s (limite por
  minuto), o backend espera e tenta de novo; se for mais que isso ou acabar o limite do dia,
  a busca direta responde.
- **Busca direta (sem IA):** código na mensagem → busca por código (até 3 códigos);
  senão → busca por veículo/motor. Se a última resposta foi uma pergunta ("Qual é o
  motor?"), junta a pergunta anterior com a resposta ("scania 440" + "dc13"). Textos prontos
  no estilo WhatsApp. Conjunto central só aparece numa pergunta de turbina quando tem estoque.
- **Resposta da API:** `modo` (`ia` ou `busca_direta`) e `aviso` (por que a IA não
  respondeu). O chat não devolve mais `503`.
- **"A IA entende, o sistema responde."** O modelo gratuito segue o prompt com pouco rigor
  (no primeiro teste real: "Sim, temos" para o Scania 440 sem perguntar o motor, modelo da
  turbina no lugar do nome do produto, perguntas desnecessárias). Por isso cada busca devolve
  `texto_pronto` — a mesma resposta da busca direta (`assistant_answer_format.py`) — e o
  prompt manda responder com ele, juntando os textos quando há vários códigos. A IA fica com
  o que sabe fazer bem: entender a pergunta, escolher a busca e lidar com conversa.
- **Regras que não dependem do modelo obedecer:**
  - a busca por aplicação devolve o campo `atencao` quando há mais de uma turbina possível;
  - `buscar_por_codigo` separa o código do texto ("HE200WG 3785294" → 3785294) e avisa se
    vieram vários códigos;
  - a resposta da IA passa por `whatsapp_text`: `**x**` → `*x*`, títulos e marcadores
    markdown → texto e "•", e frases finais de cortesia ("Se precisar, avise") são removidas.
- **Palavras da pergunta:** palavras de conversa ("com", "meu", "tio") são ignoradas, e as
  ignoradas voltam em `termos_ignorados`; número desconhecido continua obrigatório
  ("scania 999" não vira "qualquer Scania"); ano é filtro opcional (ignorado se nenhuma
  aplicação o cita).
- **Chaves:** uma por provedor, salvas em `assistente_config.json` na pasta do app (fora do
  banco, dos backups e da base oficial). Sem chave salva, vale a variável de ambiente do
  provedor (`GROQ_API_KEY`, `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`). A API nunca devolve a chave.
- **Testar no terminal:**
  `python scripts/assistente_dev.py perguntar "temos turbina do scania 440?"` (usa o
  provedor configurado; sem chave, responde pela busca direta) e
  `... perguntar --sem-ia "..."` (só a busca direta).

**Avaliação:** `python scripts/assistente_avaliacao.py` roda as perguntas de
`scripts/assistente_casos.json` no banco de teste e confere cada resposta (o que precisa
aparecer, o que não pode aparecer, se tem que perguntar o motor). `--sem-ia` avalia só a
busca direta (15/15 hoje). Com IA, espera 40 s entre perguntas por causa do limite por
minuto do Groq; uma rodada gasta uns 75 mil dos 200 mil tokens diários.

**Primeira avaliação com o Groq real (2026-10-09):** 10 de 13 ok antes do `texto_pronto`.
Falhas: código junto com texto, modelo da turbina no lugar do produto, "Depende do motor"
com o motor já informado. Corrigidas pelo `texto_pronto`; falta rodar de novo.

Falta:
- rodar a avaliação de novo com a chave real do Groq;
- acrescentar as 20–30 perguntas reais do chefe em `scripts/assistente_casos.json`;
- tela de chat e configuração no app (Antigravity), com a escolha do provedor.

### Fase 2b — Base de conhecimento do especialista (pronto no backend)

**O problema:** o catálogo não sabe tudo. Ex.: a BorgWarner 5327-988-7101 é similar à
5327-988-7210, mas nenhum dado do sistema diz isso; quem sabe é o especialista (o dono).

**A solução não é treinar o modelo de IA**, e sim uma base de conhecimento que só o admin
edita e que a busca consulta a cada pergunta: aprende na hora, vale para a IA e para a busca
direta, dá para desfazer, e o bot nunca "inventa" um similar.

- **Tipos de regra** (tabela `conhecimento_equivalencias`, no banco):
  - `igual`: mesma peça, troca direta. Transitivo: A = B e B = C → A = C;
  - `similar`: serve com ressalva (observação: "muda o atuador");
  - `diferente`: não serve. Usado para recusar uma sugestão e para esconder um
    "equivalente pelo catálogo" que o especialista sabe que não serve.
  As versões nova/reman de um código (988 ↔ 990...) herdam as regras dele.
- **Na resposta:** `*7101*: não temos esse código, mas temos: • *TURBO K27 ... 7116* — 3 em
  Passo Fundo (similar: muda o atuador)`. O que o especialista ensinou vem antes do que o
  catálogo diz.
- **Final do código:** o chefe fala "a 988-7101". Se o código não aparece como foi dito, a busca
  completa pelo final (6+ dígitos). Várias famílias terminam assim (K24/K27/K31): se só uma é
  conhecida da empresa (produto nosso ou regra ensinada), usa essa e avisa das outras; senão,
  pergunta mostrando o modelo de cada uma.
- **Quem ensina:** só o admin, **na máquina publicadora** da base oficial, com **senha**
  (hash PBKDF2 em `assistente_config.json`; login gera uma sessão de 8 h, header
  `X-Admin-Token`). Decisão do dono: "se fossem todos, iam colocar qualquer coisa".
- **"Para revisar":** toda pergunta fica no histórico. Códigos pesquisados sem estoque entram
  na lista do admin, com **sugestões** de possíveis similares (hoje: produtos nossos com o
  mesmo início de código BorgWarner, ex. 5327-988-....). Ao ensinar uma regra, o código sai da
  lista; se for perguntado de novo depois, volta. As sugestões só aparecem para o admin.
- **Histórico:** banco separado `assistente_historico.db` (não vai para a base oficial nem
  para os backups). Cada conversa guarda pergunta, contexto, buscas feitas, resposta, modo e a
  **correção do admin**. Exporta em **JSONL** (um JSON por linha, sem o telefone de quem
  perguntou): o formato padrão para avaliar e, no futuro, ajustar um modelo próprio. Criar uma
  LLM do zero não é viável; um ajuste fino de modelo aberto com esse histórico é possível mais
  para frente, mas para equivalências a base de conhecimento é melhor.
- **Distribuição (a fazer, Fase 2c):** cada máquina tem o próprio banco e as filiais lançam
  movimentos separadamente (a comparação de estoque acha divergências); ninguém aplica a
  base oficial inteira. Então o conhecimento precisa ser publicado à parte pela máquina
  publicadora (pasta compartilhada ou servidor local, como a comparação) e baixado pelas
  outras, só leitura. O bot do WhatsApp roda na máquina do admin, então já usa tudo na hora.

Arquivos: `assistant_knowledge_service.py`, `assistant_admin_service.py`,
`assistant_history_service.py`, `core/database/migration_v2_4_0_knowledge.py`,
`core/database/repositories/knowledge_repository.py`. Testes em
`test_assistant_knowledge.py` e `test_assistant_admin.py`.

### Fase 3 — WhatsApp em "modo copiloto" (núcleo pronto; falta testar com celular)

**Decisões (2026-10-09):**
- **Não é um bot com número próprio.** O Chronos entra no **WhatsApp da empresa** (WhatsApp
  Business, onde está o contato do chefe) como mais um **aparelho conectado** (QR code, como o
  WhatsApp Web).
- **A IA nunca responde sozinha.** Quem usa o WhatsApp da empresa **reage com 🤖** na mensagem
  do cliente; a ponte responde na conversa, citando a mensagem, e tira o 🤖 (⚠️ se deu erro).
  Sem modo automático.
- **Qual é a pergunta:** a mensagem reagida + as mensagens seguidas da mesma pessoa até 3 min
  antes/depois (ex.: o código colado + o áudio "temos essa daí?"). Áudios são transcritos pelo
  Whisper do Groq (grátis, mesma chave). As 10 mensagens anteriores vão como contexto.
- **Comandos só na conversa "Mensagem para mim"** (ninguém mais vê): `/ajuda`, `/pendentes` e
  `/ensinar <código> <igual|similar|diferente> <código> [observação]`. Como colegas também usam o
  WhatsApp da empresa, `/ensinar` cria uma **proposta**; ela só vira regra quando o admin aprova
  no app (com senha). Assim continua valendo "só o admin ensina".
- **Testar sozinho, com um WhatsApp comum:** `python scripts/assistente_dev.py whatsapp` mostra o
  QR no terminal e liga a ponte no banco de teste. Na conversa "Mensagem para mim": mande um
  código, depois um áudio, e reaja com 🤖 no áudio.
- Grupos ficam de fora. A ponte só enxerga mensagens que chegaram com ela ligada.

**Arquivos:** `whatsapp_bridge_service.py` (regras, sem depender da biblioteca),
`whatsapp_neonize_transport.py` (biblioteca **neonize** = whatsmeow em Python; já traz a DLL
para Windows; FFmpeg não é necessário para o nosso uso), `whatsapp_service.py` (liga/desliga,
QR, religa quando o backend abre se estava ligada), `assistant_transcription_service.py`.
Sessão do WhatsApp em `whatsapp_sessao.db` na pasta do app. Testes em `test_whatsapp_bridge.py`
(WhatsApp falso).

**Riscos e cuidados (a API não oficial viola os termos do WhatsApp):**
- o número pode ser **banido**. No modo copiloto (poucas mensagens, sempre respondendo a uma
  pessoa, acionado por gente) o risco é bem menor, mas não é zero — e no uso real seria o
  **número da empresa**. Testar primeiro num WhatsApp comum;
- nunca mandar mensagens em massa nem iniciar conversas;
- a ponte só fala com o assistente dentro do Chronos (nada exposto na internet).

**Alternativa oficial, se o risco do número da empresa não compensar:** "coexistência" da Meta
(app Business + Cloud API no mesmo número). Sem risco de banimento e respostas dentro de 24 h
grátis, mas exige conta Meta e um parceiro credenciado (muitos cobram), um endereço público
(webhook) e o **WhatsApp para Windows deixa de funcionar** nesse número. A ponte foi feita com o
"transport" separado justamente para trocar só essa parte.

### Fase 4 — Ideias para depois

- **Foto da plaqueta:** a pessoa manda a foto, a IA lê o part number e faz a busca.
- **Resumo diário:** itens que zeraram e itens com muita saída (`movement_analytics_service`).
- **Cotação:** para um veículo, sugerir as opções com estoque, incluindo nova × reman.

## 4. Limitações conhecidas

- A busca por veículo só encontra produtos **ligados a uma ficha do catálogo**. Produto sem
  vínculo só aparece na busca por código. Primeira medição a fazer no banco real: quantos
  produtos com estoque têm vínculo (`python scripts/assistente_dev.py --pasta <cópia> cobertura`).
- O catálogo é o da Master Power (~1.550 fichas). Turbinas fora dele não têm aplicação.
- Os vínculos automáticos vêm dos códigos no nome do produto. Nome sem código não vincula.
  Código com espaços no meio (`5304 970 0077`) também não: precisa estar colado
  (`53049700077`) ou com hífen (`466646-5041S`). O comando `cobertura` lista esses casos.

## 5. Pendências com o dono do projeto

- [x] Chave gratuita do Groq (console.groq.com → API Keys), sem cartão.
- [ ] Marcar a máquina do admin como **publicadora** (Configurações > Base oficial) e definir a
      senha de admin (quando a tela estiver pronta).
- [ ] Ensinar as primeiras regras (ex.: 5327-988-7101 similar 5327-988-7210).
- [ ] Lista de perguntas reais do chefe (do histórico do WhatsApp) para a avaliação.
- [ ] Testar no banco real. Copie o `estoque.db` da empresa para uma pasta separada (nunca use
      o original: abrir o banco pelo app aplica migrações) e rode:
      `python scripts/assistente_dev.py --pasta <pasta da cópia> cobertura`,
      depois `... codigo 4031196` e `... aplicacao "scania 440"`.
- [ ] Testar a ponte num WhatsApp comum (`python scripts/assistente_dev.py whatsapp`).
- [ ] Decidir se o WhatsApp da empresa usa a ponte não oficial (risco de banimento) ou a
      coexistência oficial da Meta.
- [ ] A resposta deve informar preço? (hoje o banco não tem preço.)
