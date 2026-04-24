/* Arquivo gerado automaticamente por frontend/scripts/sync_changelog.mjs */
/* Nao edite manualmente: atualize CHANGELOG.md e rode npm run changelog:sync */

export type ReleaseEntry = {
  version: string;
  date: string;
  title: string;
  highlights: string[];
};

export const RELEASE_ENTRIES: ReleaseEntry[] = [
  {
    "version": "1.6.3",
    "date": "2026-04-24",
    "title": "Melhorias e correcoes",
    "highlights": [
      "Novo: A tela Comparar estoques agora exibe historico local de snapshots de comparacao, com exclusao do snapshot atual e exclusao de itens individuais do historico pela propria interface.",
      "Novo: Comparar estoques passou a mostrar status operacional mais claro do servidor local e do servidor remoto, incluindo porta, ultima confirmacao e indicacao explicita de uso do snapshot latest.",
      "Mudanca: Backend passou a usar lifespan no FastAPI e reorganizou servicos de base oficial, comparacao, inventario e analytics para separar melhor configuracao, publicacao, historico, validacao e aplicacao.",
      "Mudanca: Paginas Backup, Produtos e Inventario foram fracionadas em componentes e hooks menores, reduzindo acoplamento e deixando o frontend mais seguro para evoluir.",
      "Mudanca: Dashboard e comparativo tiveram melhor divisao de componentes/chunks pesados, deixando o build mais saudavel e a manutencao mais previsivel.",
      "Correcao: Correcao do startup do backend local apos o refactor da base oficial, evitando o erro Servico local indisponivel ao abrir o app em desenvolvimento.",
      "Correcao: Historico de snapshots de comparacao agora aplica retencao automatica, reduzindo acumulo de arquivos antigos e confusao operacional.",
      "Correcao: Fluxo legado baseado em StockMovement foi removido junto com trechos mortos e textos antigos inconsistentes nos modulos refatorados."
    ]
  },
  {
    "version": "1.6.2",
    "date": "2026-04-15",
    "title": "Melhorias e correcoes",
    "highlights": [
      "Novo: A tela Comparar estoques agora preserva o ultimo resultado da analise durante a sessao do app, evitando repetir a comparacao ao trocar de aba.",
      "Mudanca: Controle do servidor local em Backup > Base oficial passou a usar um switch on/off, com atualizacao imediata do status e confirmacao real apos ligar ou desligar.",
      "Correcao: Correcao do estado compartilhado do servidor local, evitando falso Servidor parado e o erro de Servidor nao confirmou inicializacao logo apos iniciar.",
      "Correcao: Cards da area Base oficial compartilhada agora respeitam corretamente o modo escuro e nao ficam mais com fundo branco no tema dark.",
      "Correcao: Resultado do comparativo de estoques deixa de sumir ao sair da aba, permanecendo visivel ate reiniciar o app ou executar uma nova verificacao."
    ]
  },
  {
    "version": "1.6.1",
    "date": "2026-04-14",
    "title": "Melhorias e correcoes",
    "highlights": [
      "Novo: Novo bloco Transferencias externas na dashboard, com foco exclusivo em TRANSFERENCIA_EXTERNA e filtro entre Entradas externas e Saidas externas.",
      "Mudanca: Dashboard passou a mostrar transferencias externas em um formato mais operacional, combinando grafico e tabela com opcao de Ver mais.",
      "Mudanca: Busca de Produtos e de Ativar/Inativar Itens agora aceita #ID para localizar diretamente pelo ID interno, preservando numero puro para buscar codigo/nome da peca.",
      "Correcao: Busca numerica deixou de misturar o ID interno com o codigo da peca, reduzindo resultado ambiguo no dia a dia.",
      "Correcao: Consulta de transferencias externas na dashboard agora respeita corretamente o escopo selecionado usando origem para SAIDA e destino para ENTRADA."
    ]
  },
  {
    "version": "1.6.0",
    "date": "2026-04-14",
    "title": "Melhorias e correcoes",
    "highlights": [
      "Novo: Novo fluxo de servidor local para distribuir a base oficial na rede, com botoes para iniciar/parar o host, publicar a base atual e baixar a base de outra maquina pelo endereco do servidor.",
      "Novo: Novo fluxo de comparacao por servidor remoto: cada maquina pode publicar um snapshot local e outra maquina compara informando apenas o endereco do host, sem copiar .db manualmente.",
      "Novo: Novo tema claro/escuro com alternancia no topo do app e preferencia salva localmente.",
      "Novo: Nova exportacao Resumo bonito de estoque em XLSX, com abas Resumo e Estoque, totais por local (Canoas e PF) e total global de pecas.",
      "Mudanca: Tela Backup > Base oficial foi reorganizada para priorizar o modo servidor, mantendo o fluxo mais natural de ligar servidor -> publicar -> outro PC conecta -> baixa.",
      "Mudanca: Tela Comparar estoques passou a priorizar comparacao por servidor remoto e manteve a comparacao manual apenas como modo avancado.",
      "Mudanca: Dashboard ficou mais operacional: o bloco inutil de Itens sem movimentacao saiu e entrou Zerados com venda recente, focado em itens ativos sem saldo e com venda real no periodo.",
      "Mudanca: Fluxo visual do app ficou mais limpo com reorganizacao da navegacao, abas em telas grandes e rolagem propria na barra lateral para nao esconder secoes administrativas.",
      "Correcao: Correcao do fluxo de distribuicao/comparacao entre maquinas para nao depender mais de pasta compartilhada UNC ou de copiar o banco manualmente para a rede.",
      "Correcao: Backup > Base oficial agora permite excluir a base publicada atual e snapshots historicos diretamente pela interface.",
      "Correcao: Exportacao de Resumo bonito passou a exibir mensagem mais clara quando o backend local estiver desatualizado em relacao ao frontend."
    ]
  },
  {
    "version": "1.5.0",
    "date": "2026-04-13",
    "title": "Melhorias e correcoes",
    "highlights": [
      "Novo: Novo Relatorio de itens selecionados, com busca de produtos, selecao manual de itens e PDF mostrando Canoas, PF, Total e Onde tem.",
      "Novo: Novo fluxo de Comparacao publicada na rede: cada maquina pode publicar um snapshot da propria base e outra maquina pode comparar escolhendo essa base na lista.",
      "Novo: Novo bloco de Comparacao manual mantido como plano B na tela de comparativo, para comparar dois arquivos especificos quando necessario.",
      "Mudanca: Tela Comparar estoques passou a priorizar o fluxo mais simples de snapshots publicados em rede, reaproveitando a mesma pasta compartilhada ja usada pela base oficial.",
      "Mudanca: Pagina de Produtos ganhou ordenacoes operacionais por Maior/Menor estoque total, Maior/Menor quantidade em Canoas e Maior/Menor quantidade em PF.",
      "Mudanca: Lista de itens escolhidos para relatorio continua respeitando a ordem montada pelo usuario na hora de gerar o PDF.",
      "Correcao: Fluxo de comparacao entre bases deixou de depender da copia manual do .db para uma segunda pasta compartilhada em cada uso.",
      "Correcao: Endpoint de relatorio agora aceita selecao explicita de produtos por ID, reduzindo risco de imprimir itens fora da lista desejada."
    ]
  },
  {
    "version": "1.4.0",
    "date": "2026-04-07",
    "title": "Melhorias e correcoes",
    "highlights": [
      "Novo: Novo release:doctor no fluxo de release para validar versoes, changelog e sidecar antes de gerar/publicar a nova versao.",
      "Novo: Historico e teste da pasta em Base oficial compartilhada, com comparativo entre a base local ativa e a ultima base publicada.",
      "Novo: Novas acoes de inventario para Fechar sessao e Excluir sessao, com confirmacao na interface.",
      "Novo: Novos relatorios em PDF de Vendas reais e Estoque parado.",
      "Mudanca: Tela de inventario ficou mais operacional: resumo claro de divergencias, filtros por status, atalhos (Ctrl+F, Ctrl+B, Ctrl+S) e persistencia de filtros na sessao.",
      "Mudanca: TRANSFERENCIA_EXTERNA passou a ser aceita tambem em ENTRADA, permitindo registrar recebimento de mercadoria vinda de filial/matriz com Local externo.",
      "Mudanca: Fluxo de release no GitHub Actions agora executa validacoes previas para reduzir chance de publicar versao quebrada.",
      "Correcao: Bloqueio preventivo de release quando o backend sidecar estiver desatualizado em relacao ao app.",
      "Correcao: Publicacao da base oficial ficou mais segura, com leitura mais clara da base ativa e menor risco de distribuir banco errado ou vazio.",
      "Correcao: Sessoes de inventario fechadas nao podem mais ser editadas, e sessoes com ajustes aplicados nao podem ser excluidas."
    ]
  },
  {
    "version": "1.3.0",
    "date": "2026-04-06",
    "title": "Melhorias e correcoes",
    "highlights": [
      "Novo: Nova area de Base oficial compartilhada em Backup, com fluxo de publisher/consumer para publicar uma base oficial e atualizar outras instalacoes locais pela pasta compartilhada.",
      "Novo: Publicacao da base oficial com manifesto (base_oficial.json), checksum, historico de snapshots e backup automatico antes de aplicar a base em outra maquina.",
      "Novo: Resumo visivel da base ativa antes de publicar, mostrando caminho do banco, quantidade de produtos, itens com estoque, movimentacoes e tamanho do arquivo.",
      "Novo: Botao Remover na tela de Estoques para excluir perfis locais cadastrados com confirmacao e limpeza da pasta do perfil.",
      "Mudanca: Cadastro de produto com estoque inicial agora gera movimentacoes reais de ENTRADA por local (Canoas e/ou PF), fazendo o item aparecer corretamente no grafico de fluxo.",
      "Mudanca: Top 5 saidas no periodo passou a considerar somente vendas reais (SAIDA com natureza OPERACAO_NORMAL).",
      "Mudanca: Consulta de itens sem movimentacao ficou mais fiel ao periodo consultado, ignorando movimentos futuros na apuracao historica.",
      "Correcao: Correcao do risco de publicar uma base vazia por engano ao usar ambiente de desenvolvimento diferente da base principal.",
      "Correcao: Bloqueio de exclusao para perfil Principal/default e para o perfil atualmente ativo.",
      "Correcao: Ajustes de robustez no fluxo de distribuicao da base oficial, com validacao de versao minima do app e restauracao segura em caso de falha."
    ]
  },
  {
    "version": "1.2.7",
    "date": "2026-04-02",
    "title": "Melhorias e correcoes",
    "highlights": [
      "Novo: Botao Ajustar altura ao texto no editor visual de etiquetas para reduzir corte em fontes maiores.",
      "Mudanca: Dashboard passou a respeitar o escopo selecionado (Ambos, Canoas ou Passo Fundo) nos cards, distribuicao, evolucao e itens sem movimentacao.",
      "Mudanca: Datas da interface foram padronizadas para locale pt-BR.",
      "Mudanca: Compatibilidade entre endpoints novos e legados de analytics foi reforcada para manter frontend e backend alinhados durante update.",
      "Correcao: Tooltip do grafico de fluxo corrigido: a serie verde agora aparece como Entradas.",
      "Correcao: Erros simultaneos do dashboard agora sao consolidados em um unico aviso, evitando spam de notificacoes.",
      "Correcao: Consulta de top saidas e rota legada de distribuicao de estoque foram corrigidas para evitar falhas no dashboard e nos testes da API."
    ]
  },
  {
    "version": "1.2.6",
    "date": "2026-02-23",
    "title": "Melhorias e correcoes",
    "highlights": [
      "Novo: Reinicio hardening no desktop: verificacao de liberacao da porta 8000 antes de reabrir o app.",
      "Mudanca: Fluxo de restart_app agora faz tentativa forcada de encerramento do sidecar (taskkill) quando o processo permanece ativo.",
      "Correcao: Correcao definitiva do loop de \"reinicio pendente\" quando estoque_backend.exe fica preso no gerenciador de tarefas."
    ]
  },
  {
    "version": "1.2.5",
    "date": "2026-02-23",
    "title": "Melhorias e correcoes",
    "highlights": [
      "Novo: Comando nativo de reinicio controlado no desktop (restart_app) para fechar o sidecar antes do relaunch.",
      "Mudanca: Botao de reinicio em Estoques e no aviso de reinicio pendente passou a usar fluxo unico de reinicializacao.",
      "Correcao: Correcao do loop de \"reinicio pendente\": o app agora encerra o sidecar antes de reiniciar, evitando conflito de porta 8000."
    ]
  },
  {
    "version": "1.2.4",
    "date": "2026-02-23",
    "title": "Melhorias e correcoes",
    "highlights": [
      "Novo: Isolamento de contexto por estoque ativo no frontend, com profileScopeKey para separar cache/queries por perfil.",
      "Novo: Error boundary global no app para reduzir impacto de falhas de renderizacao e evitar tela branca total.",
      "Novo: Lazy loading das rotas principais com fallback de carregamento para melhorar percepcao de performance.",
      "Mudanca: Consultas de Dashboard, Produtos e Movimentacoes passaram a incluir escopo do estoque ativo nas query keys.",
      "Mudanca: Header e layout agora exibem estoque ativo e estado de reinicio pendente de forma mais clara.",
      "Mudanca: Prefetch da sidebar passou a considerar o perfil ativo para evitar dados cruzados entre estoques.",
      "Correcao: Limpeza de estados de aba e cache antigo ao trocar estoque ativo, reduzindo inconsistencias apos alternancia.",
      "Correcao: Tratamento explicito de erro nas listagens e historicos de Produtos/Movimentacoes (com acao de tentar novamente).",
      "Correcao: Maior robustez no fluxo de troca de perfil com invalidadacao de dados de escopo do frontend."
    ]
  },
  {
    "version": "1.2.3",
    "date": "2026-02-23",
    "title": "Melhorias e correcoes",
    "highlights": [
      "Novo: Protecao de renderizacao na tela de Movimentacoes para evitar tela branca total em caso de erro inesperado.",
      "Novo: Cobertura de teste para reativacao do estoque Principal/default no ciclo de perfis.",
      "Mudanca: Tabela de Movimentacoes com layout adaptativo (Auto/Compacto/Detalhado) e preferencia persistida entre sessoes.",
      "Mudanca: Coluna de observacao em Movimentacoes voltou ao modo de linha unica com reticencias para melhor estabilidade.",
      "Correcao: Correcao no backend para permitir ativar novamente o estoque default sem erro de \"ID reservado\".",
      "Correcao: Mensagem de erro da tela Estoques ficou mais clara quando o app estiver com backend antigo.",
      "Correcao: Ajustes de robustez no salvamento de preferencias da tela de Movimentacoes para evitar falhas em runtime."
    ]
  },
  {
    "version": "1.2.2",
    "date": "2026-02-20",
    "title": "Melhorias e correcoes",
    "highlights": [
      "Novo: Nova tela Etiquetas com geracao e impressao em lote (selecao multipla, copias por item e codigo de barras CI-<id>).",
      "Novo: Acao rapida em Produtos para abrir a geracao de etiqueta de um item especifico.",
      "Novo: Nova tela Estoques para criar e alternar perfis de base local (multiplos estoques no mesmo app).",
      "Novo: Novos endpoints de sistema para perfis de estoque: listar, criar e ativar (/sistema/estoques e /sistema/estoques/ativo).",
      "Novo: Fluxo de inventario por modo bip com coletor, incremento configuravel e log de leituras.",
      "Mudanca: Inventario agora foca no fluxo operacional por leitura de etiqueta (iniciar modo bip, zerar fisico e contar item a item).",
      "Mudanca: Sidecar do desktop passa a respeitar CHRONOS_APP_DIR quando definido, facilitando cenarios de teste/operacao controlada.",
      "Mudanca: Nova rota legada /entrada-nf redireciona para Produtos para evitar tela quebrada.",
      "Correcao: Ajuste no prefetch da tela de status de produtos para manter filtros de estoque consistentes.",
      "Correcao: Mensagens mais acionaveis quando funcionalidades exigem backend atualizado (ex.: tela de Estoques).",
      "Correcao: Testes de API cobrindo ciclo de vida dos perfis de estoque (listar, criar e ativar)."
    ]
  },
  {
    "version": "1.2.1",
    "date": "2026-02-19",
    "title": "Melhorias e correcoes",
    "highlights": [
      "Novo: Filtro de estoque na aba Ativar/Inativar com opcoes: Todos, Com estoque (> 0) e Sem estoque (= 0).",
      "Novo: Suporte a agendamento semanal no backup automatico, com dia da semana configuravel.",
      "Mudanca: Endpoint /produtos/gestao-status passou a aceitar o parametro has_stock para combinar status + busca + estoque.",
      "Mudanca: Tela de backup passou a permitir escolha de frequencia (Diario ou Semanal) e dia da semana quando semanal.",
      "Correcao: Correcao no fluxo de triagem para localizar itens inativados que ainda possuem saldo em estoque.",
      "Correcao: Scheduler de backup semanal agora ignora dias fora da configuracao e evita dupla execucao no mesmo dia."
    ]
  },
  {
    "version": "1.2.0",
    "date": "2026-02-19",
    "title": "Melhorias e correcoes",
    "highlights": [
      "Novo: Backup automatico agendado com configuracao de hora/minuto e retencao por dias (7/15/30).",
      "Novo: Botao de \"Testar restauracao\" para validar backup em ambiente temporario sem tocar no banco ativo.",
      "Novo: Acao de rollback de dados pre-update (criacao de snapshot antes do update e restauracao assistida em caso de falha).",
      "Novo: Modulo de inventario com sessao de contagem, divergencia automatica e aplicacao de ajustes em lote.",
      "Novo: Tela \"Novidades\" no app com historico de versoes e highlights da release.",
      "Novo: Nova aba \"Ativar/Inativar\" para gestao rapida de status em lote (busca, filtro e selecao multipla).",
      "Mudanca: Ajuste de estoque agora exige motivo padronizado e observacao obrigatoria.",
      "Mudanca: Fluxo de update do app passou a criar backup pre-update antes de instalar.",
      "Mudanca: Mensagens de validacao ficaram mais amigaveis para usuario final (menos erros genericos).",
      "Mudanca: Historicos de movimentacao exibem motivo de ajuste.",
      "Mudanca: Produtos inativos deixaram de aparecer na listagem principal e nos graficos/indicadores de estoque.",
      "Correcao: Erro generico \"Invalid request\" substituido por mensagens mais acionaveis para casos comuns de validacao."
    ]
  },
  {
    "version": "1.1.5",
    "date": "2026-02-18",
    "title": "Atualizacao de versao",
    "highlights": [
      "Sem notas detalhadas para esta versao."
    ]
  },
  {
    "version": "1.1.4",
    "date": "2026-02-18",
    "title": "Correcao e estabilidade",
    "highlights": [
      "Mudanca: Processo de release com release:bump e checklist tecnico em README_RELEASE.md.",
      "Correcao: Bloqueio de compatibilidade quando frontend e backend estao em versoes incompativeis.",
      "Correcao: Validacao de versao no CI/release para evitar publicar artefatos fora de sincronia.",
      "Correcao: Regras de movimentacao com natureza/documento/referencia para reduzir erros de validacao."
    ]
  }
];

export function normalizeVersion(version: string): string {
  return (version || "").trim().replace(/^v/i, "");
}

export function getReleaseEntry(version: string): ReleaseEntry | undefined {
  const normalized = normalizeVersion(version);
  return RELEASE_ENTRIES.find((entry) => normalizeVersion(entry.version) === normalized);
}

export function getLatestReleaseEntry(): ReleaseEntry | undefined {
  return RELEASE_ENTRIES[0];
}
