// Como o produto aparece na lista e na ficha (2.6.2). Lógica pura, sem React, para testar.
import dayjs from "dayjs";

import type { MovementCreate, Product } from "./api";
import type { BrandInfo, ProductCondition } from "./brands";

export type ProductNameParts = {
  /** Código da peça tirado do nome (o "rótulo" da linha), ou null se não houver. */
  code: string | null;
  /** O resto do nome, sem o código e sem a marca. */
  rest: string;
};

// Formatos de código vistos no banco da empresa. Vale o que aparece primeiro no nome.
const CODE_PATTERNS: RegExp[] = [
  /\b\d{6}-\d{4}[A-Z]?\b/, // Garrett: 452308-5002, 754127-0003S
  /\b\d{4}-\d{3}-\d{3}[A-Z]?\b/, // Master Power: 1000-010-114, 1000-030-278T
  /\b\d{4} \d{3} \d{4}\b/, // BorgWarner com espaços: 5439 710 0522
  /\b\d{5,}(?:\/\d{3,})?\b/, // 11559880005, 4031196, 53279907101/7210
];

const BRAND_WORDS: Record<string, RegExp> = {
  HOLSET: /\bHOLSET\b/i,
  BORGWARNER: /\bBORG\s?WARNER\b/i,
  GARRETT: /\bGARRETT\b/i,
  "MASTER POWER": /\bMASTER\s?POWER\b/i,
  MAHLE: /\bMAHLE\b/i,
  MITSUBISHI: /\bMITSUBISHI\b/i,
};

// Separador solto (" - ", " / ") com espaço de pelo menos um lado; "B2UV-63A" fica intacto.
const LOOSE_SEPARATORS = /(?:\s+[-–/]\s*|\s*[-–/]\s+)+/g;

function tidy(text: string): string {
  return text
    .replace(LOOSE_SEPARATORS, (match) => (match.includes("/") ? " / " : " - "))
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s\-–/·]+|[\s\-–/·]+$/g, "")
    .replace(/\(\s*\)/g, "")
    .trim();
}

/** Onde está o código da peça no nome: o que aparece primeiro (o mais longo, se empatar). */
export function findProductCode(nome: string): { index: number; value: string } | null {
  const text = nome ?? "";
  let best: { index: number; value: string } | null = null;
  for (const pattern of CODE_PATTERNS) {
    const match = pattern.exec(text);
    if (!match) continue;
    if (
      !best ||
      match.index < best.index ||
      (match.index === best.index && match[0].length > best.value.length)
    ) {
      best = { index: match.index, value: match[0] };
    }
  }
  return best;
}

export type NameWithCode = { before: string; code: string | null; after: string };

/** O nome exatamente como está no cadastro, partido em volta do código (para destacá-lo). */
export function nameAroundCode(nome: string): NameWithCode {
  const text = (nome ?? "").trim();
  const found = findProductCode(text);
  if (!found) return { before: text, code: null, after: "" };
  return {
    before: text.slice(0, found.index),
    code: found.value,
    after: text.slice(found.index + found.value.length),
  };
}

const BRAND_MONOGRAMS: Record<string, string> = {
  HOLSET: "HOL",
  BORGWARNER: "BW",
  GARRETT: "GT",
  "MASTER POWER": "MP",
  MAHLE: "MA",
  MITSUBISHI: "MHI",
  IHI: "IHI",
};

const KIND_MONOGRAMS: [RegExp, string][] = [
  [/\bCONJ(UNTO)?\b/, "CC"],
  [/\bTURB(O|INA)\b/, "TB"],
  [/\bIMP\b/, "IMP"],
  [/\bWASTEGATE\b/, "WG"],
];

/** Sigla no lugar da foto: a marca (HOL, BW, GT...) ou o tipo da peça (TB, CC...); null se não souber. */
export function productMonogram(nome: string, brand: BrandInfo | null): string | null {
  if (brand && BRAND_MONOGRAMS[brand.label]) return BRAND_MONOGRAMS[brand.label];
  const upper = (nome ?? "").toUpperCase();
  for (const [pattern, label] of KIND_MONOGRAMS) if (pattern.test(upper)) return label;
  return null;
}

