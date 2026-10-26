import {
  Group,
  Loader,
  NumberInput,
  Pagination,
  Select,
  Table,
  Text,
  TextInput,
} from "@mantine/core";

import type {
  InventoryAdjustmentReason,
  InventoryCountOut,
} from "../../lib/api";
import EmptyState from "../ui/EmptyState";
import { detectBrand } from "../../lib/brands";
import { splitProductCode } from "../../lib/productView";
import "../../styles/products-movements.css";
import "../../styles/vidro-telas.css";

// Código em destaque e o resto do nome ao lado, como em Produtos.
function ProductCodeName({ nome }: { nome: string }) {
  const { code, rest } = splitProductCode(nome, detectBrand(nome));
  return (
    <Group gap={10} wrap="nowrap" miw={0}>
      {code && <span className="pm-code-cell">{code}</span>}
      <Text size="sm" fw={600} truncate="end" title={nome}>
        {(code ? rest : "") || nome}
      </Text>
    </Group>
  );
}

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
    item: InventoryCountOut,
  ) => void;
  adjustmentReasonOptions: {
    value: InventoryAdjustmentReason;
    label: string;
  }[];
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
    return (
      <Group justify="center" p="xl">
        <Loader size="sm" />
      </Group>
    );
  }

  if (errorMessage) {
    return (
      <EmptyState
        message="Falha ao carregar itens da sessão"
        description={errorMessage}
      />
    );
  }

  const editable = sessionStatus === "ABERTO";

  return (
    <>
      <Table.ScrollContainer minWidth={1180}>
        <Table verticalSpacing="xs">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Produto</Table.Th>
              <Table.Th w={90} ta="right">
                Sistema
              </Table.Th>
              <Table.Th w={130}>Físico</Table.Th>
              <Table.Th w={140}>Diferença</Table.Th>
              <Table.Th w={230}>Motivo</Table.Th>
              <Table.Th w={260}>Observação</Table.Th>
              <Table.Th w={90} ta="right">
                Mov.
              </Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {items.map((item) => {
              const edit = edits[item.produto_id];
              const qtdFisico =
                edit?.qtd_fisico ?? item.qtd_fisico ?? item.qtd_sistema;
              const divergencia = qtdFisico - item.qtd_sistema;
              const diverges = divergencia !== 0;

              return (
                <Table.Tr key={item.produto_id} data-diverge={diverges || undefined} className="vt-count-row">
                  <Table.Td>
                    <ProductCodeName nome={item.produto_nome} />
                    <Text size="xs" c="dimmed" className="mono">
                      #{item.produto_id}
                    </Text>
                  </Table.Td>
                  <Table.Td ta="right" className="num">
                    {item.qtd_sistema}
                  </Table.Td>
                  <Table.Td>
                    <NumberInput
                      min={0}
                      value={qtdFisico}
                      onChange={(value) =>
                        onSetItemEdit(
                          item.produto_id,
                          { qtd_fisico: Number(value ?? 0) },
                          item,
                        )
                      }
                      disabled={!editable}
                      w={110}
                      aria-label="Quantidade física"
                    />
                  </Table.Td>
                  <Table.Td>
                    <span
                      className="vt-diff num"
                      data-kind={!diverges ? "ok" : divergencia > 0 ? "sobra" : "falta"}
                    >
                      {!diverges
                        ? "OK"
                        : divergencia > 0
                          ? `+${divergencia} sobrando`
                          : `\u2212${Math.abs(divergencia)} faltando`}
                    </span>
                  </Table.Td>
                  <Table.Td>
                    <Select
                      data={adjustmentReasonOptions}
                      value={
                        (edit?.motivo_ajuste ?? item.motivo_ajuste ?? null) as
                          | string
                          | null
                      }
                      onChange={(value) =>
                        onSetItemEdit(
                          item.produto_id,
                          {
                            motivo_ajuste:
                              (value as InventoryAdjustmentReason | null) ??
                              null,
                          },
                          item,
                        )
                      }
                      placeholder={diverges ? "Obrigatório" : "—"}
                      disabled={!editable || !diverges}
                      aria-label="Motivo do ajuste"
                    />
                  </Table.Td>
                  <Table.Td>
                    <TextInput
                      value={(edit?.observacao ?? item.observacao ?? "") || ""}
                      onChange={(event) =>
                        onSetItemEdit(
                          item.produto_id,
                          { observacao: event.currentTarget.value },
                          item,
                        )
                      }
                      placeholder={diverges ? "Obrigatório" : "—"}
                      disabled={!editable || !diverges}
                      aria-label="Observação"
                    />
                  </Table.Td>
                  <Table.Td ta="right" c="dimmed" className="mono">
                    {item.applied_movement_id || "—"}
                  </Table.Td>
                </Table.Tr>
              );
            })}
            {items.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={7} style={{ borderBottom: 0 }}>
                  <EmptyState message="Nenhum item para o filtro selecionado" />
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>

      <Group justify="space-between" px="lg" py="sm">
        <Text size="xs" c="dimmed" className="num">
          {totalItems} itens
        </Text>
        {totalPages > 1 && (
          <Pagination size="sm" value={page} onChange={onPageChange} total={totalPages} />
        )}
      </Group>
    </>
  );
}
