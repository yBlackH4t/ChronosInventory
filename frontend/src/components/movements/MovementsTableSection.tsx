import {
  Badge,
  Button,
  Group,
  Loader,
  Pagination,
  Table,
  Text,
} from "@mantine/core";
import dayjs from "dayjs";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";

import type { MovementOut } from "../../lib/api";
import {
  adjustmentReasonLabel,
  movementColor,
  movementNatureLabel,
  type ResolvedMovementTableLayout,
} from "../../lib/movements";
import EmptyState from "../ui/EmptyState";
import { useLocations } from "../../hooks/useLocations";

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
  const { locations } = useLocations();
  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 60,
    overscan: 10,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom = virtualItems.length > 0
    ? rowVirtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end
    : 0;

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
        <div 
          ref={parentRef} 
          style={{ 
            height: 'calc(100vh - 350px)', 
            overflow: 'auto',
            border: '1px solid var(--mantine-color-default-border)',
            borderRadius: 'var(--mantine-radius-md)',
          }}
        >
          <Table striped highlightOnHover withTableBorder style={{ border: 0 }}>
            <Table.Thead style={{ position: 'sticky', top: 0, zIndex: 1, backgroundColor: 'var(--mantine-color-body)' }}>
              <Table.Tr>
                <Table.Th>ID</Table.Th>
                <Table.Th>Produto</Table.Th>
                <Table.Th>Tipo</Table.Th>
                <Table.Th>Natureza</Table.Th>
                <Table.Th>Qtd</Table.Th>
                <Table.Th>Origem</Table.Th>
                <Table.Th>Destino</Table.Th>
                <Table.Th>Documento</Table.Th>
                {tableLayout.showExtraColumns && (
                  <Table.Th>Motivo ajuste</Table.Th>
                )}
                {tableLayout.showExtraColumns && (
                  <Table.Th>Local externo</Table.Th>
                )}
                <Table.Th>Observacao</Table.Th>
                <Table.Th>Data</Table.Th>
                <Table.Th>Acoes</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {paddingTop > 0 && (
                <Table.Tr>
                  <Table.Td style={{ height: paddingTop, padding: 0 }} colSpan={tableColumnCount} />
                </Table.Tr>
              )}

              {virtualItems.map((virtualRow) => {
                const mov = rows[virtualRow.index];
                return (
                  <Table.Tr key={mov.id} style={{ height: `${virtualRow.size}px` }}>
                    <Table.Td>{mov.id}</Table.Td>
                    <Table.Td>
                      <Text
                        size="sm"
                        title={mov.produto_nome || `ID ${mov.produto_id}`}
                        maw={tableLayout.productMaxWidth}
                        style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
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
                    <Table.Td>
                      {locations.find((l) => l.id === mov.origem_location_id)
                        ?.name || "-"}
                    </Table.Td>
                    <Table.Td>
                      {locations.find((l) => l.id === mov.destino_location_id)
                        ?.name || "-"}
                    </Table.Td>
                    <Table.Td>{mov.documento || "-"}</Table.Td>
                    {tableLayout.showExtraColumns && (
                      <Table.Td>
                        {adjustmentReasonLabel(mov.motivo_ajuste)}
                      </Table.Td>
                    )}
                    {tableLayout.showExtraColumns && (
                      <Table.Td>{mov.local_externo || "-"}</Table.Td>
                    )}
                    <Table.Td>
                      <Text
                        size="sm"
                        title={String(mov.observacao || "-")}
                        maw={tableLayout.observationMaxWidth}
                        style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {String(mov.observacao || "-")}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      {dayjs(mov.data).format("DD/MM/YYYY HH:mm")}
                    </Table.Td>
                    <Table.Td>
                      <Button
                        size="xs"
                        variant="light"
                        onClick={() => openHistory(mov.produto_id)}
                      >
                        Ver historico
                      </Button>
                    </Table.Td>
                  </Table.Tr>
                );
              })}

              {paddingBottom > 0 && (
                <Table.Tr>
                  <Table.Td style={{ height: paddingBottom, padding: 0 }} colSpan={tableColumnCount} />
                </Table.Tr>
              )}

              {rows.length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={tableColumnCount}>
                    <EmptyState
                      message="Nenhuma movimentacao encontrada"
                      actionLabel={
                        activeViewCount > 0 ? "Limpar filtros" : undefined
                      }
                      onAction={activeViewCount > 0 ? clearFilters : undefined}
                    />
                  </Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </div>
      )}

      <Group justify="space-between" mt="md">
        <Text size="sm" c="dimmed">
          Total: {totalItems}
        </Text>
        <Pagination value={page} onChange={setPage} total={totalPages} />
      </Group>
    </>
  );
}
