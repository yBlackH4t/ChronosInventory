// Aba Produtos em colunas (2.7.11): a busca por código abre colunas (nova, reman, montada,
// conjunto central, par do biturbo, similares). Lógica pura, sem React, para testar.

import type { InventoryLocation, ProductColumn, ProductColumnItem, ProductColumnKey } from "./api";

/** Cor de cada coluna (Mantine), a mesma na faixa do topo, no ponto e no "Vincular". */
export const COLUMN_COLORS: Record<ProductColumnKey, string> = {
  nova: "blue",
  reman: "orange",
  montada: "violet",
  conjunto: "cyan",
  par: "teal",
  similares: "pink",
};

/** Os "+ Vincular" que aparecem quando a peça tem só uma coluna. */
export const LINKABLE_COLUMNS: { key: ProductColumnKey; label: string }[] = [
  { key: "montada", label: "Vincular montada" },
  { key: "conjunto", label: "Vincular conjunto" },
  { key: "similares", label: "Vincular similar" },
];

export const LINK_LABEL: Record<ProductColumnKey, string> = {
  nova: "Vincular nova",
  reman: "Vincular reman",
  montada: "Vincular montada",
  conjunto: "Vincular conjunto",
  // O par do biturbo vem das observações do cadastro da empresa; não tem botão de vincular.
  par: "",
  similares: "Vincular similar",
};

/**
 * A busca vira colunas quando é um código só: uma palavra com número e pelo menos 4 caracteres
 * ("4031196", "466646-5041S", "HX40W"). Texto com espaço ("turbo hx40") e "#ID" ficam na lista.
 */
export function looksLikeCode(query: string): boolean {
  const text = query.trim();
  if (text.length < 4 || text.startsWith("#") || /\s/.test(text)) return false;
  return /\d/.test(text) && /^[\w.\-/]+$/.test(text);
}

/** Saídas das últimas 13 semanas (~90 dias). */
export function totalSaidas(weeks: number[] | undefined): number {
  return (weeks ?? []).reduce((acc, value) => acc + value, 0);
}

/** Soma do saldo de uma coluna. */
export function columnStock(column: ProductColumn): number {
  return column.itens.reduce((acc, item) => acc + (item.produto.total_stock ?? 0), 0);
}

/** "em Canoas" quando todo o saldo está numa filial só; senão "em estoque". */
export function stockPlace(item: ProductColumnItem, locations: InventoryLocation[]): string {
  const withStock = Object.entries(item.produto.inventories ?? {}).filter(([, qty]) => qty > 0);
  const ids = withStock.length > 0 ? withStock.map(([id]) => Number(id)) : locations.length === 1 ? [locations[0].id] : [];
  if (ids.length !== 1) return "em estoque";
  const loc = locations.find((l) => l.id === ids[0]);
  return loc ? `em ${loc.label || loc.name}` : "em estoque";
}

/** Nome que o cartão mostra: a montada mostra o turbo, mas o saldo e as ações são do conjunto. */
export function itemTitle(item: ProductColumnItem): string {
  return item.relacao === "montada_no_conjunto" && item.turbo_nome ? item.turbo_nome : item.produto.nome;
}

/** Chave única do cartão no quadro (o mesmo conjunto pode ser montada de dois turbos). */
export function itemKey(column: ProductColumnKey, item: ProductColumnItem): string {
  return `${column}-${item.produto.id}-${item.turbo_id ?? ""}`;
}
