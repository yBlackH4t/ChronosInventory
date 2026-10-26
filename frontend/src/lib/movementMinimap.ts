import type { MovementOut } from "./api";
import { groupByDay } from "./movements";

export type MinimapDay = {
  day: string;
  entradas: number;
  saidas: number;
  transferencias: number;
  /** Quantas movimentações (linhas) no dia. */
  count: number;
};

/** Um traço por dia da lista: unidades que entraram, saíram e foram transferidas. */
export function minimapDays(rows: MovementOut[]): MinimapDay[] {
  return groupByDay(rows).map(({ day, rows: dayRows }) => {
    const totals = { entradas: 0, saidas: 0, transferencias: 0 };
    for (const row of dayRows) {
      if (row.tipo === "ENTRADA") totals.entradas += row.quantidade;
      else if (row.tipo === "SAIDA") totals.saidas += row.quantidade;
      else totals.transferencias += row.quantidade;
    }
    return { day, ...totals, count: dayRows.length };
  });
}

/** Id do bloco do dia na lista (o minimapa rola até ele). */
export function dayAnchorId(day: string): string {
  return `mov-dia-${day}`;
}