export function splitProductCode(nome: string, brand?: BrandInfo | null): ProductNameParts {
  const text = (nome ?? "").trim();
  const best = findProductCode(text);
  let rest = text;
  if (best) rest = text.slice(0, best.index) + " " + text.slice(best.index + best.value.length);
  const brandWord = brand ? BRAND_WORDS[brand.label] : undefined;
  if (brandWord) rest = rest.replace(brandWord, " ");
  rest = tidy(rest);
  return { code: best?.value ?? null, rest: rest || (best ? "" : text) };
}

const BRAND_TITLES: Record<string, string> = {
  HOLSET: "Holset",
  BORGWARNER: "BorgWarner",
  GARRETT: "Garrett",
  "MASTER POWER": "Master Power",
  MAHLE: "Mahle",
  MITSUBISHI: "Mitsubishi",
  IHI: "IHI",
  OEM: "OEM",
};

export function brandTitle(brand: BrandInfo | null): string | null {
  if (!brand) return null;
  return BRAND_TITLES[brand.label] ?? brand.label;
}

const VERSION_TITLES: Record<ProductCondition["label"], string> = {
  NOVA: "Nova",
  REMAN: "Reman",
  MONTADA: "Montada",
};

export function versionTitle(condition: ProductCondition): string {
  return VERSION_TITLES[condition.label] ?? condition.label;
}

export type LocationColumns = {
  /** Filiais que ganham coluna na lista. */
  ids: number[];
  /** Só uma filial tem saldo: a coluna dela repetiria o total, então fica só o saldo. */
  onlyLocationId: number | null;
};

/**
 * Colunas de filial da lista: some a filial sem saldo em nenhum produto (totais do estoque
 * inteiro, não só da página). Sem os totais ainda, mostra todas.
 */
export function locationColumns(
  locationIds: number[],
  totals: { location_id: number; total: number }[] | null | undefined,
  pageRows: Pick<Product, "inventories">[] = [],
): LocationColumns {
  if (!totals) return { ids: locationIds, onlyLocationId: null };
  const withStock = new Set(totals.filter((t) => t.total > 0).map((t) => t.location_id));
  for (const row of pageRows) {
    for (const [id, qty] of Object.entries(row.inventories ?? {})) {
      if (qty > 0) withStock.add(Number(id));
    }
  }
  const ids = locationIds.filter((id) => withStock.has(id));
  if (ids.length === 0) return { ids: [], onlyLocationId: null };
  if (ids.length === 1) return { ids: [], onlyLocationId: ids[0] };
  return { ids, onlyLocationId: null };
}

export type FlashKind = "entrada" | "saida" | "transferencia";

export function flashKindFor(tipo: MovementCreate["tipo"]): FlashKind {
  if (tipo === "ENTRADA") return "entrada";
  if (tipo === "SAIDA") return "saida";
  return "transferencia";
}

/** O produto como fica depois da movimentação (para o saldo rolar sem esperar a API). */
export function applyMovementToProduct<P extends Pick<Product, "inventories" | "total_stock">>(
  product: P,
  movement: Pick<MovementCreate, "tipo" | "quantidade" | "origem_location_id" | "destino_location_id">,
): P {
  const inventories: Record<number, number> = { ...(product.inventories ?? {}) };
  const qty = Math.max(0, Number(movement.quantidade) || 0);
  const add = (id: number | null | undefined, delta: number) => {
    if (!id) return;
    inventories[id] = Math.max(0, (inventories[id] ?? 0) + delta);
  };
  if (movement.tipo !== "ENTRADA") add(movement.origem_location_id, -qty);
  if (movement.tipo !== "SAIDA") add(movement.destino_location_id, qty);
  const total = Object.values(inventories).reduce((sum, value) => sum + value, 0);
  return { ...product, inventories, total_stock: total };
}

/** Um rótulo por mês no eixo do gráfico: o dia 1 de cada mês dentro do intervalo. */
export function monthTicks(minTs: number, maxTs: number): number[] {
  if (!Number.isFinite(minTs) || !Number.isFinite(maxTs) || maxTs < minTs) return [];
  const ticks: number[] = [];
  let cursor = dayjs(minTs).startOf("month");
  if (cursor.valueOf() < minTs) cursor = cursor.add(1, "month");
  while (cursor.valueOf() <= maxTs) {
    ticks.push(cursor.valueOf());
    cursor = cursor.add(1, "month");
  }
  return ticks;
}
