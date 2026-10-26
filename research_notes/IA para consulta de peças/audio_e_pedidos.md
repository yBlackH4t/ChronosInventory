# Áudio e pedidos de várias peças: implementações aproveitáveis no Chronos

Pesquisa em 23/10/2026. Escopo: transcrição, extração de pedidos, ferramentas determinísticas e esclarecimento. Cinco conjuntos de evidências primárias, com páginas técnicas auxiliares. As fontes centrais foram abertas; os notebooks foram inspecionados, mas não executados. Nenhum áudio, banco ou configuração privada foi enviado a serviços externos.

## 1. Como receber o áudio inteiro sem perder códigos e pedidos?

### Síntese

A documentação da Groq oferece os componentes de transcrição necessários. A recomendação para o Chronos é preservar a transcrição completa e sua origem antes de interpretar os pedidos; isso não garante que todos os números tenham sido ouvidos corretamente.

### Achados com fontes

- **Fonte 1 — Groq Speech to Text; documentação técnica do fornecedor, não caso de cliente.** Há modelos multilíngues `whisper-large-v3` e `whisper-large-v3-turbo`. O endpoint de transcrição conserva o idioma; o de tradução produz inglês. O limite informado para arquivos no plano gratuito é 25 MB, com suporte a OGG, entre outros formatos. — [Documentação de áudio](https://console.groq.com/docs/speech-to-text).
- `language`, `temperature=0`, `verbose_json` e timestamps de segmentos/palavras estão documentados. `avg_logprob`, `no_speech_prob` e `compression_ratio` auxiliam a detectar segmentos problemáticos. O `prompt`, limitado a 224 tokens, orienta contexto e grafia; não funciona como instrução de chat. A documentação recomenda sobreposição e reconciliação quando for necessário dividir arquivos grandes. Há uma inconsistência: o comentário do exemplo menciona `json` para timestamps, mas a tabela exige `verbose_json`; seguir a tabela e validar a resposta. — [Parâmetros e limitações](https://console.groq.com/docs/speech-to-text).

### Inferências e aplicação proposta

Estas são recomendações para implementação futura, não funcionalidades comprovadas pelos exemplos:

1. Enviar o arquivo completo de um minuto, se estiver dentro do limite; não cortar por duração arbitrária nem resumir antes da extração. Usar transcrição em português (`language="pt"`).
2. Guardar texto original, identificação da mensagem e tempos dos segmentos. Conservar a ligação entre cada pedido e o trecho que o originou. Conferir arquivo recebido, duração e segmentos ajuda a encontrar cortes técnicos, mas silêncio e timestamps não provam completude semântica.
3. Usar contexto curto, como nomes Garrett/Holset/BorgWarner e exemplos de grafia. Evitar fornecer apenas códigos existentes como se fossem as únicas respostas possíveis: uma peça desconhecida também pode ter sido pedida.
4. Separar confiança do áudio, da interpretação e da identificação no catálogo. Metadados por segmento não equivalem à probabilidade de um código inteiro estar correto. Um percentual inventado pela LLM não deve virar selo de precisão.
5. Se houver divisão, reconciliar a sobreposição por posição/tempo. Deduplicar apenas pelo código pode apagar duas menções legítimas ou uma correção do próprio falante.

### Lacunas

- Não foi encontrado, neste recorte, teste publicado de reconhecimento de códigos Garrett/Holset/BorgWarner falados em português brasileiro. Não há taxa demonstrada de acerto para o áudio do chefe.
- Não foi ouvido áudio real nesta pesquisa. Não se pode afirmar se a perda atual ocorre no recebimento, na transcrição ou somente na interpretação.

## 2. Como outras implementações transformam vários itens em consultas confiáveis?

### Síntese

Há código público da própria Groq para consultar vários produtos e devolver cada resultado à conversa. Para o Chronos, o componente central deve ser uma lista validada de pedidos e alternativas, executada pelo Python; quantidade e equivalência continuam vindo dos serviços locais.

### Achados com fontes

- **Fonte 2 — Groq Structured Outputs; documentação e exemplos do fornecedor.** Aceita objetos e arrays; exemplos Python usam Pydantic. `strict: true` exige campos obrigatórios e `additionalProperties: false`; campos sem valor podem admitir `null`. A página lista `openai/gpt-oss-20b` e `openai/gpt-oss-120b` entre os modelos compatíveis. JSON Object Mode não garante conformidade com o schema. A própria documentação diferencia conformidade estrutural de acerto semântico e informa que Structured Outputs não aceita tool use ou streaming na mesma chamada. — [Structured Outputs](https://console.groq.com/docs/structured-outputs).
- **Fonte 3 — Groq Local Tool Calling + notebook Parallel Tool Use; orientação oficial e demonstração pública.** O aplicativo executa funções locais; o modelo devolve nome e argumentos. O código deve processar as chamadas e associar resultados por `tool_call_id`. — [Guia de ferramentas locais](https://console.groq.com/docs/tool-use/local-tool-calling).
- O notebook pede preços de cappuccino e croissant, percorre `tool_calls` e devolve uma mensagem por resultado. Os preços são valores fixos em uma função, sem estoque real. Apesar do nome “parallel”, o trecho de execução Python usa um `for` sequencial: múltiplas chamadas emitidas juntas não provam execução concorrente. — [Notebook completo, código aberto para inspeção](https://raw.githubusercontent.com/groq/groq-api-cookbook/main/tutorials/02-tool-use/parallel-tool-use/parallel-tool-use.ipynb).
- **Fonte 4 — Groq Function Calling 101: eCommerce; demonstração, não operação comercial comprovada.** Usa Airtable para produtos, clientes e pedidos; define `get_product_price`, `get_product_id` e `create_order`. Demonstra consulta de preços de Laptop e Microphone e encadeamento identificação → pedido. Uma célula inicial executa somente `tool_calls[0]`; trechos posteriores percorrem todas as chamadas. Portanto, copiar apenas o exemplo inicial repetiria o risco de ignorar solicitações adicionais. — [Notebook de comércio eletrônico](https://raw.githubusercontent.com/groq/groq-api-cookbook/main/tutorials/02-tool-use/function-calling-101-ecommerce/Function-Calling-101-Ecommerce.ipynb).
- **Compatibilidade que muda a decisão:** a tabela atual marca os GPT-OSS 20B/120B sem suporte a parallel tool use, enquanto lista esse suporte para Qwen 3.8 27B e Llama 3.3 70B. Não presumir que um modelo com schema estrito também emite várias ferramentas simultâneas. — [Matriz oficial de ferramentas](https://console.groq.com/docs/tool-use/overview).

### Inferências e aplicação proposta

**Exemplo público para experimentar fora do app.** O candidato mais simples é o notebook Parallel Tool Use acima. Ele fornece instalação por `requirements.txt`, com `groq` e `python-dotenv`; requer ambiente de notebook/ipykernel e autenticação privada na Groq. O modelo escrito nele é `llama-3.3-70b-versatile`, cuja página atual o identifica como Enterprise. Assim, não classifico a reprodução literal como comprovadamente gratuita. Conferir modelo e permissões antes; a alternativa de extração em lote abaixo evita depender de parallel tool use. — [Dependências verificadas](https://raw.githubusercontent.com/groq/groq-api-cookbook/main/tutorials/02-tool-use/parallel-tool-use/requirements.txt), [condição atual dos modelos](https://console.groq.com/docs/models).

Não executei instalações ou chamadas autenticadas. O notebook também imprime parte da credencial em uma célula: esse comportamento não deve ser reproduzido. O exemplo eCommerce exige Airtable adicional; serve como referência de encadeamento, sem recomendar migrar o SQLite.

**Adaptação mínima ao stack existente, proposta de engenharia:**

- **Caminho preferível:** uma chamada de extração com schema gera `itens[]`; Pydantic valida; o Python percorre todos os itens e consulta os serviços atuais. Não é necessário deixar a LLM escolher quantas buscas executar.
- **Alternativa com function calling:** expor uma função como `consultar_pedido(itens=[...])`; validar seus argumentos e executar o lote localmente. Se houver ferramentas unitárias, tratar todas as chamadas e dependências, com limite de rodadas e erro explícito por item. Não combinar tools e Structured Outputs na mesma requisição enquanto a limitação documentada existir.
- Começar por funções de domínio, como consulta exata, variantes e equivalências aprovadas. Evitar conceder geração/execução livre de SQL; o Python deve aplicar filtros e consultas parametrizadas.

**Formato ilustrativo do resultado de extração**, criado para este estudo; não é o schema completo nem saída observada de modelo:

```json
{
  "itens": [
    {
      "id": "pedido-1",
      "trecho": "796155 5005 ou 5006",
      "operador": "ou",
      "alternativas": [
        {"codigo": "796155-5005", "origem": "explicito"},
        {"codigo": "796155-5006", "origem": "prefixo_compartilhado"}
      ],
      "quantidade_solicitada": null,
      "variantes_solicitadas": [],
      "pendencias": []
    }
  ],
  "trechos_nao_resolvidos": []
}
```

A expansão de `5006` é uma interpretação contextual a verificar, não prova de equivalência com `5005`. Usar strings preserva zeros, hífens e letras; nunca transformar código em quantidade. A quantidade solicitada também é diferente do saldo encontrado.

Regras propostas para evitar as falhas relatadas:

1. Preservar a estrutura **pedido → alternativas → variantes de cada alternativa**. “A ou B” consulta ambos sem somar; “nova ou reman” pertence ao item em que foi dito, sem se espalhar pelos demais.
2. Completar prefixo apenas quando seu escopo estiver claro. “796155 5005 ou 5006” pode gerar duas consultas identificadas; “5006” isolado, vários prefixos possíveis ou mudança de marca exigem esclarecimento. “5327 988 7101” deve conservar o original e a junção candidata, validada no catálogo. Número de veículo, ano e quantidade não devem ser concatenados por uma regra global.
3. Validar schema e regras de negócio separadamente: IDs únicos, alternativas não vazias, evidência no texto, códigos não inventados e pendências preservadas. Confrontar menções numéricas/candidatas com os itens extraídos ajuda a detectar omissões, mas não é prova absoluta de cobertura.
4. Retirar o teto silencioso de três códigos: qualquer limite técnico deve produzir divisão explícita em lotes ou pendência. Resposta truncada, erro ou timeout não autorizam tratar só os primeiros pedidos como conclusão.
5. Para cada combinação de código/variante, retornar identidade do produto, saldo por filial, origem da correspondência e instante da consulta. Um produto não encontrado não é automaticamente “saldo zero”; erro de consulta também não é zero.
6. A alternativa sugerida pelo usuário não cria equivalência. Produtos distintos com mesmo prefixo conservam saldos separados. Se vínculos aprovados apontarem ao mesmo registro físico, deduplicar por identidade de estoque antes de qualquer total permitido pelas regras atuais.
7. Montar os cartões e números a partir do resultado Python. Se a LLM redigir a resposta, conferir cobertura e valores; um template determinístico é mais simples para preservar números exatos.

Essas decisões aproveitam a separação entre modelo e funções documentada nas fontes 2 e 3; os detalhes de códigos e saldos são recomendações específicas para o problema informado, sem validação externa de intercambiabilidade.

### Lacunas

- Nenhum dos notebooks demonstra áudios longos em português, alternativas abreviadas, variantes por item e cobertura integral juntos. São peças reutilizáveis, não um assistente pronto para turbinas.
- Não há, neste recorte, comprovação de cliente em produção com o cenário completo. A seleção contém demos e documentação técnica; não deve ser apresentada como adoção comercial comprovada.

## 3. Quando perguntar em vez de adivinhar, e quais os limites práticos?

### Síntese

Rasa documenta correção e esclarecimento como fluxos explícitos. É uma referência de comportamento que pode ser reproduzida no Python atual; esta pesquisa não recomenda instalar outra plataforma.

### Achados com fontes

- **Fonte 5 — Rasa Patterns/CALM; capacidade documentada pelo fornecedor, sem comprovação de cliente nesta pesquisa.** Há padrões separados para correção, cancelamento, esclarecimento, erro e encaminhamento humano. O esclarecimento padrão oferece opções quando várias intenções/fluxos são possíveis; a documentação mostra contagem de tentativas antes de encaminhar a uma pessoa. Isso trata ambiguidade de fluxo, não resolve automaticamente ambiguidade de código de peça. A página também exige novo treinamento após alteração dos padrões do Rasa; não sustenta prometer “toda mudança sem reinstalar/retreinar” usando essa plataforma. — [Patterns e Conversation Repair](https://rasa.com/docs/reference/primitives/patterns/).
- **Limite financeiro auxiliar:** a Groq distingue cotas de requisições, tokens e segundos de áudio, compartilhadas por organização. Excesso retorna HTTP 429; há `retry-after`, e os limites exatos devem ser conferidos na conta. Código público não elimina cotas nem custos de serviços dependentes. — [Limites oficiais](https://console.groq.com/docs/rate-limits).
- **Situação local documentada:** o projeto já possui conhecimento aprovado pelo admin e sincronização separada desse conhecimento; o contexto registra o descarte do quarto pedido e o problema de sufixos Garrett. São informações internas, não casos externos nem nova auditoria do código. — [Contexto do projeto](<D:/User/Documents/projeto/ChronosInventory/docs/CONTEXTO.md>), [plano existente](<D:/User/Documents/projeto/ChronosInventory/docs/PLANO_IA.md>).

### Inferências e aplicação proposta

- Perguntar só pelo item incerto e entregar os demais: “Consultei os outros quatro. No item 2, você disse final 5005 ou 5006?”. Manter o ID pendente para uma resposta curta completar o pedido certo.
- “Quero qualquer uma dessas” expressa preferência de consulta; “essa substitui aquela?” exige ficha/regra aprovada. Sem evidência, responder “não tenho equivalência confirmada”, mesmo que ambas apareçam no catálogo.
- Na resposta, distinguir “código confirmado”, “prefixo completado pelo contexto”, “áudio duvidoso” e “falta confirmação”. Confiança de interpretação não altera saldo. Não adotar limiar numérico universal sem avaliação local.
- Uma consulta ao SQLite pode dar o saldo exato da base consultada naquele instante. Como o projeto possui máquinas e sincronização, não prometer saldo simultâneo de todas as filiais sem verificar a atualização da fonte. Mostrar origem/data da base quando relevante.
- Preservar as lições de equivalência como dados aprovados consultados a cada pergunta: esse mecanismo já documentado permite aproveitar novas regras sem publicar um instalador por lição. Implementar a nova estrutura de pedidos ainda exige uma entrega de código; fichas e conhecimento não corrigem sozinhos um interpretador que descarta itens.
- Para manter o plano gratuito, preferir uma transcrição e uma extração por mensagem, buscas locais em lote e resposta por template. Rede/cota indisponível deve preservar a pendência e oferecer texto para busca direta, sem substituir erro por “não temos”. Não há promessa de disponibilidade ilimitada nem de reconhecimento de voz offline.

**Critérios sugeridos para uma avaliação posterior, sem executar testes agora:** áudio de um minuto com mais de três pedidos; alternativas com prefixo compartilhado; prefixo ambíguo; zeros iniciais; variantes nova/reman por item; correção “5005, não, 5006”; peça desconhecida; dois códigos para o mesmo registro; sufixos diferentes com estoques distintos; falha/429 no meio do lote. Conferir pedidos, alternativas, pendências e saldos individualmente, além da resposta final.

### Lacunas

- Não foram medidos latência, consumo de cota ou precisão com mensagens da empresa. Os testes precisam usar áudio autorizado e cópia do banco com `CHRONOS_APP_DIR`, conforme as regras locais.
- Não foram verificadas permissões da conta Groq nem a atualização efetiva dos estoques entre máquinas. Não é possível garantir operação gratuita contínua ou saldo global instantâneo com as fontes públicas.
- A principal conclusão é uma adaptação técnica sustentada por exemplos inspecionáveis, não evidência de que algum fornecedor já resolveu integralmente este caso particular.
