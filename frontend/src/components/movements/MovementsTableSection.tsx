import {
  ActionIcon,
  Group,
  Loader,
  Pagination,
  Stack,
  Table,
  Text,
  Tooltip,
} from "@mantine/core";
import { IconArrowBackUp, IconArrowRight, IconHistory } from "@tabler/icons-react";
import dayjs from "dayjs";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef, useState } from "react";

import type { MovementOut } from "../../lib/api";
import {
  adjustmentReasonLabel,
  movementNatureLabel,
  signedQuantity,
  type ResolvedMovementTableLayout,
} from "../../lib/movements";
import EmptyState from "../ui/EmptyState";
import { useLocations } from "../../hooks/useLocations";
import EstornoModal from "./EstornoModal";
import MovementTypeTag from "./MovementTypeTag";

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

const ROW_HEIGHT = 56;

export default function MovementsTableSection({
  loading,
  errorMessage,
  onRetry,
  rows,
  tableLayout,
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
  const [estornoMovement, setEstornoMovement] = useState<MovementOut | null>(null);

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  const locationName = (id?: number | null) =>
    id ? (locations.find((l) => l.id === id)?.name ?? `#${id}`) : null;

  const columnCount = tableLayout.showExtraColumns ? 8 : 7;
  const virtualItems = rowVirtualizer.getVirtualItems();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom = virtualItems.length > 0
    ? rowVirtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end
    : 0;

  return (
    <Stack gap="sm">
      {loading ? (
        <Group justify="center" mt="xl">
          <Loader size="sm" />
        </Group>
      ) : errorMessage ? (
        <EmptyState
          message="Falha ao carregar movimentações"
          description={errorMessage}
          actionLabel="Tentar novamente"
          onAction={onRetry}
        />
      ) : (
        <div
          ref={parentRef}
          className="table-shell"
          style={{ height: "calc(100vh - 330px)", minHeight: 320, overflow: "auto" }}
        >
          {/* Fixed layout: set columns keep their width and Produto takes the rest,
              so a 1024px window (976px of content) still shows the row actions. */}
          <Table
            stickyHeader
            verticalSpacing={0}
            layout="fixed"
            miw={tableLayout.showExtraColumns ? 1080 : 920}
          >
            <Table.Thead>
              <Table.Tr>
                <Table.Th w={112}>Data</Table.Th>
                <Table.Th>Produto</Table.Th>
                <Table.Th w={150}>Tipo</Table.Th>
                <Table.Th w={64} ta="right">
                  Qtd
                </Table.Th>
                <Table.Th w={180}>Origem → destino</Table.Th>
                <Table.Th w={tableLayout.showExtraColumns ? 170 : 180}>
                  Documento / obs.
                </Table.Th>
                {tableLayout.showExtraColumns && (
                  <Table.Th w={150}>Ajuste / externo</Table.Th>
                )}
                <Table.Th w={76} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {paddingTop > 0 && (
                <Table.Tr>
                  <Table.Td style={{ height: paddingTop, padding: 0 }} colSpan={columnCount} />
                </Table.Tr>
              )}

              {virtualItems.map((virtualRow) => {
                const mov = rows[virtualRow.index];
                const origem = locationName(mov.origem_location_id);
                const destino = locationName(mov.destino_location_id);
                const isEstorno = mov.natureza === "ESTORNO";
                return (
                  <Table.Tr key={mov.id} style={{ height: ROW_HEIGHT }}>
                    <Table.Td>
                      <Text size="sm" className="num">
                        {dayjs(mov.data).format("DD/MM/YYYY")}
                      </Text>
                      <Text size="xs" c="dimmed" className="num">
                        {dayjs(mov.data).format("HH:mm")} · #{mov.id}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text
                        size="sm"
                        fw={500}
                        truncate="end"
                        title={mov.produto_nome || `ID ${mov.produto_id}`}
                      >
                        {mov.produto_nome || `ID ${mov.produto_id}`}
                      </Text>
                      <Text size="xs" c="dimmed" className="mono">
                        #{mov.produto_id}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <MovementTypeTag tipo={mov.tipo} />
                      <Text size="xs" c="dimmed" truncate="end">
                        {movementNatureLabel(mov.natureza)}
                      </Text>
                    </Table.Td>
                    <Table.Td ta="right">
                      <Text size="sm" fw={600} className="num">
                        {signedQuantity(mov.tipo, mov.quantidade)}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Group gap={6} wrap="nowrap" style={{ overflow: "hidden" }}>
                        <Text size="sm" c={origem ? undefined : "var(--text-subtle)"} truncate="end" miw={0}>
                          {origem ?? "—"}
                        </Text>
                        <IconArrowRight size={12} stroke={1.5} color="var(--text-subtle)" style={{ flexShrink: 0 }} />
                        <Text size="sm" c={destino ? undefined : "var(--text-subtle)"} truncate="end" miw={0}>
                          {destino ?? "—"}
                        </Text>
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" truncate="end" c={mov.documento ? undefined : "var(--text-subtle)"}>
                        {mov.documento || "—"}
                      </Text>
                      {mov.observacao ? (
                        <Text
                          size="xs"
                          c="dimmed"
                          truncate="end"
                          title={String(mov.observacao)}
                        >
                          {String(mov.observacao)}
                        </Text>
                      ) : null}
                    </Table.Td>
                    {tableLayout.showExtraColumns && (
                      <Table.Td>
                        <Text size="xs" c="dimmed" truncate="end">
                          {mov.motivo_ajuste ? adjustmentReasonLabel(mov.motivo_ajuste) : "—"}
                        </Text>
                        {mov.local_externo ? (
                          <Text size="xs" c="dimmed" truncate="end">
                            {mov.local_externo}
                          </Text>
                        ) : null}
                      </Table.Td>
                    )}
                    <Table.Td>
                      <Group gap={2} justify="flex-end" wrap="nowrap" className="row-actions">
                        <Tooltip label="Histórico do produto">
                          <ActionIcon
                            color="gray"
                            aria-label="Histórico do produto"
                            onClick={() => openHistory(mov.produto_id)}
                          >
                            <IconHistory size={16} stroke={1.5} />
                          </ActionIcon>
                        </Tooltip>
                        <Tooltip label={isEstorno ? "Já é um estorno" : "Estornar movimentação"}>
                          <ActionIcon
                            color="gray"
                            className="action-danger"
                            aria-label="Estornar movimentação"
                            onClick={() => setEstornoMovement(mov)}
                            disabled={isEstorno}
                          >
                            <IconArrowBackUp size={16} stroke={1.5} />
                          </ActionIcon>
                        </Tooltip>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                );
              })}

              {paddingBottom > 0 && (
                <Table.Tr>
                  <Table.Td style={{ height: paddingBottom, padding: 0 }} colSpan={columnCount} />
                </Table.Tr>
              )}

              {rows.length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={columnCount} style={{ borderBottom: 0 }}>
                    <EmptyState
                      message="Nenhuma movimentação encontrada"
                      description={
                        activeViewCount > 0 ? "Ajuste ou limpe os filtros aplicados." : undefined
                      }
                      actionLabel={activeViewCount > 0 ? "Limpar filtros" : undefined}
                      onAction={activeViewCount > 0 ? clearFilters : undefined}
                    />
                  </Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </div>
      )}

      <Group justify="space-between">
        <Text size="xs" c="dimmed" className="num">
          {totalItems.toLocaleString("pt-BR")} movimentações
        </Text>
        {totalPages > 1 && (
          <Pagination size="sm" value={page} onChange={setPage} total={totalPages} />
        )}
      </Group>

      <EstornoModal
        opened={!!estornoMovement}
        onClose={() => setEstornoMovement(null)}
        movement={estornoMovement}
      />
    </Stack>
  );
}
