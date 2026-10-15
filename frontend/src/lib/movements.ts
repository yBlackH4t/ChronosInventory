import dayjs from "dayjs";

import type { MovementCreate, MovementOut } from "./api";
import { MOVEMENT_COLORS } from "./semantic";

export const MOVEMENT_TYPES = [
  { value: "ENTRADA", label: "Entrada" },
  { value: "SAIDA", label: "Saída" },
  { value: "TRANSFERENCIA", label: "Transferência" },
];

export const MOVEMENT_NATURES = [
  { value: "OPERACAO_NORMAL", label: "Operação normal" },
  { value: "TRANSFERENCIA_EXTERNA", label: "Transferência externa" },
  { value: "DEVOLUCAO", label: "Devolução" },
  { value: "AJUSTE", label: "Ajuste" },
];

export const ADJUSTMENT_REASON_LABELS: Record<string, string> = {
  AVARIA: "Avaria",
  PERDA: "Perda",
  CORRECAO_INVENTARIO: "Correção de inventário",
  ERRO_OPERACIONAL: "Erro operacional",
  TRANSFERENCIA: "Transferência",
};

export type MovementFilters = {
  produto_id: string;
  tipo: "" | MovementCreate["tipo"];
  natureza: "" | NonNullable<MovementCreate["natureza"]>;
  origem_location_id: number | null;
  destino_location_id: number | null;
  date_from: Date | null;
  date_to: Date | null;
};

export type SerializedMovementFilters = {
  produto_id: string;
  tipo: "" | MovementCreate["tipo"];
  natureza: "" | NonNullable<MovementCreate["natureza"]>;
  origem_location_id: string | null;
  destino_location_id: string | null;
  date_from: string | null;
  date_to: string | null;
};

export type MovementTableViewMode = "AUTO" | "COMPACTO" | "DETALHADO";

export type MovementsTablePreferences = {
  viewMode: MovementTableViewMode;
};

export type ResolvedMovementTableLayout = {
  minWidth: number;
  showExtraColumns: boolean;
  productMaxWidth: number;
  observationMaxWidth: number;
};

export type MovementsTabState = {
  page: number;
  pageSize: string;
  sort: string;
  productSearch: string;
  documentoSearch?: string;
  showProductId: boolean;
  filters: SerializedMovementFilters;
  historyProductId: number | null;
  historyOpened: boolean;
  scrollY: number;
};

export const MOVEMENTS_TAB_ID = "movements";
export const MOVEMENTS_TABLE_PREFS_KEY = "chronos.movements.table_prefs.v1";

export const TABLE_VIEW_MODE_OPTIONS: {
  value: MovementTableViewMode;
  label: string;
}[] = [
  { value: "AUTO", label: "Auto" },
  { value: "COMPACTO", label: "Compacto" },
  { value: "DETALHADO", label: "Detalhado" },
];

export const DEFAULT_TABLE_PREFERENCES: MovementsTablePreferences = {
  viewMode: "AUTO",
};

export const DEFAULT_MOVEMENT_FILTERS: MovementFilters = {
  produto_id: "",
  tipo: "",
  natureza: "",
  origem_location_id: null,
  destino_location_id: null,
  date_from: null,
  date_to: null,
};

export const MOVEMENT_PAGE_SIZES = ["10", "25", "50", "100"];

export const DEFAULT_MOVEMENTS_TAB_STATE: MovementsTabState = {
  page: 1,
  pageSize: "25",
  sort: "-data",
  productSearch: "",
  documentoSearch: "",
  showProductId: false,
  filters: {
    produto_id: "",
    tipo: "",
    natureza: "",
    origem_location_id: null,
    destino_location_id: null,
    date_from: null,
    date_to: null,
  },
  historyProductId: null,
  historyOpened: false,
  scrollY: 0,
};

export function serializeFilters(
  filters: MovementFilters,
): SerializedMovementFilters {
  return {
    ...filters,
    origem_location_id: filters.origem_location_id
      ? String(filters.origem_location_id)
      : null,
    destino_location_id: filters.destino_location_id
      ? String(filters.destino_location_id)
      : null,
    date_from: filters.date_from
      ? dayjs(filters.date_from).format("YYYY-MM-DD")
      : null,
    date_to: filters.date_to
      ? dayjs(filters.date_to).format("YYYY-MM-DD")
      : null,
  };
}

export function deserializeFilters(
  filters: SerializedMovementFilters | undefined,
): MovementFilters {
  if (!filters) return { ...DEFAULT_MOVEMENT_FILTERS };
  return {
    ...filters,
    origem_location_id: filters.origem_location_id
      ? Number(filters.origem_location_id)
      : null,
    destino_location_id: filters.destino_location_id
      ? Number(filters.destino_location_id)
      : null,
    date_from: filters.date_from ? dayjs(filters.date_from).toDate() : null,
    date_to: filters.date_to ? dayjs(filters.date_to).toDate() : null,
  };
}

