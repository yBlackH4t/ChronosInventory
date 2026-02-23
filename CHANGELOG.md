# Changelog

Este arquivo define as notas que aparecem no updater do Chronos Inventory.
Formato recomendado:

- Um bloco por versao usando `## [X.Y.Z] - YYYY-MM-DD`
- Secoes `### Added`, `### Changed`, `### Fixed`
- Itens em lista com `- `







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
- TODO

### Changed
- TODO

### Fixed
- TODO

## [1.1.4] - 2026-02-18

### Fixed
- Bloqueio de compatibilidade quando frontend e backend estao em versoes incompativeis.
- Validacao de versao no CI/release para evitar publicar artefatos fora de sincronia.
- Regras de movimentacao com natureza/documento/referencia para reduzir erros de validacao.

### Changed
- Processo de release com `release:bump` e checklist tecnico em `README_RELEASE.md`.
