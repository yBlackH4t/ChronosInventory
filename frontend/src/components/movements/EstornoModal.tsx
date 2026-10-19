import { Modal, Button, Stack, Text, TextInput, Group } from "@mantine/core";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import { createApiClient } from "../../lib/api";
import type { MovementOut, MovementCreate } from "../../lib/api";

// Como cada tipo aparece na frase ("desfazer esta entrada").
const TIPO_TEXTO: Record<MovementOut["tipo"], string> = {
  ENTRADA: "entrada",
  SAIDA: "saída",
  TRANSFERENCIA: "transferência",
};

// O lançamento que desfaz cada tipo.
const ESTORNO_TEXTO: Record<MovementOut["tipo"], string> = {
  ENTRADA: "uma saída",
  SAIDA: "uma entrada",
  TRANSFERENCIA: "uma transferência de volta",
};

type EstornoModalProps = {
  opened: boolean;
  onClose: () => void;
  movement: MovementOut | null;
  onSuccess?: () => void;
};

export default function EstornoModal({
  opened,
  onClose,
  movement,
  onSuccess,
}: EstornoModalProps) {
  const [observacao, setObservacao] = useState("");
  const queryClient = useQueryClient();

  const { mutate: estornar, isPending } = useMutation({
    mutationFn: async () => {
      if (!movement) throw new Error("Movimentação não selecionada");
      const api = createApiClient();
      const payload: MovementCreate = {
        tipo: movement.tipo === "ENTRADA" ? "SAIDA" : "ENTRADA",
        produto_id: movement.produto_id,
        quantidade: movement.quantidade,
        origem_location_id:
          movement.tipo === "SAIDA" ? undefined : movement.destino_location_id,
        destino_location_id:
          movement.tipo === "ENTRADA" ? undefined : movement.origem_location_id,
        natureza: "ESTORNO",
        movimento_ref_id: movement.id,
        observacao: observacao || `Estorno da movimentação #${movement.id}`,
      };
      return api.createMovement(payload);
    },
    onSuccess: () => {
      notifications.show({
        title: "Sucesso",
        message: "Estorno realizado com sucesso",
        color: "success",
      });
      // As chaves usadas pelas telas (antes eram "movements"/"products" e a lista não atualizava).
      for (const key of ["movimentacoes", "produtos", "produto", "historico", "produto-saldo-historico", "analytics"]) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
      setObservacao("");
      onSuccess?.();
      onClose();
    },
    onError: (error: Error) => {
      notifications.show({
        title: "Não foi possível estornar",
        message: error.message || "Tente de novo. Se continuar, avise o responsável.",
        color: "danger",
      });
    },
  });

  if (!movement) return null;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Estornar movimentação"
      centered
    >
      <Stack gap="md">
        <Text size="sm">
          Movimentação <strong>#{movement.id}</strong>: {TIPO_TEXTO[movement.tipo]} de{" "}
          {movement.quantidade} {movement.quantidade === 1 ? "item" : "itens"}.
        </Text>
        <Text size="sm">
          Será lançada {ESTORNO_TEXTO[movement.tipo]} de {movement.quantidade}{" "}
          {movement.quantidade === 1 ? "item" : "itens"} para desfazer esta{" "}
          {TIPO_TEXTO[movement.tipo]}.
        </Text>

        <TextInput
          label="Observação (opcional)"
          placeholder={`Estorno da movimentação #${movement.id}`}
          value={observacao}
          onChange={(e) => setObservacao(e.currentTarget.value)}
          data-autofocus
        />

        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={onClose} disabled={isPending}>
            Cancelar
          </Button>
          <Button color="danger" onClick={() => estornar()} loading={isPending}>
            Estornar movimentação
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
