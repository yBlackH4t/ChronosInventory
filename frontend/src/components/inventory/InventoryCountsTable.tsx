import { Badge, NumberInput, Pagination, Select, Table, Text, TextInput, Group } from "@mantine/core";

import type { InventoryAdjustmentReason, InventoryCountOut } from "../../lib/api";
import DataTable from "../ui/DataTable";
import EmptyState from "../ui/EmptyState";

type InventoryCountsTableProps = {
  loading: boolean;
  errorMessage: string | null;
  items: InventoryCountOut[];
  sessionStatus: string;
  edits: Record<
    number,
    {
      qtd_fisico: number;
      motivo_ajuste?: InventoryAdjustmentReason | null;
      observacao?: string | null;
    }
  >;
  onSetItemEdit: (
    productId: number,
    patch: {
      qtd_fisico?: number;
      motivo_ajuste?: InventoryAdjustmentReason | null;
      observacao?: string | null;
    },
    item: InventoryCountOut
  ) => void;
  adjustmentReasonOptions: { value: InventoryAdjustmentReason; label: string }[];
  totalItems: number;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
};

export function InventoryCountsTable({
  loading,
  errorMessage,
  items,
  sessionStatus,
  edits,
  onSetItemEdit,
  adjustmentReasonOptions,
  totalItems,
  page,
  totalPages,
  onPageChange,
}: InventoryCountsTableProps) {
  if (loading) {
    return <Text c="dimmed">Carregando itens...</Text>;
  }

  if (errorMessage) {
    return (
      <EmptyState
        message={`Falha ao carregar itens da sessao: ${errorMessage}`}
      />
    );
  }

  return (
    <>
      <DataTable minWidth={1200}>
        <Table striped highlightOnHover withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>ID</Table.Th>
              <Table.Th>Produto</Table.Th>
              <Table.Th>Sistema</Table.Th>
              <Table.Th>Fisico</Table.Th>
              <Table.Th>Divergencia</Table.Th>
              <Table.Th>Analise</Table.Th>
              <Table.Th>Motivo</Table.Th>
              <Table.Th>Observacao</Table.Th>
              <Table.Th>Movimento</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {items.map((item) => {
              const edit = edits[item.produto_id];
              const qtdFisico = edit?.qtd_fisico ?? item.qtd_fisico ?? item.qtd_sistema;
              const divergencia = qtdFisico - item.qtd_sistema;

              return (
                <Table.Tr key={item.produto_id}>
                  <Table.Td>{item.produto_id}</Table.Td>
                  <Table.Td>{item.produto_nome}</Table.Td>
                  <Table.Td>{item.qtd_sistema}</Table.Td>
                  <Table.Td>
                    <NumberInput
                      min={0}
                      value={qtdFisico}
                      onChange={(value) =>
                        onSetItemEdit(item.produto_id, { qtd_fisico: Number(value ?? 0) }, item)
                      }
                      disabled={sessionStatus !== "ABERTO"}
                      w={120}
                    />
                  </Table.Td>
                  <Table.Td>
                    <Badge color={divergencia === 0 ? "gray" : divergencia > 0 ? "green" : "red"} variant="light">
                      {divergencia}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Badge color={divergencia === 0 ? "gray" : divergencia > 0 ? "green" : "red"} variant="light">
                      {divergencia === 0 ? "OK" : divergencia > 0 ? `A mais: ${divergencia}` : `Faltando: ${Math.abs(divergencia)}`}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Select
                      data={adjustmentReasonOptions}
                      value={(edit?.motivo_ajuste ?? item.motivo_ajuste ?? null) as string | null}
                      onChange={(value) =>
                        onSetItemEdit(
                          item.produto_id,
                          { motivo_ajuste: (value as InventoryAdjustmentReason | null) ?? null },
                          item
                        )
                      }
                      placeholder={divergencia !== 0 ? "Obrigatorio se divergir" : "-"}
                      disabled={sessionStatus !== "ABERTO" || divergencia === 0}
                      w={220}
                    />
                  </Table.Td>
                  <Table.Td>
                    <TextInput
                      value={(edit?.observacao ?? item.observacao ?? "") || ""}
                      onChange={(event) =>
                        onSetItemEdit(item.produto_id, { observacao: event.currentTarget.value }, item)
                      }
                      placeholder={divergencia !== 0 ? "Obrigatorio se divergir" : "-"}
                      disabled={sessionStatus !== "ABERTO" || divergencia === 0}
                      w={260}
                    />
                  </Table.Td>
                  <Table.Td>{item.applied_movement_id || "-"}</Table.Td>
                </Table.Tr>
              );
            })}
            {items.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={9}>
                  <EmptyState message="Nenhum item para o filtro selecionado." />
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </DataTable>

      <Group justify="space-between">
        <Text size="sm" c="dimmed">
          Total: {totalItems}
        </Text>
        <Pagination value={page} onChange={onPageChange} total={totalPages} />
      </Group>
    </>
  );
}
