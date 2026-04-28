import { Badge, Group, Loader, Modal, Table, Text } from "@mantine/core";
import dayjs from "dayjs";

import type { MovementOut } from "../../lib/api";
import { adjustmentReasonLabel, movementColor, movementNatureLabel } from "../../lib/movements";
import EmptyState from "../ui/EmptyState";

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
  return (
    <Modal opened={opened} onClose={onClose} title="Historico do produto" size="lg">
      {!historyProductId ? (
        <Text c="dimmed">Selecione um produto para carregar o historico.</Text>
      ) : loading ? (
        <Group justify="center" mt="sm">
          <Loader size="sm" />
        </Group>
      ) : errorMessage ? (
        <EmptyState
          message={`Falha ao carregar historico: ${errorMessage}`}
          actionLabel="Tentar novamente"
          onAction={onRetry}
        />
      ) : (
        <Table.ScrollContainer minWidth={900}>
          <Table striped withTableBorder>
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
                <Table.Th>Observacao</Table.Th>
                <Table.Th>Data</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((mov) => (
                <Table.Tr key={mov.id}>
                  <Table.Td>{mov.id}</Table.Td>
                  <Table.Td>
                    <Badge color={movementColor(mov.tipo)} variant="light">
                      {mov.tipo}
                    </Badge>
                  </Table.Td>
                  <Table.Td>{movementNatureLabel(mov.natureza)}</Table.Td>
                  <Table.Td>{mov.quantidade}</Table.Td>
                  <Table.Td>{mov.origem || "-"}</Table.Td>
                  <Table.Td>{mov.destino || "-"}</Table.Td>
                  <Table.Td>{mov.documento || "-"}</Table.Td>
                  <Table.Td>{adjustmentReasonLabel(mov.motivo_ajuste)}</Table.Td>
                  <Table.Td>{mov.local_externo || "-"}</Table.Td>
                  <Table.Td>{mov.observacao || "-"}</Table.Td>
                  <Table.Td>{dayjs(mov.data).format("DD/MM/YYYY HH:mm")}</Table.Td>
                </Table.Tr>
              ))}
              {rows.length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={11}>
                    <EmptyState message="Sem historico" />
                  </Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
    </Modal>
  );
}
