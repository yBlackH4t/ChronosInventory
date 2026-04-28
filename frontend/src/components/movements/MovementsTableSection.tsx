import { Badge, Button, Group, Loader, Pagination, Table, Text } from "@mantine/core";
import dayjs from "dayjs";

import type { MovementOut } from "../../lib/api";
import {
  adjustmentReasonLabel,
  movementColor,
  movementNatureLabel,
  type ResolvedMovementTableLayout,
} from "../../lib/movements";
import DataTable from "../ui/DataTable";
import EmptyState from "../ui/EmptyState";

type Props = {
  loading: boolean;
  errorMessage: string | null;
  onRetry: () => void;
  rows: MovementOut[];
  tableLayout: ResolvedMovementTableLayout;
  tableColumnCount: number;
  activeViewCount: number;
  clearFilters: () => void;
  totalItems: number;
  page: number;
  setPage: (page: number) => void;
  totalPages: number;
  openHistory: (productId: number) => void;
};

export default function MovementsTableSection({
  loading,
  errorMessage,
  onRetry,
  rows,
  tableLayout,
  tableColumnCount,
  activeViewCount,
  clearFilters,
  totalItems,
  page,
  setPage,
  totalPages,
  openHistory,
}: Props) {
  return (
    <>
      {loading ? (
        <Group justify="center" mt="xl">
          <Loader />
        </Group>
      ) : errorMessage ? (
        <EmptyState
          message={`Falha ao carregar movimentacoes: ${errorMessage}`}
          actionLabel="Tentar novamente"
          onAction={onRetry}
        />
      ) : (
        <DataTable minWidth={tableLayout.minWidth}>
          <Table striped highlightOnHover withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>ID</Table.Th>
                <Table.Th>Produto</Table.Th>
                <Table.Th>Tipo</Table.Th>
                <Table.Th>Natureza</Table.Th>
                <Table.Th>Qtd</Table.Th>
                <Table.Th>Origem</Table.Th>
                <Table.Th>Destino</Table.Th>
                <Table.Th>Documento</Table.Th>
                {tableLayout.showExtraColumns && <Table.Th>Motivo ajuste</Table.Th>}
                {tableLayout.showExtraColumns && <Table.Th>Local externo</Table.Th>}
                <Table.Th>Observacao</Table.Th>
                <Table.Th>Data</Table.Th>
                <Table.Th>Acoes</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((mov) => (
                <Table.Tr key={mov.id}>
                  <Table.Td>{mov.id}</Table.Td>
                  <Table.Td>
                    <Text
                      size="sm"
                      title={mov.produto_nome || `ID ${mov.produto_id}`}
                      maw={tableLayout.productMaxWidth}
                      style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    >
                      {mov.produto_nome || `ID ${mov.produto_id}`}
                    </Text>
                  </Table.Td>
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
                  {tableLayout.showExtraColumns && (
                    <Table.Td>{adjustmentReasonLabel(mov.motivo_ajuste)}</Table.Td>
                  )}
                  {tableLayout.showExtraColumns && <Table.Td>{mov.local_externo || "-"}</Table.Td>}
                  <Table.Td>
                    <Text
                      size="sm"
                      title={String(mov.observacao || "-")}
                      maw={tableLayout.observationMaxWidth}
                      style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    >
                      {String(mov.observacao || "-")}
                    </Text>
                  </Table.Td>
                  <Table.Td>{dayjs(mov.data).format("DD/MM/YYYY HH:mm")}</Table.Td>
                  <Table.Td>
                    <Button size="xs" variant="light" onClick={() => openHistory(mov.produto_id)}>
                      Ver historico
                    </Button>
                  </Table.Td>
                </Table.Tr>
              ))}
              {rows.length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={tableColumnCount}>
                    <EmptyState
                      message="Nenhuma movimentacao encontrada"
                      actionLabel={activeViewCount > 0 ? "Limpar filtros" : undefined}
                      onAction={activeViewCount > 0 ? clearFilters : undefined}
                    />
                  </Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </DataTable>
      )}

      <Group justify="space-between">
        <Text size="sm" c="dimmed">
          Total: {totalItems}
        </Text>
        <Pagination value={page} onChange={setPage} total={totalPages} />
      </Group>
    </>
  );
}
