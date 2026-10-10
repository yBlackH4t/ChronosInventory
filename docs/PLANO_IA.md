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
 WhatsApp (chefe)                     Tela "Assistente" no app
        │                                      │
        ▼                                      │
 Ponte WhatsApp (não oficial, Fase 3)          │
   - só responde números autorizados           │
   - guarda o histórico por número             │
        │                                      │
        └──────────► POST /assistente/chat ◄───┘   (localhost)
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
| 2 | Avaliação com perguntas reais do chefe | Claude Code + dono | a fazer (precisa da lista) |
| 3 | Ponte WhatsApp (API não oficial) | Claude Code | a fazer |
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
- **Chaves:** uma por provedor, salvas em `assistente_config.json` na pasta do app (fora do
  banco, dos backups e da base oficial). Sem chave salva, vale a variável de ambiente do
  provedor (`GROQ_API_KEY`, `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`). A API nunca devolve a chave.
- **Testar no terminal:**
  `python scripts/assistente_dev.py perguntar "temos turbina do scania 440?"` (usa o
  provedor configurado; sem chave, responde pela busca direta) e
  `... perguntar --sem-ia "..."` (só a busca direta).

Falta:
- testar com uma chave real do Groq e ajustar o prompt com as respostas;
- **avaliação:** lista de 20–30 perguntas reais do chefe com a resposta esperada, rodada a
  cada mudança no prompt ou no provedor;
- tela de chat e configuração no app (Antigravity), com a escolha do provedor.

### Fase 3 — WhatsApp (a fazer) — **decisão: API não oficial**

Conexão por QR code (como o WhatsApp Web), sem precisar de cadastro na Meta nem de URL
pública. Opções a avaliar: Evolution API (Docker), Baileys (Node) ou neonize (Python).

**Riscos e cuidados (a API não oficial viola os termos do WhatsApp):**
- o número pode ser **banido** a qualquer momento → usar **um chip só para o bot**, nunca o
  número principal da empresa;
- **só responder**, nunca iniciar conversas nem enviar em massa;
- responder **apenas números autorizados** (chefe e quem for liberado);
- manter a ponte isolada: ela só fala com `POST /assistente/chat` em localhost;
- se o número for banido ou o volume crescer, migrar para a API oficial (Meta Cloud API).
  O resto do sistema não muda, só a ponte.

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

- [ ] Chave gratuita do Groq (console.groq.com → API Keys), sem cartão.
- [ ] Lista de perguntas reais do chefe (do histórico do WhatsApp) para a avaliação.
- [ ] Testar no banco real. Copie o `estoque.db` da empresa para uma pasta separada (nunca use
      o original: abrir o banco pelo app aplica migrações) e rode:
      `python scripts/assistente_dev.py --pasta <pasta da cópia> cobertura`,
      depois `... codigo 4031196` e `... aplicacao "scania 440"`.
- [ ] Números autorizados a usar o bot.
- [ ] Chip dedicado para o WhatsApp do bot.
- [ ] A resposta deve informar preço? (hoje o banco não tem preço.)
