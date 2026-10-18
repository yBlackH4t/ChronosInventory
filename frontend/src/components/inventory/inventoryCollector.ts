import type {
  InventoryAdjustmentReason,
  InventoryStatusFilter,
} from "../../lib/api";

// Estado da aba e regras do modo coletor do Inventario.
export const ADJUSTMENT_REASON_OPTIONS: {
  value: InventoryAdjustmentReason;
  label: string;
}[] = [
  { value: "AVARIA", label: "Avaria" },
  { value: "PERDA", label: "Perda" },
  { value: "CORRECAO_INVENTARIO", label: "Correção de inventário" },
  { value: "ERRO_OPERACIONAL", label: "Erro operacional" },
  { value: "TRANSFERENCIA", label: "Transferência" },
];

export type SessionItemEdit = {
  qtd_fisico: number;
  motivo_ajuste?: InventoryAdjustmentReason | null;
  observacao?: string | null;
};

export type CollectorResolvedInput =
  | { kind: "product_id"; value: number }
  | { kind: "product_code"; value: string };

export type CollectorLogStatus = "OK" | "ERRO";

export type CollectorLogItem = {
  id: string;
  at: string;
  input: string;
  status: CollectorLogStatus;
  message: string;
};

export type InventoryTabState = {
  sessionName: string;
  sessionLocationId: number | null;
  sessionObservacao: string;
  sessionPage: number;
  selectedSessionId: number | null;
  itemsPage: number;
  statusFilter: InventoryStatusFilter;
  search: string;
  collectorStep: number;
  scrollY: number;
};

export const INVENTORY_TAB_ID = "inventory";
export const DEFAULT_INVENTORY_TAB_STATE: InventoryTabState = {
  sessionName: "",
  sessionLocationId: null,
  sessionObservacao: "",
  sessionPage: 1,
  selectedSessionId: null,
  itemsPage: 1,
  statusFilter: "DIVERGENT",
  search: "",
  collectorStep: 1,
  scrollY: 0,
};

export const INVENTORY_STATUS_FILTER_OPTIONS: {
  value: InventoryStatusFilter;
  label: string;
}[] = [
  { value: "DIVERGENT", label: "Divergentes" },
  { value: "NOT_COUNTED", label: "Não contados" },
  { value: "MISSING", label: "Faltando" },
  { value: "SURPLUS", label: "Sobrando" },
  { value: "PENDING", label: "Pendentes" },
  { value: "MATCHED", label: "OK" },
  { value: "APPLIED", label: "Já aplicados" },
  { value: "ALL", label: "Todos" },
];

export function normalizeText(value: string): string {
  return String(value || "").toUpperCase();
}

// "CI-123" (etiqueta impressa) e numeros de ate 4 digitos sao o ID do produto;
// o resto vira codigo do produto, so com os digitos.
export function parseCollectorInput(
  rawValue: string,
): CollectorResolvedInput | null {
  const value = normalizeText(rawValue).trim();
  if (!value) return null;

  const ciMatch = value.match(/^CI[-\s]?(\d{1,10})$/i);
  if (ciMatch) {
    return {
      kind: "product_id",
      value: Number.parseInt(ciMatch[1], 10),
    };
  }

  const digits = value.replace(/\D/g, "");
  if (!digits) return null;

  if (/^\d+$/.test(value) && digits.length <= 4) {
    return {
      kind: "product_id",
      value: Number.parseInt(digits, 10),
    };
  }

  return {
    kind: "product_code",
    value: digits,
  };
}
