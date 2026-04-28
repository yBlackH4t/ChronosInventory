# Changelog

Este arquivo define as notas que aparecem no updater do Chronos Inventory.
Formato recomendado:

- Um bloco por versao usando `## [X.Y.Z] - YYYY-MM-DD`
- Secoes `### Added`, `### Changed`, `### Fixed`
- Itens em lista com `- `















## [1.6.4] - 2026-04-28

### Added
- A tela `Backup` agora exibe cards de visao geral para separar melhor backup local, base oficial, servidor local e situacao operacional.
- `Comparar estoques` ganhou secoes mais claras para comparacao por servidor e comparacao manual, com destaque explicito para o snapshot `latest`.

### Changed
- `Movimentacoes`, `Relatorios` e `Etiquetas` foram reorganizadas em componentes e hooks menores, reduzindo acoplamento e facilitando manutencao futura.
- Servicos de backup, base oficial, comparacao, estoque e movimentacao foram divididos por responsabilidade, deixando o backend mais modular e previsivel.
- `README_RELEASE.md` foi atualizado para refletir o fluxo real de release, incluindo `release:doctor`, sidecar e validacoes antes do push.

### Fixed
- Corrigidos trechos com encoding quebrado em modulos legados e arquivos de configuracao que ainda exibiam textos inconsistentes.
- Ajustado o contraste de selecao e tooltips no modo escuro do dashboard, evitando blocos brancos dificeis de ler.
- Polimentos em `Backup` e `Comparar estoques` deixaram o estado visual e a leitura operacional mais confiaveis no uso diario.

## [1.6.3] - 2026-04-24

### Added
- A tela `Comparar estoques` agora exibe historico local de snapshots de comparacao, com exclusao do snapshot atual e exclusao de itens individuais do historico pela propria interface.
- `Comparar estoques` passou a mostrar status operacional mais claro do servidor local e do servidor remoto, incluindo porta, ultima confirmacao e indicacao explicita de uso do snapshot `latest`.

### Changed
- Backend passou a usar `lifespan` no FastAPI e reorganizou servicos de base oficial, comparacao, inventario e analytics para separar melhor configuracao, publicacao, historico, validacao e aplicacao.
- Paginas `Backup`, `Produtos` e `Inventario` foram fracionadas em componentes e hooks menores, reduzindo acoplamento e deixando o frontend mais seguro para evoluir.
- Dashboard e comparativo tiveram melhor divisao de componentes/chunks pesados, deixando o build mais saudavel e a manutencao mais previsivel.

### Fixed
- Correcao do startup do backend local apos o refactor da base oficial, evitando o erro `Servico local indisponivel` ao abrir o app em desenvolvimento.
- Historico de snapshots de comparacao agora aplica retencao automatica, reduzindo acumulo de arquivos antigos e confusao operacional.
- Fluxo legado baseado em `StockMovement` foi removido junto com trechos mortos e textos antigos inconsistentes nos modulos refatorados.

## [1.6.2] - 2026-04-15

### Added
- A tela `Comparar estoques` agora preserva o ultimo resultado da analise durante a sessao do app, evitando repetir a comparacao ao trocar de aba.

### Changed
- Controle do servidor local em `Backup > Base oficial` passou a usar um `switch` on/off, com atualizacao imediata do status e confirmacao real apos ligar ou desligar.

### Fixed
- Correcao do estado compartilhado do servidor local, evitando falso `Servidor parado` e o erro de `Servidor nao confirmou inicializacao` logo apos iniciar.
- Cards da area `Base oficial compartilhada` agora respeitam corretamente o modo escuro e nao ficam mais com fundo branco no tema dark.
- Resultado do comparativo de estoques deixa de sumir ao sair da aba, permanecendo visivel ate reiniciar o app ou executar uma nova verificacao.

## [1.6.1] - 2026-04-14

### Added
- Novo bloco `Transferencias externas` na dashboard, com foco exclusivo em `TRANSFERENCIA_EXTERNA` e filtro entre `Entradas externas` e `Saidas externas`.

### Changed
- Dashboard passou a mostrar transferencias externas em um formato mais operacional, combinando grafico e tabela com opcao de `Ver mais`.
- Busca de `Produtos` e de `Ativar/Inativar Itens` agora aceita `#ID` para localizar diretamente pelo ID interno, preservando numero puro para buscar codigo/nome da peca.

### Fixed
- Busca numerica deixou de misturar o ID interno com o codigo da peca, reduzindo resultado ambiguo no dia a dia.
- Consulta de transferencias externas na dashboard agora respeita corretamente o escopo selecionado usando `origem` para `SAIDA` e `destino` para `ENTRADA`.

## [1.6.0] - 2026-04-14

