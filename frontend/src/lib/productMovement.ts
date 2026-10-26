import type { MovementCreate } from "./api";
import {
  ADJUSTMENT_REASON_LABELS,
  MOVEMENT_NATURE_LABELS,
  movementColor as sharedMovementColor,
} from "./movements";

export type ProductMovementType = MovementCreate["tipo"];
export type ProductMovementNature = NonNullable<MovementCreate["natureza"]>;
export type ProductAdjustmentReason = NonNullable<
  MovementCreate["motivo_ajuste"]
>;

export const PRODUCT_MOVEMENT_NATURE_OPTIONS: {
  value: ProductMovementNature;
  label: string;
}[] = (Object.keys(MOVEMENT_NATURE_LABELS) as ProductMovementNature[]).map(
  (value) => ({ value, label: MOVEMENT_NATURE_LABELS[value] }),
);

export const PRODUCT_ADJUSTMENT_REASON_OPTIONS: {
  value: ProductAdjustmentReason;
  label: string;
}[] = (Object.keys(ADJUSTMENT_REASON_LABELS) as ProductAdjustmentReason[]).map(
  (value) => ({ value, label: ADJUSTMENT_REASON_LABELS[value] }),
);

export function movementColor(tipo: ProductMovementType) {
  return sharedMovementColor(tipo);
}

export function movementNatureLabel(natureza: ProductMovementNature) {
  return (
    PRODUCT_MOVEMENT_NATURE_OPTIONS.find((item) => item.value === natureza)
      ?.label ?? natureza
  );
}

export function adjustmentReasonLabel(reason?: ProductAdjustmentReason | null) {
  if (!reason) return "-";
  return (
    PRODUCT_ADJUSTMENT_REASON_OPTIONS.find((item) => item.value === reason)
      ?.label ?? reason
  );
}

export function movementNatureOptionsByType(
  tipo: ProductMovementType,
): { value: ProductMovementNature; label: string }[] {
  if (tipo === "ENTRADA") {
    return PRODUCT_MOVEMENT_NATURE_OPTIONS.filter(
      (item) =>
        item.value === "OPERACAO_NORMAL" ||
        item.value === "DEVOLUCAO" ||
        item.value === "AJUSTE" ||
        item.value === "ESTORNO" ||
        item.value === "TRANSFERENCIA_EXTERNA",
    );
  }
  if (tipo === "SAIDA") {
    return PRODUCT_MOVEMENT_NATURE_OPTIONS.filter(
      (item) =>
        item.value === "OPERACAO_NORMAL" ||
        item.value === "TRANSFERENCIA_EXTERNA" ||
        item.value === "ESTORNO" ||
        item.value === "AJUSTE",
    );
  }
  return PRODUCT_MOVEMENT_NATURE_OPTIONS.filter(
    (item) =>
      item.value !== "DEVOLUCAO" && item.value !== "TRANSFERENCIA_EXTERNA",
  );
}

export function createInitialMovementValues(
  productId = 0,
  defaultLocationId: number = 0,
): MovementCreate {
  return {
    tipo: "ENTRADA",
    produto_id: productId,
    quantidade: 1,
    origem_location_id: defaultLocationId,
    destino_location_id: defaultLocationId,
    observacao: "",
    natureza: "OPERACAO_NORMAL",
    local_externo: "",
    documento: "",
    movimento_ref_id: undefined,
    motivo_ajuste: undefined,
  };
}

export function createActionMovementValues(
  next: ProductMovementType,
  productId: number,
  defaultLocationId: number = 0,
): MovementCreate {
  return {
    tipo: next,
    produto_id: productId,
    quantidade: 1,
    origem_location_id: next === "ENTRADA" ? undefined : defaultLocationId,
    destino_location_id: next === "SAIDA" ? undefined : defaultLocationId,
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
  if (
    values.tipo === "TRANSFERENCIA" &&
    values.origem_location_id === values.destino_location_id
  ) {
    return {
      field: "destino_location_id",
      message: "Destino deve ser diferente da origem",
    };
  }
  if (values.natureza === "DEVOLUCAO" && values.tipo !== "ENTRADA") {
    return { field: "natureza", message: "Devolução só pode ser uma entrada" };
  }
  if (
    values.natureza === "TRANSFERENCIA_EXTERNA" &&
    values.tipo !== "ENTRADA" &&
    values.tipo !== "SAIDA"
  ) {
    return {
      field: "natureza",
      message: "Transferência externa só pode ser entrada ou saída",
    };
  }
  if (
    values.natureza === "TRANSFERENCIA_EXTERNA" &&
    !(values.local_externo || "").trim()
  ) {
    return { field: "local_externo", message: "Informe o local externo" };
  }
  if (
    values.natureza === "DEVOLUCAO" &&
    (!values.movimento_ref_id || values.movimento_ref_id < 1)
  ) {
    return {
      field: "movimento_ref_id",
      message: "Informe a movimentação de referência",
    };
  }
  if (
    values.natureza === "ESTORNO" &&
    (!values.movimento_ref_id || values.movimento_ref_id < 1)
  ) {
    return {
      field: "movimento_ref_id",
      message: "Informe a movimentação original a ser estornada",
    };
  }
  if (values.natureza === "AJUSTE" && !values.motivo_ajuste) {
    return { field: "motivo_ajuste", message: "Informe o motivo do ajuste" };
  }
  if (values.natureza === "AJUSTE" && !(values.observacao || "").trim()) {
    return {
      field: "observacao",
      message: "Observação obrigatória para ajuste",
    };
  }
  return null;
}

export function normalizeMovementPayload(
  values: MovementCreate,
  productId: number,
): MovementCreate {
  return {
    ...values,
    produto_id: productId,
    origem_location_id:
      values.tipo === "ENTRADA" ? undefined : values.origem_location_id,
    destino_location_id:
      values.tipo === "SAIDA" ? undefined : values.destino_location_id,
    motivo_ajuste:
      values.natureza === "AJUSTE" ? values.motivo_ajuste : undefined,
    observacao: values.observacao?.trim() || undefined,
    local_externo: values.local_externo?.trim() || undefined,
    documento: values.documento?.trim() || undefined,
    movimento_ref_id: values.movimento_ref_id || undefined,
  };
}
