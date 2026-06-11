import { Modal, Button, Stack, Text, TextInput, Group } from "@mantine/core";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import { createApiClient } from "../../lib/api";
import type { MovementOut, MovementCreate } from "../../lib/api";

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
        color: "green",
      });
      queryClient.invalidateQueries({ queryKey: ["movements"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["product-history"] });
      setObservacao("");
      onSuccess?.();
      onClose();
    },
    onError: (error: any) => {
      notifications.show({
        title: "Erro",
        message: error.message || "Falha ao realizar estorno",
        color: "red",
      });
    },
  });

  if (!movement) return null;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Confirmar Estorno"
      centered
    >
      <Stack gap="md">
        <Text size="sm">
          Você está prestes a estornar a movimentação <strong>#{movement.id}</strong> (
          {movement.tipo} de {movement.quantidade} itens). 
        </Text>
        <Text size="sm">
          Isso criará uma nova movimentação do tipo{" "}
          <strong>{movement.tipo === "ENTRADA" ? "SAIDA" : "ENTRADA"}</strong>{" "}
          com natureza <strong>ESTORNO</strong> para reverter o saldo.
        </Text>

        <TextInput
          label="Observação (Opcional)"
          placeholder={`Estorno da movimentação #${movement.id}`}
          value={observacao}
          onChange={(e) => setObservacao(e.currentTarget.value)}
          data-autofocus
        />

        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={onClose} disabled={isPending}>
            Cancelar
          </Button>
          <Button color="red" onClick={() => estornar()} loading={isPending}>
            Confirmar Estorno
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
