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
