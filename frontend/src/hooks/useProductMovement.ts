import { useState } from "react";
import { useForm } from "@mantine/form";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "../lib/apiClient";
import type { MovementCreate, MovementOut, SuccessResponse } from "../lib/api";
import { notifyError, notifySuccess } from "../lib/notify";
import {
  createActionMovementValues,
  createInitialMovementValues,
  type ProductMovementType,
  validateMovementSubmission,
  normalizeMovementPayload,
} from "../lib/productMovement";

type UseProductMovementOptions = {
  selectedId: number | null;
  profileScopeKey: string;
  defaultLocationId: number;
};

export function useProductMovement({
  selectedId,
  profileScopeKey,
  defaultLocationId,
}: UseProductMovementOptions) {
  const queryClient = useQueryClient();
  const [action, setAction] = useState<ProductMovementType | null>(null);

  const movementForm = useForm<MovementCreate>({
    initialValues: createInitialMovementValues(
      selectedId ?? 0,
      defaultLocationId,
    ),
    validate: {
      quantidade: (value) => (value <= 0 ? "Quantidade inválida" : null),
      origem_location_id: (value, values) =>
        values.tipo !== "ENTRADA" && !value ? "Origem obrigatória" : null,
      destino_location_id: (value, values) =>
        values.tipo !== "SAIDA" && !value ? "Destino obrigatório" : null,
      natureza: (value, values) => {
        if (!value) return "Natureza obrigatória";
        if (value === "DEVOLUCAO" && values.tipo !== "ENTRADA") {
          return "Devolução só pode ser uma entrada";
        }
        if (
          value === "TRANSFERENCIA_EXTERNA" &&
          values.tipo !== "ENTRADA" &&
          values.tipo !== "SAIDA"
        ) {
          return "Transferência externa só pode ser entrada ou saída";
        }
        return null;
      },
      local_externo: (value, values) =>
        values.natureza === "TRANSFERENCIA_EXTERNA" && !(value || "").trim()
          ? "Informe o local externo"
          : null,
      movimento_ref_id: (value, values) => {
        if (values.natureza === "DEVOLUCAO" && (!value || value < 1)) {
          return "Informe a movimentação de referência";
        }
        if (value !== undefined && value !== null && value < 1) {
          return "Movimentação de referência inválida";
        }
        return null;
      },
      motivo_ajuste: (value, values) => {
        if (values.natureza === "AJUSTE" && !value) {
          return "Informe o motivo do ajuste";
        }
        return null;
      },
      observacao: (value, values) =>
        values.natureza === "AJUSTE" && !(value || "").trim()
          ? "Observação obrigatória para ajuste"
          : null,
    },
  });

  const createMovementMutation = useMutation<
    SuccessResponse<MovementOut>,
    Error,
    MovementCreate
  >({
    mutationFn: (payload) => api.createMovement(payload),
    onSuccess: () => {
      notifySuccess("Movimentação registrada");
      queryClient.invalidateQueries({
        queryKey: ["produtos", profileScopeKey],
      });
      queryClient.invalidateQueries({
        queryKey: ["produto", profileScopeKey, selectedId],
      });
      queryClient.invalidateQueries({
        queryKey: ["historico", profileScopeKey, selectedId],
      });
      queryClient.invalidateQueries({
        queryKey: ["movimentacoes", profileScopeKey],
      });
      queryClient.invalidateQueries({
        queryKey: ["analytics", profileScopeKey],
      });
    },
    onError: (error) => notifyError(error),
  });

  const selectAction = (next: ProductMovementType) => {
    if (action === next) {
      setAction(null);
      return;
    }
    setAction(next);
    movementForm.setValues(
      createActionMovementValues(next, selectedId ?? 0, defaultLocationId),
    );
  };

  const handleMovementSubmit = movementForm.onSubmit(
    (values: MovementCreate) => {
      if (!selectedId) return;

      const validationError = validateMovementSubmission(values);
      if (validationError) {
        movementForm.setFieldError(
          validationError.field,
          validationError.message,
        );
        return;
      }

      createMovementMutation.mutate(
        normalizeMovementPayload(values, selectedId),
      );
    },
  );

  return {
    action,
    movementForm,
    selectAction,
    handleMovementSubmit,
    createMovementLoading: createMovementMutation.isPending,
  };
}
