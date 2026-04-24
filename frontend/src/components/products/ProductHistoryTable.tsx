import { Badge, Group, Loader, Pagination, Table, Text } from "@mantine/core";
import dayjs from "dayjs";

import type { MovementOut } from "../../lib/api";
import EmptyState from "../ui/EmptyState";

type ProductHistoryTableProps = {
  loading: boolean;
  errorMessage: string | null;
  rows: MovementOut[];
  totalItems: number;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  movementColor: (tipo: "ENTRADA" | "SAIDA" | "TRANSFERENCIA") => string;
  movementNatureLabel: (natureza: "OPERACAO_NORMAL" | "TRANSFERENCIA_EXTERNA" | "DEVOLUCAO" | "AJUSTE") => string;
  adjustmentReasonLabel: (reason?: string | null) => string;
  onRetry: () => void;
};

export function ProductHistoryTable({
  loading,
  errorMessage,
  rows,
  totalItems,
  page,
  totalPages,
  onPageChange,
  movementColor,
  movementNatureLabel,
  adjustmentReasonLabel,
  onRetry,
}: ProductHistoryTableProps) {
  if (loading) {
    return (
      <Group justify="center" py="md">
        <Loader size="sm" />
      </Group>
    );
  }

  if (errorMessage) {
    return (
      <EmptyState
        message={`Falha ao carregar historico: ${errorMessage}`}
        actionLabel="Tentar novamente"
        onAction={onRetry}
      />
    );
  }

  return (
    <>
      <Table striped highlightOnHover>
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
                <Text c="dimmed" ta="center">
                  Sem historico
                </Text>
              </Table.Td>
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>

      <Group justify="space-between">
        <Text size="sm" c="dimmed">
          Total: {totalItems}
        </Text>
        <Pagination value={page} onChange={onPageChange} total={totalPages} />
      </Group>
    </>
  );
}
