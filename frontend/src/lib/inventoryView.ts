import type { InventorySessionOut } from "./api";

/** Nome do local da sessão: o backend manda em `local`; "Local #null" nunca aparece. */
export function sessionLocalLabel(
  session: Pick<InventorySessionOut, "local" | "local_label" | "location_id">,
): string {
  const name = session.local_label?.trim() || session.local?.trim();
  if (name) return name;
  return session.location_id ? `Local #${session.location_id}` : "Sem local";
}

/** Quantos itens pedem contagem: os com saldo no sistema e os já conferidos. */
export function sessionItemsToCount(
  session: Pick<InventorySessionOut, "to_count_items" | "total_items">,
): number {
  return session.to_count_items ?? session.total_items;
}

/** Quanto da contagem já foi feito, de 0 a 100. Item com 0 no sistema e não bipado não conta. */
export function sessionProgress(
  session: Pick<InventorySessionOut, "counted_items" | "to_count_items" | "total_items">,
): number {
  const toCount = sessionItemsToCount(session);
  if (!toCount) return 0;
  const percent = (session.counted_items / toCount) * 100;
  // 100% só quando tudo foi contado de fato; 99,6% não arredonda para cima.
  return Math.min(100, session.counted_items < toCount ? Math.floor(percent) : 100);
}
