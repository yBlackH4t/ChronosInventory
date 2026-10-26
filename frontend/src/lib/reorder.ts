/** Move o item de `from` para `to` (índices), sem mexer no array original. */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= items.length || to < 0 || to >= items.length) {
    return [...items];
  }
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** Ordena `ids` pela ordem salva; os que não estão nela vão para o fim, na ordem de hoje. */
export function applySavedOrder<T>(ids: readonly T[], saved: readonly T[] | null | undefined): T[] {
  if (!saved || saved.length === 0) return [...ids];
  const rank = new Map(saved.map((id, index) => [id, index]));
  return [...ids].sort((a, b) => (rank.get(a) ?? Infinity) - (rank.get(b) ?? Infinity));
}
