import type { MovementCreate } from "./api";

export type ProductMovementType = MovementCreate["tipo"];
export type ProductMovementNature = NonNullable<MovementCreate["natureza"]>;
export type ProductAdjustmentReason = NonNullable<MovementCreate["motivo_ajuste"]>;

export const PRODUCT_LOCATIONS = [
  { value: "CANOAS", label: "Canoas" },
  { value: "PF", label: "Passo Fundo" },
] as const;

export const PRODUCT_MOVEMENT_NATURE_OPTIONS: { value: ProductMovementNature; label: string }[] = [
  { value: "OPERACAO_NORMAL", label: "Operacao normal" },
  { value: "TRANSFERENCIA_EXTERNA", label: "Transferencia externa" },
  { value: "DEVOLUCAO", label: "Devolucao" },
  { value: "AJUSTE", label: "Ajuste" },
];

export const PRODUCT_ADJUSTMENT_REASON_OPTIONS: { value: ProductAdjustmentReason; label: string }[] = [
  { value: "AVARIA", label: "Avaria" },
  { value: "PERDA", label: "Perda" },
  { value: "CORRECAO_INVENTARIO", label: "Correcao inventario" },
  { value: "ERRO_OPERACIONAL", label: "Erro operacional" },
  { value: "TRANSFERENCIA", label: "Transferencia" },
];

export function movementColor(tipo: ProductMovementType) {
  if (tipo === "ENTRADA") return "green";
  if (tipo === "SAIDA") return "red";
  return "yellow";
}

export function movementNatureLabel(natureza: ProductMovementNature) {
  return PRODUCT_MOVEMENT_NATURE_OPTIONS.find((item) => item.value === natureza)?.label ?? natureza;
}

export function adjustmentReasonLabel(reason?: ProductAdjustmentReason | null) {
  if (!reason) return "-";
  return PRODUCT_ADJUSTMENT_REASON_OPTIONS.find((item) => item.value === reason)?.label ?? reason;
}

export function movementNatureOptionsByType(tipo: ProductMovementType): { value: ProductMovementNature; label: string }[] {
  if (tipo === "ENTRADA") {
    return PRODUCT_MOVEMENT_NATURE_OPTIONS.filter((item) =>
      item.value === "OPERACAO_NORMAL" ||
      item.value === "DEVOLUCAO" ||
      item.value === "AJUSTE" ||
      item.value === "TRANSFERENCIA_EXTERNA"
    );
  }
  if (tipo === "SAIDA") {
    return PRODUCT_MOVEMENT_NATURE_OPTIONS.filter((item) =>
      item.value === "OPERACAO_NORMAL" || item.value === "TRANSFERENCIA_EXTERNA" || item.value === "AJUSTE"
    );
  }
  return PRODUCT_MOVEMENT_NATURE_OPTIONS.filter(
    (item) => item.value !== "DEVOLUCAO" && item.value !== "TRANSFERENCIA_EXTERNA"
  );
}

export function createInitialMovementValues(productId = 0): MovementCreate {
  return {
    tipo: "ENTRADA",
    produto_id: productId,
    quantidade: 1,
    origem: "CANOAS",
    destino: "CANOAS",
    observacao: "",
    natureza: "OPERACAO_NORMAL",
    local_externo: "",
    documento: "",
    movimento_ref_id: undefined,
    motivo_ajuste: undefined,
  };
}

export function createActionMovementValues(next: ProductMovementType, productId: number): MovementCreate {
  return {
    tipo: next,
    produto_id: productId,
    quantidade: 1,
    origem: next === "ENTRADA" ? undefined : "CANOAS",
    destino: next === "SAIDA" ? undefined : "CANOAS",
    observacao: "",
    natureza: "OPERACAO_NORMAL",
    local_externo: "",
    documento: "",
    movimento_ref_id: undefined,
    motivo_ajuste: undefined,
  };
}

export function validateMovementSubmission(values: MovementCreate): {
  field: keyof MovementCreate;
  message: string;
} | null {
  if (values.tipo === "TRANSFERENCIA" && values.origem === values.destino) {
    return { field: "destino", message: "Destino deve ser diferente da origem" };
  }
  if (values.natureza === "DEVOLUCAO" && values.tipo !== "ENTRADA") {
    return { field: "natureza", message: "Devolucao so pode ser ENTRADA" };
  }
  if (values.natureza === "TRANSFERENCIA_EXTERNA" && values.tipo !== "ENTRADA" && values.tipo !== "SAIDA") {
    return { field: "natureza", message: "Transferencia externa so pode ser ENTRADA ou SAIDA" };
  }
  if (values.natureza === "TRANSFERENCIA_EXTERNA" && !(values.local_externo || "").trim()) {
    return { field: "local_externo", message: "Informe o local externo" };
  }
  if (values.natureza === "DEVOLUCAO" && (!values.movimento_ref_id || values.movimento_ref_id < 1)) {
    return { field: "movimento_ref_id", message: "Informe o movimento de referencia" };
  }
  if (values.natureza === "AJUSTE" && !values.motivo_ajuste) {
    return { field: "motivo_ajuste", message: "Informe o motivo do ajuste" };
  }
  if (values.natureza === "AJUSTE" && !(values.observacao || "").trim()) {
    return { field: "observacao", message: "Observacao obrigatoria para ajuste" };
  }
  return null;
}

export function normalizeMovementPayload(values: MovementCreate, productId: number): MovementCreate {
  return {
    ...values,
    produto_id: productId,
    origem: values.tipo === "ENTRADA" ? undefined : values.origem,
    destino: values.tipo === "SAIDA" ? undefined : values.destino,
    motivo_ajuste: values.natureza === "AJUSTE" ? values.motivo_ajuste : undefined,
    observacao: values.observacao?.trim() || undefined,
    local_externo: values.local_externo?.trim() || undefined,
    documento: values.documento?.trim() || undefined,
    movimento_ref_id: values.movimento_ref_id || undefined,
  };
}
