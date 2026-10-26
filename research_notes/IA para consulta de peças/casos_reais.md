# Casos reais de IA para identificar e consultar peças

Pesquisa em 23/10/2026, em português do Brasil. Recorte: três implementações identificadas, com cinco páginas primárias abertas e lidas. Fontes do próprio cliente têm peso diferente de estudos comerciais do desenvolvedor. Não foram executados os produtos nem auditados os bancos dos casos. As datas históricas abaixo não comprovam o estado integral dos serviços em outubro de 2026.

Contexto local considerado: `docs/CONTEXTO.md` e `docs/ASSISTENTE_IA.md`, somente leitura. O pedido informa áudio longo, alternativas como `796155 5005 ou 5006`, limite atual de três códigos e necessidade de preservar variantes e saldos. Essas necessidades são do Chronos, não resultados comprovados pelos casos externos. Nenhum arquivo do aplicativo, branch, banco ou configuração secreta foi alterado.

## 1. O que a DB Cargo realmente colocou em uso com o Partium?

### Takeaway

O próprio cliente comprova uso cotidiano. Localizar a peça e mostrar quantidade atual são entregas distintas.

### Cited Findings

- **Cliente e produção:** a DB Cargo publicou em 21/11/2022 que o Partium estava implantado em seis oficinas, com cerca de 9.000 peças cadastradas. A expansão para outras unidades ainda era plano. — [DB Cargo: Mit Künstlicher Intelligenz auf Ersatzteilsuche](https://www.dbcargo.com/rail-de-de/logistik-news/mit-kuenstlicher-intelligenz-auf-ersatzteilsuche-partium-8805014).
- **Integração concreta:** busca visual e semântica em tablets combina descrições, substitutos, atributos, números SAP, fabricantes, estoque e locais de armazenagem. A identificação leva ao registro e à localização do material. — [DB Cargo](https://www.dbcargo.com/rail-de-de/logistik-news/mit-kuenstlicher-intelligenz-auf-ersatzteilsuche-partium-8805014).
- **Limite importante:** a localização já podia ser consultada; exibir estoque atual diretamente no aplicativo era descrito como desenvolvimento futuro. Não é prova de saldo ao vivo já entregue. — [DB Cargo](https://www.dbcargo.com/rail-de-de/logistik-news/mit-kuenstlicher-intelligenz-auf-ersatzteilsuche-partium-8805014).

### Inferences

- Lição para Chronos: busca aproximada ajuda a encontrar o cadastro; saldo e substituição precisam continuar vinculados a registros próprios. Similaridade não autoriza somar variantes.

### Gaps

- A publicação não identifica LLM, equivalência, confiança calibrada, pedidos com vários itens ou gratuidade. — [Escopo da publicação](https://www.dbcargo.com/rail-de-de/logistik-news/mit-kuenstlicher-intelligenz-auf-ersatzteilsuche-partium-8805014).

## 2. Como a Coca-Cola HBC relacionou reconhecimento de peças ao estoque industrial?

### Takeaway

Reconhece candidatos e devolve identificadores empresariais. Relato do fornecedor com responsáveis do cliente identificados; sem avaliação independente.

### Cited Findings

- **Implementação:** SoftwareOne, antes Crayon, descreve aplicativo de reconhecimento por imagem na Coca-Cola HBC. Retorna código SAP e unidades/locais onde a peça está estocada; usa Azure ML, armazenamento e infraestrutura Azure. Não documenta LLM. — [SoftwareOne: Coca-Cola HBC](https://www.softwareone.com/en/case-studies/emea/manufacturing/coca-cola-hbc-data-and-ai).
- **Validação delimitada:** relata 97% de acerto no primeiro resultado para **200 peças**, antes da expansão. Isso não mede 220.000 peças nem probabilidade de acerto de cada resposta. — [SoftwareOne](https://www.softwareone.com/en/case-studies/emea/manufacturing/coca-cola-hbc-data-and-ai).
- **Produção e cronologia:** texto registra 37 fábricas em setembro de 2024 e mais 11 previstas; resumo menciona 48. Expansão integral em 2025 e retorno em menos de dois anos eram projeções. — [SoftwareOne](https://www.softwareone.com/en/case-studies/emea/manufacturing/coca-cola-hbc-data-and-ai).

### Inferences

- Para Chronos, separar confiança na identificação da certeza do saldo. Um candidato provável não transforma equivalência em fato.

### Gaps

- Sem protocolo completo de teste, atualização de saldo, quantidades exatas ou confirmação da expansão final. A infraestrutura comercial descrita não sustenta promessa de custo zero. — [Limites do relato](https://www.softwareone.com/en/case-studies/emea/manufacturing/coca-cola-hbc-data-and-ai).

## 3. Como o CARMA AI consulta catálogos automotivos, e o que aproveitar no Chronos?

### Takeaway

É o caso mais próximo de uma conversa com um balconista de autopeças: esclarece o pedido antes de consultar códigos OEM. Há detalhes técnicos do desenvolvedor e anúncio do próprio operador, mas também inconsistência pública sobre disponibilidade.

### Cited Findings

- **Produto e LLM:** em 12/09/2025, a CARMA anunciou assistente disponível no painel de clientes, com GPT-4 e RAG, isto é, recuperação de informação externa para apoiar a resposta. Recebe VIN ou veículo/modelo/ano/motor, esclarece posição da peça e retorna OEM. Algumas consultas de catálogo são pagas. — [CARMA: anúncio do CARMA AI](https://carma.team/blog/carma-ai/).
- **Papel do sistema:** a AlphaDog descreve a camada que desenvolveu: n8n controla estados e chamadas; Django atende serviços; Redis/Postgres guardam estado, cache e registros. O backend consulta endpoints de catálogo para veículo, OEM, aplicação e diagramas. Pedidos incertos seguem ao especialista com contexto. — [AlphaDog: CARMA AI parts selection agent](https://alphadog.by/en/cases/carma-ai).
- **Demonstração versus evidência:** o diálogo exemplificado pela AlphaDog é explicitamente uma demonstração da lógica, não uma transcrição de produção. O desenvolvedor delimita sua autoria à camada do agente. — [AlphaDog](https://alphadog.by/en/cases/carma-ai).
- **Contradição preservada:** a página inicial ainda contém “Coming Soon” para o assistente, apesar do anúncio de disponibilidade no blog. Também anuncia atualização de estoque dos fornecedores, mas não comprova que o agente devolve quantidades exatas. Oferece plano pago para compradores. — [CARMA: página inicial](https://carma.team/); [anúncio de disponibilidade](https://carma.team/blog/carma-ai/).

### Inferences

- **Classificação justa:** implementação comercial relatada por operador e desenvolvedor; não implantação auditada. A divergência entre páginas pode ser conteúdo desatualizado, mas as fontes não permitem resolver isso. O anúncio de “base que aprende sozinha” também não explica validação ou aprendizado real. — [CARMA](https://carma.team/blog/carma-ai/); [página inicial](https://carma.team/).
- **Lição concreta:** preservar esclarecimentos e dados confirmados por pedido, consultar o catálogo por ferramentas e levar o contexto ao especialista quando houver dúvida. A documentação do CARMA descreve essa divisão de responsabilidades. — [AlphaDog](https://alphadog.by/en/cases/carma-ai).
- **Cuidado com cache:** o desenvolvedor menciona cache de catálogo por 24–30 dias. Isso não fundamenta guardar saldo por esse prazo. — [AlphaDog](https://alphadog.by/en/cases/carma-ai).

As recomendações seguintes são julgamento para o Chronos, a partir das necessidades fornecidas; **não são funcionalidades demonstradas nesses produtos**:

- Para `796155 5005 ou 5006`, preservar um pedido com duas alternativas explícitas: `796155-5005` e `796155-5006`. Consultar cada cadastro e informar os resultados separadamente; “ou” não é autorização para somar.
- Manter uma linha de acompanhamento para cada solicitação original, inclusive a quarta e seguintes. Todo item termina em encontrado, sem saldo, não identificado ou precisa confirmar. Um erro de consulta também precisa aparecer.
- Separar três perguntas na resposta: “entendi o código?”, “a equivalência foi aprovada?” e “qual saldo o banco retornou?”. Percentual inventado pelo modelo não substitui evidência por item.
- Usar as equivalências aprovadas e fichas próprias já existentes como conhecimento consultável. O modelo interpreta o pedido; identificadores, variantes e quantidades permanecem verificáveis no sistema.
- Para quantidades “ao vivo”, registrar momento e origem da consulta. Numa máquina que consome base sincronizada, distinguir saldo da cópia local de saldo atualizado na publicadora; não prometer atualidade que a sincronização não garante.
- Não copiar as tecnologias dos casos por prestígio: eles não demonstram que Chronos precise de n8n, Redis, Azure, GPT-4 ou outro serviço pago. O objetivo é aproveitar as responsabilidades bem separadas com a infraestrutura já disponível.

### Gaps

- Não há teste público de áudio em português, listas longas, alternativas por “ou”, nova/reman/montada, sufixos Garrett ou omissão silenciosa. Nenhum dos três casos valida o requisito completo do Chronos.
- Não foi demonstrado funcionamento offline com Groq gratuito, nem atualização de conhecimento sem reinstalar. Esse último requisito precisa ser verificado no fluxo de fichas/conhecimento e sincronização do próprio Chronos.
- A pesquisa não encontrou garantia pública de estoque exato por variante nesses casos. Portanto, não converter busca semântica, compatibilidade ou disponibilidade de um fornecedor em prova de soma correta.
- A amostra serve para aprender práticas e limites; não é recomendação de contratação. Não se inferiu operação gratuita a partir de bibliotecas abertas ou demonstrações.
