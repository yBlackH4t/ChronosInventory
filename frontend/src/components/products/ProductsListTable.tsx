import {
  ActionIcon,
  Badge,
  Group,
  Loader,
  Pagination,
  Table,
  Text,
  Tooltip,
} from "@mantine/core";
import { IconBarcode, IconEdit, IconTrash } from "@tabler/icons-react";

import type { Product } from "../../lib/api";
import DataTable from "../ui/DataTable";
import EmptyState from "../ui/EmptyState";

type ProductsListTableProps = {
  rows: Product[];
  page: number;
  pageSize: string;
  selectedId: number | null;
  totalItems: number;
  totalPages: number;
  loading: boolean;
  errorMessage: string | null;
  query: string;
  onRetry: () => void;
  onClearSearch: () => void;
  onOpenDetails: (product: Product) => void;
  onOpenSingleLabel: (productId: number) => void;
  onOpenEdit: (product: Product) => void;
  onConfirmDelete: (product: Product) => void;
  onPageChange: (page: number) => void;
};

export function ProductsListTable({
  rows,
  page,
  pageSize,
  selectedId,
  totalItems,
  totalPages,
  loading,
  errorMessage,
  query,
  onRetry,
  onClearSearch,
  onOpenDetails,
  onOpenSingleLabel,
  onOpenEdit,
  onConfirmDelete,
  onPageChange,
}: ProductsListTableProps) {
  if (loading) {
    return (
      <Group justify="center" mt="xl">
        <Loader />
      </Group>
    );
  }

  if (errorMessage) {
    return (
      <EmptyState
        message={`Falha ao carregar produtos: ${errorMessage}`}
        actionLabel="Tentar novamente"
        onAction={onRetry}
      />
    );
  }

  return (
    <>
      <DataTable minWidth={860}>
        <Table striped highlightOnHover withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>#</Table.Th>
              <Table.Th>ID</Table.Th>
              <Table.Th>Nome</Table.Th>
              <Table.Th>Canoas</Table.Th>
              <Table.Th>PF</Table.Th>
              <Table.Th>Total</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Acoes</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((product, index) => {
              const position = (page - 1) * Number(pageSize) + index + 1;
              const inStock = product.total_stock > 0;
              const rowClass = `${inStock ? "row-in-stock" : "row-out-stock"} ${selectedId === product.id ? "row-selected" : ""}`;

              return (
                <Table.Tr
                  key={product.id}
                  className={rowClass}
                  onClick={() => onOpenDetails(product)}
                  style={{ cursor: "pointer" }}
                >
                  <Table.Td>{position}</Table.Td>
                  <Table.Td>{product.id}</Table.Td>
                  <Table.Td>{product.nome}</Table.Td>
                  <Table.Td>{product.qtd_canoas}</Table.Td>
                  <Table.Td>{product.qtd_pf}</Table.Td>
                  <Table.Td>
                    <Badge variant="light">{product.total_stock}</Badge>
                  </Table.Td>
                  <Table.Td>
                    <Badge color={inStock ? "green" : "red"} variant="light">
                      {inStock ? "Em estoque" : "Sem estoque"}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs" onClick={(event) => event.stopPropagation()}>
                      <Tooltip label="Gerar etiqueta">
                        <ActionIcon variant="light" onClick={() => onOpenSingleLabel(product.id)}>
                          <IconBarcode size={16} />
                        </ActionIcon>
                      </Tooltip>
                      <ActionIcon variant="light" onClick={() => onOpenEdit(product)}>
                        <IconEdit size={16} />
                      </ActionIcon>
                      <ActionIcon color="red" variant="light" onClick={() => onConfirmDelete(product)}>
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              );
            })}
            {rows.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={8}>
                  <EmptyState
                    message="Nenhum produto encontrado"
                    actionLabel={query.trim() ? "Limpar busca" : undefined}
                    onAction={query.trim() ? onClearSearch : undefined}
                  />
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
