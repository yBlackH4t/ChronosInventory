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
import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";

import type { InventoryLocation, Product } from "../../lib/api";
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
  locations?: InventoryLocation[];
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
  locations = [],
}: ProductsListTableProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 60, // approximate row height
    overscan: 10,
  });

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

  const virtualItems = rowVirtualizer.getVirtualItems();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom = virtualItems.length > 0
    ? rowVirtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end
    : 0;

  return (
    <>
      <div 
        ref={parentRef} 
        style={{ 
          height: 'calc(100vh - 280px)', 
          overflow: 'auto',
          border: '1px solid var(--mantine-color-default-border)',
          borderRadius: 'var(--mantine-radius-md)',
        }}
      >
        <Table striped highlightOnHover withTableBorder style={{ border: 0 }}>
          <Table.Thead style={{ position: 'sticky', top: 0, zIndex: 1, backgroundColor: 'var(--mantine-color-body)' }}>
            <Table.Tr>
              <Table.Th>#</Table.Th>
              <Table.Th>ID</Table.Th>
              <Table.Th>Nome</Table.Th>
              {locations.map((loc) => (
                <Table.Th key={loc.id}>{loc.label || loc.name}</Table.Th>
              ))}
              <Table.Th>Total</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Acoes</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {paddingTop > 0 && (
              <Table.Tr>
                <Table.Td style={{ height: paddingTop, padding: 0 }} colSpan={7 + locations.length} />
              </Table.Tr>
            )}
            
            {virtualItems.map((virtualRow) => {
              const product = rows[virtualRow.index];
              const position = (page - 1) * Number(pageSize) + virtualRow.index + 1;
              const inStock = product.total_stock > 0;
              const rowClass = `${inStock ? "row-in-stock" : "row-out-stock"} ${selectedId === product.id ? "row-selected" : ""}`;

              return (
                <Table.Tr
                  key={product.id}
                  className={rowClass}
                  onClick={() => onOpenDetails(product)}
                  style={{ cursor: "pointer", height: `${virtualRow.size}px` }}
                >
                  <Table.Td>{position}</Table.Td>
                  <Table.Td>
                    <Text fw={500} size="sm" c="dimmed">#{product.id}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text fw={600} size="sm" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "300px" }}>
                      {product.nome}
                    </Text>
                  </Table.Td>
                  {locations.map((loc) => (
                    <Table.Td key={loc.id}>
                      {product.inventories?.[loc.id] ?? 0}
                    </Table.Td>
                  ))}
                  <Table.Td>
                    <Badge variant="light">{product.total_stock}</Badge>
                  </Table.Td>
                  <Table.Td>
                    <Badge color={inStock ? "green" : "red"} variant="light">
                      {inStock ? "Em estoque" : "Sem estoque"}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Group
                      gap="xs"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <Tooltip label="Gerar etiqueta">
                        <ActionIcon
                          variant="light"
                          onClick={() => onOpenSingleLabel(product.id)}
                        >
                          <IconBarcode size={16} />
                        </ActionIcon>
                      </Tooltip>
                      <ActionIcon
                        variant="light"
                        onClick={() => onOpenEdit(product)}
                      >
                        <IconEdit size={16} />
                      </ActionIcon>
                      <ActionIcon
                        color="red"
                        variant="light"
                        onClick={() => onConfirmDelete(product)}
                      >
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              );
            })}

            {paddingBottom > 0 && (
              <Table.Tr>
                <Table.Td style={{ height: paddingBottom, padding: 0 }} colSpan={7 + locations.length} />
              </Table.Tr>
            )}

            {rows.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={7 + locations.length}>
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
      </div>

      <Group justify="space-between" mt="md">
        <Text size="sm" c="dimmed">
          Total: {totalItems}
        </Text>
        <Pagination value={page} onChange={onPageChange} total={totalPages} />
      </Group>
    </>
  );
}
