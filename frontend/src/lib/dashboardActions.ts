import type { RecentStockoutItem, StockItemOverview, StockoutRiskItem } from "./api";

// "Pede ação hoje" do Painel: junta numa lista só o que estava em três blocos (perto de
// zerar, zerados que venderam e parados que mais ocupam). Lógica pura, para testar.

export type ActionKind = "ZERADO" | "REPOR" | "PARADO";

export type ActionItem = {
  kind: ActionKind;
  produtoId: number;
  nome: string;
  /** O motivo do item estar na lista, curto para caber na mesma linha do nome. */
  detail: string;
};

export const ACTION_LABELS: Record<ActionKind, string> = {
  ZERADO: "Zerado",
  REPOR: "Repor",
  PARADO: "Parado",
};

export function coverageLabel(days: number): string {
  if (days < 1) return "zera hoje";
  if (days === 1) return "dura ~1 dia";
  return `dura ~${days} dias`;
}

function num(value: number): string {
  return value.toLocaleString("pt-BR");
}

function wentOut(value: number): string {
  return value === 1 ? "saiu 1" : `saíram ${num(value)}`;
}

type BuildActionListInput = {
  stockouts: RecentStockoutItem[];
  risk: StockoutRiskItem[];
  /** Parados já em ordem (os que mais ocupam primeiro), como `summarizeHealth` devolve. */
  parados: StockItemOverview[];
  limit?: number;
  /** Lugares guardados para os parados, para eles não sumirem atrás dos urgentes. */
  reservedParados?: number;
};

/**
 * Ordem: zerados que venderam (venda perdida, mais vendidos primeiro), depois os que vão
 * zerar (menos dias primeiro) e por fim os parados. Um produto aparece uma vez só.
 */
export function buildActionList({
  stockouts,
  risk,
  parados,
  limit = 8,
  reservedParados = 2,
}: BuildActionListInput): ActionItem[] {
  const seen = new Set<number>();
  const take = <T extends { produto_id: number }>(items: T[], toItem: (item: T) => ActionItem) => {
    const out: ActionItem[] = [];
    for (const item of items) {
      if (seen.has(item.produto_id)) continue;
      seen.add(item.produto_id);
      out.push(toItem(item));
    }
    return out;
  };

  const urgent = [
    ...take(
      [...stockouts].sort((a, b) => b.total_saida_recente - a.total_saida_recente),
      (item) => ({
        kind: "ZERADO" as const,
        produtoId: item.produto_id,
        nome: item.nome,
        detail: `zerou · ${wentOut(item.total_saida_recente)} em 30 dias`,
      }),
    ),
    ...take(
      [...risk].sort((a, b) => a.dias_cobertura - b.dias_cobertura),
      (item) => ({
        kind: "REPOR" as const,
        produtoId: item.produto_id,
        nome: item.nome,
        detail: `${num(item.estoque_atual)} em estoque · ${coverageLabel(item.dias_cobertura)}`,
      }),
    ),
  ];
  const idle = take(parados, (item) => ({
    kind: "PARADO" as const,
    produtoId: item.produto_id,
    nome: item.nome,
    detail:
      item.dias_sem_saida === null
        ? `${num(item.estoque)} parada${item.estoque === 1 ? "" : "s"} · nunca saiu`
        : `${num(item.estoque)} parada${item.estoque === 1 ? "" : "s"} · ${item.dias_sem_saida} dias sem saída`,
  }));

  const idleSlots = Math.min(idle.length, reservedParados, limit);
  const urgentShown = urgent.slice(0, limit - idleSlots);
  return [...urgentShown, ...idle.slice(0, limit - urgentShown.length)];
}

/** "3 itens pedem ação hoje", com zero e um tratados. */
export function actionSummary(count: number): string {
  if (count === 0) return "Nada pede ação hoje";
  if (count === 1) return "1 item pede ação hoje";
  return `${count} itens pedem ação hoje`;
}
