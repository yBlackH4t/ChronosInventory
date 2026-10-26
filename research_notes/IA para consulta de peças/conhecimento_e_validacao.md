# Conhecimento aprovado e validação de peças

## 1. Como outros desenvolvedores fazem o assistente aprender sem reinstalar?

### Takeaway

Existem implementações concretas que guardam documentação e exemplos fora do modelo e os recuperam durante cada consulta. Para o Chronos, a conclusão prática é ampliar o conhecimento aprovado que já existe, com versões e revisão humana; uma correção no histórico, sozinha, não instala uma capacidade nova nem treina os pesos do modelo. O Vanna demonstra o primeiro mecanismo; LangSmith documenta o ciclo de revisão e avaliação. [Vanna: treinamento da camada de recuperação](https://ask.vanna.ai/docs/train/); [LangSmith: revisão humana](https://docs.langchain.com/langsmith/annotation-queues).

### Cited Findings

Pesquisa realizada em 23/10/2026. As cinco famílias de fontes abaixo são primárias, abertas e lidas nesta pesquisa. São evidências de mecanismos implementados ou documentados, não uma comprovação de atendimento de peças em produção.

| Fonte/caso | O que foi verificado | Classificação e limite |
|---|---|---|
| Vanna | A API legada `vn.train` recebe estrutura de tabelas, documentação e pares pergunta–SQL. O próprio manual chama isso de treinamento da camada de recuperação sobre o LLM. | Implementação aberta e documentação do mantenedor; não confundir com ajuste dos pesos. [Manual](https://ask.vanna.ai/docs/train/). |
| Haystack/deepset | Há componentes separados para recuperar documentos por embeddings e por filtros. Os exemplos escrevem documentos no armazenamento e depois os consultam. | Documentação e demonstrações de componentes; não comprovam acerto em códigos de turbinas. [Recuperação semântica](https://docs.haystack.deepset.ai/docs/inmemoryembeddingretriever); [filtros](https://docs.haystack.deepset.ai/docs/filterretriever). |
| LangSmith/LangChain | Filas organizam avaliação humana de execuções/conversas. Datasets têm versões e podem receber exemplos revisados. | Funcionalidade documentada pelo fornecedor; não demonstra que feedback melhore automaticamente o assistente. [Filas](https://docs.langchain.com/langsmith/annotation-queues); [versões](https://docs.langchain.com/langsmith/manage-datasets). |
| SQLite | A linguagem oferece comparação por igualdade e parâmetros em consultas. | Documentação técnica do motor, não um caso de assistente. Sustenta a alternativa determinística para identidade. [Expressões SQL](https://www.sqlite.org/lang_expr.html). |
| Hugging Face/PEFT | LoRA treina matrizes de atualização e combina seus efeitos com os pesos originais congelados. | Documentação de treinamento efetivo de parâmetros; não é evidência de treinamento gratuito ou de compatibilidade com o plano do Groq. [LoRA](https://huggingface.co/docs/peft/main/en/conceptual_guides/lora). |

- **Vanna tem código concreto, não apenas uma promessa.** A implementação legada com Chroma mantém coleções de SQL, documentação e DDL, permite acrescentar pares pergunta–SQL, listar/remover exemplos e recuperar perguntas semelhantes. Há opção de armazenamento persistente. Isso materializa uma memória externa editável. [Código do mantenedor](https://github.com/vanna-ai/vanna/blob/main/src/vanna/legacy/chromadb/chromadb_vector.py).
- **Há um limite de manutenção importante:** o repositório Vanna foi arquivado pelo proprietário em 29/03/2026. Seu README apresenta uma versão 2.0 reescrita e uma API diferente da legada. As chamadas `vn.train` são referência do mecanismo legado, não uma receita verificada para instalar a API 2.0. A expressão “production-ready” no README é uma afirmação do fornecedor; não comprova uma implantação em cliente. [Repositório e aviso de arquivamento](https://github.com/vanna-ai/vanna).
- **A qualidade dos exemplos importa.** O guia do Vanna recomenda pares pergunta–SQL sabidamente corretos e atribui a eles grande influência na precisão. Não apresenta nessa página uma avaliação independente que permita prometer determinado ganho ao Chronos. [Orientação dos mantenedores](https://ask.vanna.ai/docs/training-advice/).
- **Contexto local já disponível:** o plano do Chronos registra equivalências/fichas editáveis e sincronizáveis, mas informa que exemplos de interpretação e pedidos completos ainda precisam de implementação. Também documenta o descarte do quarto código e a perda da segunda alternativa em “796155 5005 ou 5006”. Essa informação vem do projeto, não de teste novo desta pesquisa. [Plano local, seção iniciada na linha 20](D:/User/Documents/projeto/ChronosInventory/docs/PLANO_IA.md:20).

### Inferences

As recomendações seguintes são adaptações ao Chronos, não recursos já implementados ou resultados medidos:

- **Aprender por dados:** salvar um exemplo aprovado com frase original, interpretação esperada, autor, justificativa, versão e estado de aprovação. O interpretador consulta os exemplos pertinentes em tempo de execução. Esse é o princípio demonstrado pelo Vanna; não exige adotar o Vanna nem permitir SQL livre gerado por IA. [Referência do mecanismo](https://ask.vanna.ai/docs/train/).
- **Separar três coisas:** equivalência técnica aprovada pertence ao cadastro estruturado; ficha/descritivo pode ajudar a recuperar contexto; exemplo ensina como interpretar uma frase. Encontrar os três no mesmo contexto não transforma automaticamente um deles em outro. A separação entre filtros e relevância no Haystack ilustra essa distinção. [Filtros](https://docs.haystack.deepset.ai/docs/filterretriever); [embeddings](https://docs.haystack.deepset.ai/docs/inmemoryembeddingretriever).
- **Memória não é fine-tuning:** registrar “quando ele disser X, interpretar Y” altera o contexto disponível se o programa realmente o consultar. LoRA, por sua vez, envolve treinamento de matrizes de parâmetros. Para novas equivalências e exemplos locais, priorizar dados revisáveis e reversíveis; só investigar ajuste de modelo depois de demonstrar uma falha persistente de interpretação em avaliações. [Vanna](https://ask.vanna.ai/docs/train/); [PEFT](https://huggingface.co/docs/peft/main/en/conceptual_guides/lora).

### Gaps

- Não foi localizado, neste recorte, um cliente de produção com evidência primária de cobertura integral de pedidos de peças em português, quantidades corretas e atualização por ensinamentos. Não apresentar os tutoriais como tal.
- Não foram aferidos custo operacional, latência, desempenho local no Windows ou compatibilidade dessas bibliotecas com o Groq do Chronos. Código aberto não prova operação gratuita; exemplos podem depender de inferência, embeddings, armazenamento ou serviços contratados.
- As páginas são documentação viva; o guia PEFT consultado aponta para `main`. Esta pesquisa verifica o conteúdo acessível, sem reproduzir versões instaladas ou testar os exemplos.

## 2. Como combinar conhecimento recuperado com código exato e estoque atual?

### Takeaway

Busca semântica oferece documentos relevantes; não estabelece identidade de peça. A recomendação para o Chronos é usar contexto recuperado para interpretação e explicação, e resolver produto, variante e saldo por regras explícitas e consultas determinísticas ao banco disponível. A distinção entre relevância e filtro é visível no Haystack; a igualdade parametrizada existe no SQLite. [Haystack](https://docs.haystack.deepset.ai/docs/inmemoryembeddingretriever); [SQLite](https://www.sqlite.org/lang_expr.html).

### Cited Findings

- O `InMemoryEmbeddingRetriever` compara embeddings da pergunta e dos documentos, devolvendo os mais relevantes. Aceita filtros e `top_k`, que limita a quantidade de documentos recuperados. Não documenta uma certificação de identidade comercial de peça nem uma probabilidade calibrada de equivalência. [Documentação do componente](https://docs.haystack.deepset.ai/docs/inmemoryembeddingretriever).
- O `FilterRetriever` retorna documentos que atendem aos filtros e não atribui pontuação nem ordenação por similaridade. A documentação mostra filtro por igualdade de metadado e alerta que, sem filtros, a quantidade de documentos pode sobrecarregar componentes posteriores. [Documentação e exemplo](https://docs.haystack.deepset.ai/docs/filterretriever).
- SQLite diferencia igualdade (`=`/`==`) de operadores como `LIKE` e permite parâmetros vinculados. Esses recursos não definem a regra de equivalência de turbinas: ela pertence à aplicação e aos seus dados. [Operadores e parâmetros](https://www.sqlite.org/lang_expr.html).
- O contexto do projeto relata que `796155-5005` recebia indevidamente uma unidade de `796155-5011` por expansão do prefixo; a correção no código ainda precisava ser validada no app instalado. Não houve acesso a banco nesta pesquisa. [Contexto local, seção 5](D:/User/Documents/projeto/ChronosInventory/docs/CONTEXTO.md).

### Inferences

Critérios propostos para o Chronos, com base na separação entre recuperação, filtro e consulta estruturada acima:

1. **Representar cada pedido.** “796155 5005 ou 5006” deve conservar um pedido com duas alternativas explícitas: `796155-5005` e `796155-5006`. O “ou” não declara equivalência técnica. Outro código ligado por “e” inicia outro pedido. A interpretação precisa preservar o trecho que sustenta cada referência. Essa necessidade já aparece no plano local. [Plano](D:/User/Documents/projeto/ChronosInventory/docs/PLANO_IA.md:31).
2. **Resolver identidade por inteiro.** Buscar o código completo normalizado e a marca, chegando aos IDs dos produtos e variantes. Um prefixo pode localizar candidatos para esclarecimento, sem autorizar a inclusão automática de todos os sufixos no saldo. Usar parâmetros e comparação definida pela aplicação; manter código como identificador textual, preservando dígitos e sufixos. [Base técnica](https://www.sqlite.org/lang_expr.html).
3. **Usar o conhecimento com condições.** Cada relação aprovada precisa conservar tipo, direção quando aplicável, ressalvas e fonte. “Similar” não deve virar “igual”; “diferente” deve impedir a sugestão indevida. Mesmo uma equivalência aprovada não autoriza, por si só, juntar saldos de variantes ou contar duas vezes um produto. Esta é uma regra de negócio proposta; a documentação de recuperação não a fornece pronta. [Distinção técnica entre filtro e ranking](https://docs.haystack.deepset.ai/docs/filterretriever).
4. **Consultar saldo na hora.** Depois da resolução, buscar quantidade por produto, condição e filial no banco, sem memorizar unidades em exemplos ou fichas. Somar apenas conjuntos explicitamente autorizados, com IDs deduplicados: dois caminhos de equivalência que chegam ao mesmo produto não representam duas unidades. Manter as alternativas em linhas próprias. [Suporte para consulta estruturada](https://www.sqlite.org/lang_expr.html).
5. **Explicar a confiança por item.** Preferir estados sustentados por evidência: “código exato localizado”, “equivalência aprovada”, “possível aplicação; confirmar” e “referência ambígua”. Separar certeza da leitura/interpretação, certeza da identidade e atualidade do saldo. Não apresentar a pontuação de embedding como “95% de certeza de que serve”. [O componente mede relevância](https://docs.haystack.deepset.ai/docs/inmemoryembeddingretriever).
6. **Expor limites de atualidade e cobertura.** Em uma máquina offline, “saldo atual” deve significar saldo do banco consultado, com indicação da última sincronização quando isso importar. Cada pedido precisa terminar respondido, sem cadastro, com falha explícita ou pedindo esclarecimento; não desaparecer. Limite de documentos de RAG não pode virar limite silencioso de peças atendidas. [Limite `top_k`](https://docs.haystack.deepset.ai/docs/inmemoryembeddingretriever); [requisito local de cobertura](D:/User/Documents/projeto/ChronosInventory/docs/PLANO_IA.md:40).

### Gaps

- Nenhuma fonte consultada prova que similaridade semântica resolve equivalência Garrett/Holset/BorgWarner. Não foi validada equivalência entre quaisquer códigos citados.
- Não houve medição de confiança, auditoria da sincronização ou conferência de estoque real. A execução determinística também precisa de regras corretas e dados atualizados; não garante acerto por si só.
- Os exemplos com os códigos são casos de aceitação sugeridos, não uma afirmação de disponibilidade ou de intercambialidade.

## 3. Como aprovar ensinamentos, detectar regressões e decidir quando atualizar o app?

### Takeaway

O ciclo documentado é coletar exemplos, revisar, versionar e comparar resultados; isso é diferente de aceitar toda correção como verdade. A proposta para o Chronos é publicar conhecimento aprovado como dados e avaliar cobertura, identidade e quantidade antes de ativá-lo; mudanças na capacidade do interpretador e correções do executor continuam sendo software. [Revisão humana](https://docs.langchain.com/langsmith/annotation-queues); [datasets versionados](https://docs.langchain.com/langsmith/manage-datasets).

### Cited Findings

- LangSmith documenta filas com critérios de revisão, feedback humano e encaminhamento de execuções revisadas a datasets. Há revisão de uma execução e de conversas completas. [Filas de anotação](https://docs.langchain.com/langsmith/annotation-queues).
- Adicionar, editar ou excluir exemplos cria uma nova versão do dataset. É possível atribuir tags, como `prod`, e executar avaliações sobre versões específicas. Isso versiona o conjunto de avaliação; não significa publicar automaticamente conhecimento em outro aplicativo. [Gerenciamento de datasets](https://docs.langchain.com/langsmith/manage-datasets).
- A documentação distingue avaliação offline, com exemplos e referências, de avaliação online sobre execuções. Também oferece verificadores por código, humanos e por LLM; os verificadores por código são funções determinísticas, e o uso de LLM como juiz requer revisão cuidadosa. [Conceitos de avaliação](https://docs.langchain.com/langsmith/evaluation-concepts).

### Inferences

Fluxo recomendado, adaptando esses mecanismos ao conhecimento local do Chronos:

- **Proposta → revisão do dono → avaliação → aprovação → distribuição.** Registrar quem ensinou, o que mudou, justificativa, versão anterior e quais clientes conseguem ler o formato. Uma correção pode gerar um exemplo candidato; não deve virar equivalência técnica automaticamente. A revisão separada é inspirada nas filas documentadas. [Referência](https://docs.langchain.com/langsmith/annotation-queues).
- **Dois conjuntos separados.** Exemplos usados para orientar o interpretador e perguntas reservadas para medir generalização precisam ser distinguíveis. Acrescentar variações não ensinadas literalmente, além de reproduzir o erro original. Fixar versões de conhecimento, exemplos, modelo e app ao comparar resultados. [Avaliação e versões](https://docs.langchain.com/langsmith/evaluation-concepts); [dataset](https://docs.langchain.com/langsmith/manage-datasets).
- **Falhas objetivas devem ter checagem objetiva.** Para cobertura e saldo, comparar estruturas e IDs/quantidades esperados em uma cópia controlada do banco. Revisão humana julga interpretação e ressalvas; um LLM juiz não deve ser a única autoridade sobre aritmética ou intercambialidade. [Verificadores por código e revisão](https://docs.langchain.com/langsmith/evaluation-concepts).

Matriz mínima proposta de aceitação; não representa resultados já obtidos:

| Risco | Caso para avaliação | O que deve ser conferido |
|---|---|---|
| Pedido descartado | Quatro ou mais peças, com item no fim da mensagem | Todos os pedidos anotados pelo especialista têm um resultado ou uma pendência explícita; medir por item e pela mensagem inteira. |
| Alternativa perdida | “796155 5005 ou 5006” | Ambas as referências no mesmo grupo; nenhuma equivalência inferida a partir de “ou”. |
| Falsa equivalência | Mesma família, sufixos distintos; regra negativa aprovada | Nenhuma expansão indevida; a proibição ensinada continua valendo após outra atualização. |
| Saldo somado errado | Produtos com saldos diferentes; dois vínculos para o mesmo ID | Quantidade exata por produto/filial/condição; nenhuma duplicação em joins ou caminhos de relação. |
| Condição misturada | Uma peça nova, outra reman e uma terceira montada | Cada condição permanece ligada ao pedido correto. |
| Ambiguidade | Trecho de transcrição permite dois finais de código | Pede confirmação ou exibe a dúvida; não escolhe a opção apenas porque há estoque. |
| Regra contextual generalizada | Exemplo correto só para determinado motor/aplicação | Não aplica a correção a contexto diferente sem base aprovada. |
| Conhecimento/saldo desatualizado | Regra revogada; movimento após uma consulta anterior | Não reutiliza a regra revogada nem uma quantidade memorizada; identifica a versão/base consultada. |

A matriz é uma recomendação específica deste estudo, inspirada em avaliação com referências e checagens determinísticas, e nos erros registrados no plano local. Meta proposta: zero omissões silenciosas, falsas equivalências e divergências de quantidade no conjunto crítico de regressão; isso não equivale a garantir ausência de erros fora dele. [Métodos](https://docs.langchain.com/langsmith/evaluation-concepts); [problemas locais](D:/User/Documents/projeto/ChronosInventory/docs/PLANO_IA.md:20).

| Mudança no Chronos | Reinstalar/atualizar software? | Condição proposta |
|---|---|---|
| Aprovar equivalência ou editar ficha já suportada | Não por ensinamento | O app já sabe ler o formato; publicar/sincronizar a versão aprovada. |
| Acrescentar exemplo de frase e interpretação | Não, depois de existir suporte | O interpretador precisa carregar exemplos externos e aplicar a versão aprovada. Hoje essa ampliação ainda consta como pendente. |
| Corrigir limite de três códigos, grupos de alternativas, validação e soma | Sim, atualização inicial | São capacidades e correções do código, não novos fatos de catálogo. |
| Novo tipo de relação, schema incompatível ou migração | Sim, quando o leitor atual não suporta | Um arquivo de conhecimento não instala um novo executor. |
| Trocar modelo ou instruções externas já suportadas | Pode dispensar reinstalação | Ainda exige compatibilidade e reavaliação; não é um simples ensinamento de domínio. |

Essa separação é uma proposta de aplicação do padrão de memória externa demonstrado no Vanna e coincide com a distinção já registrada no plano do Chronos. [Memória editável implementada](https://github.com/vanna-ai/vanna/blob/main/src/vanna/legacy/chromadb/chromadb_vector.py); [atualização inicial prevista](D:/User/Documents/projeto/ChronosInventory/docs/PLANO_IA.md:52).

### Gaps

- Não há evidência nas páginas lidas de que receber feedback, guardar histórico ou clicar em aprovação altere automaticamente os pesos de um modelo. Também não há garantia de segurança ou de melhora universal após acrescentar exemplos.
- Não foi verificado suporte a fine-tuning ou hospedagem de adaptadores no plano gratuito do Groq. Não recomendar esse caminho como gratuito ou disponível com base na documentação do PEFT.
- LangSmith é aqui referência de método, não recomendação de contratar sua plataforma ou enviar dados da empresa. Não foram pesquisados preços ou limites de contratação. O mesmo cuidado vale para serviços relacionados ao Vanna e ao Haystack.
- Esta entrega é pesquisa: somente este arquivo foi criado. Não foram alterados app, branch, banco, configuração secreta ou documentação de estado; não foram executados testes da aplicação.