### Added
- Novo fluxo de `servidor local` para distribuir a base oficial na rede, com botoes para iniciar/parar o host, publicar a base atual e baixar a base de outra maquina pelo endereco do servidor.
- Novo fluxo de comparacao por `servidor remoto`: cada maquina pode publicar um snapshot local e outra maquina compara informando apenas o endereco do host, sem copiar `.db` manualmente.
- Novo `tema claro/escuro` com alternancia no topo do app e preferencia salva localmente.
- Nova exportacao `Resumo bonito de estoque` em XLSX, com abas `Resumo` e `Estoque`, totais por local (`Canoas` e `PF`) e total global de pecas.

### Changed
- Tela `Backup > Base oficial` foi reorganizada para priorizar o modo servidor, mantendo o fluxo mais natural de `ligar servidor -> publicar -> outro PC conecta -> baixa`.
- Tela `Comparar estoques` passou a priorizar comparacao por servidor remoto e manteve a comparacao manual apenas como modo avancado.
- Dashboard ficou mais operacional: o bloco inutil de `Itens sem movimentacao` saiu e entrou `Zerados com venda recente`, focado em itens ativos sem saldo e com venda real no periodo.
- Fluxo visual do app ficou mais limpo com reorganizacao da navegacao, abas em telas grandes e rolagem propria na barra lateral para nao esconder secoes administrativas.

### Fixed
- Correcao do fluxo de distribuicao/comparacao entre maquinas para nao depender mais de pasta compartilhada UNC ou de copiar o banco manualmente para a rede.
- `Backup > Base oficial` agora permite excluir a base publicada atual e snapshots historicos diretamente pela interface.
- Exportacao de `Resumo bonito` passou a exibir mensagem mais clara quando o backend local estiver desatualizado em relacao ao frontend.

## [1.5.0] - 2026-04-13

### Added
- Novo `Relatorio de itens selecionados`, com busca de produtos, selecao manual de itens e PDF mostrando `Canoas`, `PF`, `Total` e `Onde tem`.
- Novo fluxo de `Comparacao publicada na rede`: cada maquina pode publicar um snapshot da propria base e outra maquina pode comparar escolhendo essa base na lista.
- Novo bloco de `Comparacao manual` mantido como plano B na tela de comparativo, para comparar dois arquivos especificos quando necessario.

### Changed
- Tela `Comparar estoques` passou a priorizar o fluxo mais simples de snapshots publicados em rede, reaproveitando a mesma pasta compartilhada ja usada pela base oficial.
- Pagina de `Produtos` ganhou ordenacoes operacionais por `Maior/Menor estoque total`, `Maior/Menor quantidade em Canoas` e `Maior/Menor quantidade em PF`.
- Lista de itens escolhidos para relatorio continua respeitando a ordem montada pelo usuario na hora de gerar o PDF.

### Fixed
- Fluxo de comparacao entre bases deixou de depender da copia manual do `.db` para uma segunda pasta compartilhada em cada uso.
- Endpoint de relatorio agora aceita selecao explicita de produtos por ID, reduzindo risco de imprimir itens fora da lista desejada.

## [1.4.0] - 2026-04-07

### Added
- Novo `release:doctor` no fluxo de release para validar versoes, changelog e sidecar antes de gerar/publicar a nova versao.
- Historico e teste da pasta em `Base oficial compartilhada`, com comparativo entre a base local ativa e a ultima base publicada.
- Novas acoes de inventario para `Fechar sessao` e `Excluir sessao`, com confirmacao na interface.
- Novos relatorios em PDF de `Vendas reais` e `Estoque parado`.

### Changed
- Tela de inventario ficou mais operacional: resumo claro de divergencias, filtros por status, atalhos (`Ctrl+F`, `Ctrl+B`, `Ctrl+S`) e persistencia de filtros na sessao.
- `TRANSFERENCIA_EXTERNA` passou a ser aceita tambem em `ENTRADA`, permitindo registrar recebimento de mercadoria vinda de filial/matriz com `Local externo`.
- Fluxo de release no GitHub Actions agora executa validacoes previas para reduzir chance de publicar versao quebrada.

### Fixed
- Bloqueio preventivo de release quando o backend sidecar estiver desatualizado em relacao ao app.
- Publicacao da base oficial ficou mais segura, com leitura mais clara da base ativa e menor risco de distribuir banco errado ou vazio.
- Sessoes de inventario fechadas nao podem mais ser editadas, e sessoes com ajustes aplicados nao podem ser excluidas.

## [1.3.0] - 2026-04-06

### Added
- Nova area de `Base oficial compartilhada` em `Backup`, com fluxo de `publisher/consumer` para publicar uma base oficial e atualizar outras instalacoes locais pela pasta compartilhada.
- Publicacao da base oficial com manifesto (`base_oficial.json`), checksum, historico de snapshots e backup automatico antes de aplicar a base em outra maquina.
- Resumo visivel da base ativa antes de publicar, mostrando caminho do banco, quantidade de produtos, itens com estoque, movimentacoes e tamanho do arquivo.
- Botao `Remover` na tela de `Estoques` para excluir perfis locais cadastrados com confirmacao e limpeza da pasta do perfil.

