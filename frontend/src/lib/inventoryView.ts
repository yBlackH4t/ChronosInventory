import type { InventorySessionOut } from "./api";

/** Nome do local da sessão: o backend manda em `local`; "Local #null" nunca aparece. */
export function sessionLocalLabel(
  session: Pick<InventorySessionOut, "local" | "local_label" | "location_id">,
): string {
  const name = session.local_label?.trim() || session.local?.trim();
  if (name) return name;
  return session.location_id ? `Local #${session.location_id}` : "Sem local";
}

/** Quanto da sessão já foi contado, de 0 a 100. */
export function sessionProgress(session: Pick<InventorySessionOut, "counted_items" | "total_items">): number {
  if (!session.total_items) return 0;
  return Math.min(100, Math.round((session.counted_items / session.total_items) * 100));
}
