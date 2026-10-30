// Linha do tempo de Movimentações (2.6.2). Lógica pura, sem React, para testar.
import type { MovementOut } from "./api";

/** Documento que o cadastro do produto grava no estoque inicial (backend). */
export const INITIAL_STOCK_DOCUMENT = "CADASTRO_INICIAL";

// Observações que o próprio sistema escreve: viram um selo curto ou somem.
const DEFAULT_OBSERVATIONS: { pattern: RegExp; tag: string | null }[] = [
  { pattern: /^estoque inicial gerado no cadastro do produto\.?$/i, tag: "Saldo inicial" },
  { pattern: /^criado via importa[cç][aã]o\.?$/i, tag: "Importação" },
  // O estorno já aparece como selo; "Estorno da movimentação #12" não diz nada a mais.
  { pattern: /^estorno da movimenta[cç][aã]o #\d+\.?$/i, tag: null },
];

export type MovementNote = {
  /** Selo curto no lugar da observação padrão ("Saldo inicial", "Importação"). */
  tag: string | null;
  /** Observação escrita por alguém (a padrão some). */
  observation: string | null;
  /** Documento de verdade (o "CADASTRO_INICIAL" interno não aparece). */
  document: string | null;
};

export function movementNote(
  movement: Pick<MovementOut, "observacao" | "documento">,
): MovementNote {
  const raw = String(movement.observacao ?? "").trim();
  const document = String(movement.documento ?? "").trim();
  let tag: string | null = document === INITIAL_STOCK_DOCUMENT ? "Saldo inicial" : null;
  let observation: string | null = raw || null;
  for (const item of DEFAULT_OBSERVATIONS) {
    if (raw && item.pattern.test(raw)) {
      tag = tag ?? item.tag;
      observation = null;
      break;
    }
  }
  return {
    tag,
    observation,
    document: document && document !== INITIAL_STOCK_DOCUMENT ? document : null,
  };
}

/** Movimentações desta lista que já foram desfeitas por um estorno (aparecem riscadas). */
export function reversedMovementIds(
  rows: Pick<MovementOut, "natureza" | "movimento_ref_id">[],
): Set<number> {
  const ids = new Set<number>();
  for (const row of rows) {
    if (row.natureza === "ESTORNO" && row.movimento_ref_id) ids.add(row.movimento_ref_id);
  }
  return ids;
}

/** "Canoas → Passo Fundo", "para Canoas", "de Canoas" ou null. */
export function movementPlace(origem: string | null, destino: string | null): string | null {
  if (origem && destino) return `${origem} → ${destino}`;
  if (destino) return `para ${destino}`;
  if (origem) return `de ${origem}`;
  return null;
}
