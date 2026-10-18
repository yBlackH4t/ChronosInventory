// Cores com significado: a mesma cor quer dizer a mesma coisa em todas as telas,
// nos gráficos, nas etiquetas e no assistente. Vermelho fica só para "acabou" e
// para apagar. Os nomes são paletas do tema Mantine (theme.ts).

export type MovementKind = "ENTRADA" | "SAIDA" | "TRANSFERENCIA";

export const MOVEMENT_COLORS: Record<MovementKind, string> = {
  ENTRADA: "success",
  SAIDA: "orange",
  TRANSFERENCIA: "info",
};

/** Cor de uma movimentação: a natureza manda quando muda o sentido do lançamento. */
export function movementTone(tipo: MovementKind, natureza?: string | null): string {
  if (natureza === "AJUSTE" || natureza === "ESTORNO") return "gray";
  if (natureza === "TRANSFERENCIA_EXTERNA") return "info";
  return MOVEMENT_COLORS[tipo] ?? "gray";
}

export type VersionLabel = "NOVA" | "REMAN" | "MONTADA";

export const VERSION_COLORS: Record<VersionLabel, string> = {
  NOVA: "info",
  REMAN: "warning",
  MONTADA: "violet",
};

export type StockLevel = "ZERADO" | "BAIXO" | "OK";

export function stockLevel(quantidade: number): StockLevel {
  if (quantidade <= 0) return "ZERADO";
  if (quantidade <= 2) return "BAIXO";
  return "OK";
}

export const STOCK_LEVEL_COLORS: Record<StockLevel, string> = {
  ZERADO: "danger",
  BAIXO: "warning",
  OK: "success",
};

export function stockLevelColor(quantidade: number): string {
  return STOCK_LEVEL_COLORS[stockLevel(quantidade)];
}

// Hex para os gráficos (Recharts e SVG não leem as paletas do Mantine).
// Tons validados contra as superfícies #ffffff (claro) e #0f172a (escuro).
export const SEMANTIC_HEX = {
  light: {
    inflow: "#16a34a",
    outflow: "#ea580c",
    transfer: "#2563eb",
    adjust: "#64748b",
    nova: "#2563eb",
    reman: "#d97706",
    montada: "#7c3aed",
    ok: "#16a34a",
    warn: "#d97706",
    crit: "#dc2626",
  },
  dark: {
    inflow: "#22c55e",
    outflow: "#f97316",
    transfer: "#3b82f6",
    adjust: "#94a3b8",
    nova: "#60a5fa",
    reman: "#fbbf24",
    montada: "#a78bfa",
    ok: "#22c55e",
    warn: "#fbbf24",
    crit: "#f87171",
  },
} as const;

export type SemanticHex = { [K in keyof (typeof SEMANTIC_HEX)["light"]]: string };