### Changed
- Cadastro de produto com estoque inicial agora gera movimentacoes reais de `ENTRADA` por local (`Canoas` e/ou `PF`), fazendo o item aparecer corretamente no grafico de fluxo.
- `Top 5 saidas no periodo` passou a considerar somente vendas reais (`SAIDA` com natureza `OPERACAO_NORMAL`).
- Consulta de itens `sem movimentacao` ficou mais fiel ao periodo consultado, ignorando movimentos futuros na apuracao historica.

### Fixed
- Correcao do risco de publicar uma base vazia por engano ao usar ambiente de desenvolvimento diferente da base principal.
- Bloqueio de exclusao para perfil `Principal/default` e para o perfil atualmente ativo.
- Ajustes de robustez no fluxo de distribuicao da base oficial, com validacao de versao minima do app e restauracao segura em caso de falha.

## [1.2.7] - 2026-04-02

### Added
- Botao `Ajustar altura ao texto` no editor visual de etiquetas para reduzir corte em fontes maiores.

### Changed
- Dashboard passou a respeitar o escopo selecionado (`Ambos`, `Canoas` ou `Passo Fundo`) nos cards, distribuicao, evolucao e itens sem movimentacao.
- Datas da interface foram padronizadas para locale `pt-BR`.
- Compatibilidade entre endpoints novos e legados de analytics foi reforcada para manter frontend e backend alinhados durante update.

### Fixed
- Tooltip do grafico de fluxo corrigido: a serie verde agora aparece como `Entradas`.
- Erros simultaneos do dashboard agora sao consolidados em um unico aviso, evitando spam de notificacoes.
- Consulta de `top saidas` e rota legada de distribuicao de estoque foram corrigidas para evitar falhas no dashboard e nos testes da API.

## [1.2.6] - 2026-02-23

### Added
- Reinicio hardening no desktop: verificacao de liberacao da porta `8000` antes de reabrir o app.

### Changed
- Fluxo de `restart_app` agora faz tentativa forcada de encerramento do sidecar (`taskkill`) quando o processo permanece ativo.

### Fixed
- Correcao definitiva do loop de "reinicio pendente" quando `estoque_backend.exe` fica preso no gerenciador de tarefas.

## [1.2.5] - 2026-02-23

### Added
- Comando nativo de reinicio controlado no desktop (`restart_app`) para fechar o sidecar antes do relaunch.

### Changed
- Botao de reinicio em `Estoques` e no aviso de reinicio pendente passou a usar fluxo unico de reinicializacao.

### Fixed
- Correcao do loop de "reinicio pendente": o app agora encerra o sidecar antes de reiniciar, evitando conflito de porta `8000`.

## [1.2.4] - 2026-02-23

### Added
- Isolamento de contexto por estoque ativo no frontend, com `profileScopeKey` para separar cache/queries por perfil.
- Error boundary global no app para reduzir impacto de falhas de renderizacao e evitar tela branca total.
- Lazy loading das rotas principais com fallback de carregamento para melhorar percepcao de performance.

### Changed
- Consultas de Dashboard, Produtos e Movimentacoes passaram a incluir escopo do estoque ativo nas query keys.
- Header e layout agora exibem estoque ativo e estado de reinicio pendente de forma mais clara.
- Prefetch da sidebar passou a considerar o perfil ativo para evitar dados cruzados entre estoques.

### Fixed
- Limpeza de estados de aba e cache antigo ao trocar estoque ativo, reduzindo inconsistencias apos alternancia.
- Tratamento explicito de erro nas listagens e historicos de Produtos/Movimentacoes (com acao de tentar novamente).
- Maior robustez no fluxo de troca de perfil com invalidadacao de dados de escopo do frontend.

## [1.2.3] - 2026-02-23

### Added
- Protecao de renderizacao na tela de **Movimentacoes** para evitar tela branca total em caso de erro inesperado.
- Cobertura de teste para reativacao do estoque **Principal/default** no ciclo de perfis.

### Changed
- Tabela de **Movimentacoes** com layout adaptativo (Auto/Compacto/Detalhado) e preferencia persistida entre sessoes.
- Coluna de observacao em Movimentacoes voltou ao modo de linha unica com reticencias para melhor estabilidade.

### Fixed
- Correcao no backend para permitir ativar novamente o estoque **default** sem erro de "ID reservado".
- Mensagem de erro da tela **Estoques** ficou mais clara quando o app estiver com backend antigo.
- Ajustes de robustez no salvamento de preferencias da tela de Movimentacoes para evitar falhas em runtime.