export function movementColor(tipo: MovementOut["tipo"]) {
  // Red stays reserved for destructive actions; a sale is routine.
  return MOVEMENT_COLORS[tipo] ?? "gray";
}

export function signedQuantity(tipo: MovementOut["tipo"], quantidade: number) {
  if (tipo === "ENTRADA") return `+${quantidade}`;
  if (tipo === "SAIDA") return `−${quantidade}`;
  return String(quantidade);
}

// Natures that only appear in history (not offered as filters or on creation).
const HISTORY_ONLY_NATURE_LABELS: Record<string, string> = {
  ESTORNO: "Estorno",
};

export function movementNatureLabel(natureza: MovementOut["natureza"]) {
  return (
    MOVEMENT_NATURES.find((item) => item.value === natureza)?.label ??
    HISTORY_ONLY_NATURE_LABELS[String(natureza)] ??
    natureza
  );
}

export function adjustmentReasonLabel(reason?: string | null) {
  if (!reason) return "-";
  return ADJUSTMENT_REASON_LABELS[reason] ?? reason;
}

export function getViewportWidth(): number {
  if (typeof window === "undefined") return 1366;
  return window.innerWidth || 1366;
}

function getLocalStorageSafe(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

export function loadTablePreferences(): MovementsTablePreferences {
  const storage = getLocalStorageSafe();
  if (!storage) return DEFAULT_TABLE_PREFERENCES;
  try {
    const raw = storage.getItem(MOVEMENTS_TABLE_PREFS_KEY);
    if (!raw) return DEFAULT_TABLE_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<MovementsTablePreferences>;
    const viewMode = parsed.viewMode;
    if (!viewMode || !["AUTO", "COMPACTO", "DETALHADO"].includes(viewMode)) {
      return DEFAULT_TABLE_PREFERENCES;
    }
    return {
      viewMode: viewMode as MovementTableViewMode,
    };
  } catch {
    return DEFAULT_TABLE_PREFERENCES;
  }
}

export function saveTablePreferences(
  preferences: MovementsTablePreferences,
): void {
  const storage = getLocalStorageSafe();
  if (!storage) return;
  try {
    storage.setItem(MOVEMENTS_TABLE_PREFS_KEY, JSON.stringify(preferences));
  } catch {
    // best effort
  }
}

export function resolveMovementTableLayout(
  viewMode: MovementTableViewMode,
  viewportWidth: number,
): ResolvedMovementTableLayout {
  if (viewMode === "COMPACTO") {
    return {
      minWidth: 1260,
      showExtraColumns: false,
      productMaxWidth: 190,
      observationMaxWidth: 230,
    };
  }

  if (viewMode === "DETALHADO") {
    return {
      minWidth: 1840,
      showExtraColumns: true,
      productMaxWidth: 380,
      observationMaxWidth: 440,
    };
  }

  if (viewportWidth < 1360) {
    return {
      minWidth: 1260,
      showExtraColumns: false,
      productMaxWidth: 190,
      observationMaxWidth: 230,
    };
  }
  if (viewportWidth < 1680) {
    return {
      minWidth: 1500,
      showExtraColumns: true,
      productMaxWidth: 280,
      observationMaxWidth: 320,
    };
  }
  return {
    minWidth: 1840,
    showExtraColumns: true,
    productMaxWidth: 380,
    observationMaxWidth: 440,
  };
}

/** "Hoje", "Ontem" ou "13 de outubro" (com o ano se não for o atual). */
export function dayHeading(date: string, today = dayjs()): string {
  const day = dayjs(date);
  const weekday = day.format("dddd");
  if (day.isSame(today, "day")) return `Hoje · ${day.format("D [de] MMMM")}`;
  if (day.isSame(today.subtract(1, "day"), "day")) return `Ontem · ${day.format("D [de] MMMM")}`;
  const sameYear = day.isSame(today, "year");
  return `${weekday} · ${day.format(sameYear ? "D [de] MMMM" : "D [de] MMMM [de] YYYY")}`;
}

/** Agrupa por dia mantendo a ordem em que as linhas chegaram. */
export function groupByDay(rows: MovementOut[]): { day: string; rows: MovementOut[] }[] {
  const groups: { day: string; rows: MovementOut[] }[] = [];
  for (const row of rows) {
    const day = dayjs(row.data).format("YYYY-MM-DD");
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.rows.push(row);
    else groups.push({ day, rows: [row] });
  }
  return groups;
}
