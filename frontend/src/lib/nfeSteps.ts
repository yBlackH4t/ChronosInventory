// Etapas do "Lançar nota fiscal": ler a chave -> conferir itens -> confirmar. Lógica pura.

export const NFE_STEPS = [
  { label: "Ler a chave", hint: "Bipe ou digite a chave do DANFE" },
  { label: "Conferir itens", hint: "Produto e quantidade de cada item" },
  { label: "Confirmar", hint: "Natureza, observação e lançamento" },
] as const;

export type NfeStepState = {
  /** A nota já foi lida. */
  hasNota: boolean;
  /** Itens sem produto escolhido (e não ignorados). */
  itemsWithoutProduct: number;
  /** Itens com saldo insuficiente (só na saída). */
  itemsShort: number;
  /** Todos os itens marcados para ignorar. */
  allIgnored: boolean;
  /** Ainda falta algo para lançar (qualquer aviso da conferência). */
  hasProblems: boolean;
};

/**
 * Etapa atual (0, 1 ou 2). Sem nota: ler a chave. Enquanto algum item precisa de atenção:
 * conferir itens. Itens certos: confirmar (mesmo que falte a natureza ou o local externo,
 * que ficam na etapa de confirmar).
 */
export function nfeStepIndex(state: NfeStepState): number {
  if (!state.hasNota) return 0;
  if (state.itemsWithoutProduct > 0 || state.itemsShort > 0 || state.allIgnored) return 1;
  return 2;
}

export type NfeStepStatus = "done" | "current" | "todo";

export function nfeStepStatus(step: number, current: number): NfeStepStatus {
  if (step < current) return "done";
  if (step === current) return "current";
  return "todo";
}

/** Saldo que fica no local depois da nota ("Fica"); null sem produto ou local. */
export function stockAfter(stock: number | null, quantidade: number, tipo: "SAIDA" | "ENTRADA"): number | null {
  if (stock === null) return null;
  return stock + (tipo === "SAIDA" ? -1 : 1) * quantidade;
}
