import { Group, Loader, Modal, Table, Text } from "@mantine/core";
import dayjs from "dayjs";

import type { MovementOut } from "../../lib/api";
import {
  adjustmentReasonLabel,
  movementNatureLabel,
  signedQuantity,
} from "../../lib/movements";
import MovementTypeTag from "./MovementTypeTag";
import EmptyState from "../ui/EmptyState";
import { useLocations } from "../../hooks/useLocations";

type Props = {
  opened: boolean;
  onClose: () => void;
  historyProductId: number | null;
  loading: boolean;
  errorMessage: string | null;
  rows: MovementOut[];
  onRetry: () => void;
};

export default function MovementsHistoryModal({
  opened,
  onClose,
  historyProductId,
  loading,
  errorMessage,
  rows,
  onRetry,
}: Props) {
  const { locations } = useLocations();

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Histórico do produto"
      size="lg"
    >
      {!historyProductId ? (
        <Text c="dimmed">Selecione um produto para carregar o histórico.</Text>
      ) : loading ? (
        <Group justify="center" mt="sm">
          <Loader size="sm" />
        </Group>
      ) : errorMessage ? (
        <EmptyState
          message={`Falha ao carregar histórico: ${errorMessage}`}
          actionLabel="Tentar novamente"
          onAction={onRetry}
        />
      ) : (
        <div className="table-shell">
        <Table.ScrollContainer minWidth={900}>
          <Table verticalSpacing="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>ID</Table.Th>
                <Table.Th>Tipo</Table.Th>
                <Table.Th>Natureza</Table.Th>
                <Table.Th>Qtd</Table.Th>
                <Table.Th>Origem</Table.Th>
                <Table.Th>Destino</Table.Th>
                <Table.Th>Documento</Table.Th>
                <Table.Th>Motivo ajuste</Table.Th>
                <Table.Th>Local externo</Table.Th>
                <Table.Th>Observação</Table.Th>
                <Table.Th>Data</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((mov) => (
                <Table.Tr key={mov.id}>
                  <Table.Td c="dimmed" className="mono">{mov.id}</Table.Td>
                  <Table.Td>
                    <MovementTypeTag tipo={mov.tipo} />
                  </Table.Td>
                  <Table.Td>{movementNatureLabel(mov.natureza)}</Table.Td>
                  <Table.Td fw={600} className="num">
                    {signedQuantity(mov.tipo, mov.quantidade)}
                  </Table.Td>
                  <Table.Td>
                    {locations.find((l) => l.id === mov.origem_location_id)
                      ?.name || "-"}
                  </Table.Td>
                  <Table.Td>
                    {locations.find((l) => l.id === mov.destino_location_id)
                      ?.name || "-"}
                  </Table.Td>
                  <Table.Td>{mov.documento || "-"}</Table.Td>
                  <Table.Td>
                    {adjustmentReasonLabel(mov.motivo_ajuste)}
                  </Table.Td>
                  <Table.Td>{mov.local_externo || "-"}</Table.Td>
                  <Table.Td>{mov.observacao || "-"}</Table.Td>
                  <Table.Td>
                    {dayjs(mov.data).format("DD/MM/YYYY HH:mm")}
                  </Table.Td>
                </Table.Tr>
              ))}
              {rows.length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={11}>
                    <EmptyState message="Sem histórico" />
                  </Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        </div>
      )}
    </Modal>
  );
}