## [1.2.2] - 2026-02-20

### Added
- Nova tela **Etiquetas** com geracao e impressao em lote (selecao multipla, copias por item e codigo de barras `CI-<id>`).
- Acao rapida em **Produtos** para abrir a geracao de etiqueta de um item especifico.
- Nova tela **Estoques** para criar e alternar perfis de base local (multiplos estoques no mesmo app).
- Novos endpoints de sistema para perfis de estoque: listar, criar e ativar (`/sistema/estoques` e `/sistema/estoques/ativo`).
- Fluxo de inventario por **modo bip** com coletor, incremento configuravel e log de leituras.

### Changed
- Inventario agora foca no fluxo operacional por leitura de etiqueta (iniciar modo bip, zerar fisico e contar item a item).
- Sidecar do desktop passa a respeitar `CHRONOS_APP_DIR` quando definido, facilitando cenarios de teste/operacao controlada.
- Nova rota legada `/entrada-nf` redireciona para **Produtos** para evitar tela quebrada.

### Fixed
- Ajuste no prefetch da tela de status de produtos para manter filtros de estoque consistentes.
- Mensagens mais acionaveis quando funcionalidades exigem backend atualizado (ex.: tela de Estoques).
- Testes de API cobrindo ciclo de vida dos perfis de estoque (listar, criar e ativar).

## [1.2.1] - 2026-02-19

### Added
- Filtro de estoque na aba **Ativar/Inativar** com opcoes: `Todos`, `Com estoque (> 0)` e `Sem estoque (= 0)`.
- Suporte a agendamento **semanal** no backup automatico, com dia da semana configuravel.

### Changed
- Endpoint `/produtos/gestao-status` passou a aceitar o parametro `has_stock` para combinar status + busca + estoque.
- Tela de backup passou a permitir escolha de frequencia (`Diario` ou `Semanal`) e dia da semana quando semanal.

### Fixed
- Correcao no fluxo de triagem para localizar itens inativados que ainda possuem saldo em estoque.
- Scheduler de backup semanal agora ignora dias fora da configuracao e evita dupla execucao no mesmo dia.

## [1.2.0] - 2026-02-19

### Added
- Backup automatico agendado com configuracao de hora/minuto e retencao por dias (7/15/30).
- Botao de "Testar restauracao" para validar backup em ambiente temporario sem tocar no banco ativo.
- Acao de rollback de dados pre-update (criacao de snapshot antes do update e restauracao assistida em caso de falha).
- Modulo de inventario com sessao de contagem, divergencia automatica e aplicacao de ajustes em lote.
- Tela "Novidades" no app com historico de versoes e highlights da release.
- Nova aba "Ativar/Inativar" para gestao rapida de status em lote (busca, filtro e selecao multipla).

### Changed
- Ajuste de estoque agora exige motivo padronizado e observacao obrigatoria.
- Fluxo de update do app passou a criar backup pre-update antes de instalar.
- Mensagens de validacao ficaram mais amigaveis para usuario final (menos erros genericos).
- Historicos de movimentacao exibem motivo de ajuste.
- Produtos inativos deixaram de aparecer na listagem principal e nos graficos/indicadores de estoque.

### Fixed
- Erro generico "Invalid request" substituido por mensagens mais acionaveis para casos comuns de validacao.
- Cadastro de produto com estoque inicial zerado agora retorna mensagem explicita de orientacao.
- Correcao de roteamento em `/produtos/status-lote` para evitar conflito com rota dinamica por `id`.
- Sessao de inventario passou a incluir somente itens ativos no momento da abertura.
- Tela de ativacao/inativacao agora mostra erro acionavel quando o backend estiver desatualizado.
- Ajustes de tipagem no frontend para eliminar erros de compilacao TypeScript durante o build.
- Correcoes de estado em telas (Backup e Produtos) para evitar atualizacoes sincronas dentro de `useEffect`.
- ESLint configurado para ignorar artefatos gerados do Tauri (`src-tauri/target`, `src-tauri/gen` e `release`).

## [1.1.5] - 2026-02-18

### Added
- Sem notas detalhadas para esta versao.

### Changed
- Atualizacao de versao sem mudancas funcionais relevantes registradas no changelog historico.

### Fixed
- Ajustes gerais de empacotamento e estabilidade sem notas tecnicas detalhadas preservadas.

## [1.1.4] - 2026-02-18

### Fixed
- Bloqueio de compatibilidade quando frontend e backend estao em versoes incompativeis.
- Validacao de versao no CI/release para evitar publicar artefatos fora de sincronia.
- Regras de movimentacao com natureza/documento/referencia para reduzir erros de validacao.

### Changed
- Processo de release com `release:bump` e checklist tecnico em `README_RELEASE.md`.
