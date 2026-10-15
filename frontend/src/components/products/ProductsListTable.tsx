import {
  ActionIcon,
  Badge,
  Group,
  Skeleton,
  Pagination,
  Stack,
  Table,
  Text,
  Tooltip,
} from "@mantine/core";
import {
  IconArrowsExchange,
  IconBarcode,
  IconEdit,
  IconLink,
  IconTrash,
} from "@tabler/icons-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";

import type { InventoryLocation, Product } from "../../lib/api";
import { detectBrand, detectCondition } from "../../lib/brands";
import { useRowHeight } from "../../lib/appearance";
import { useProductsVisual } from "../../hooks/useProductsVisual";
import EmptyState from "../ui/EmptyState";
import StockPill from "../ui/StockPill";
import ProductThumb from "./ProductThumb";
import SalesMiniBars from "./SalesMiniBars";

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
  onOpenLinks: (product: Product) => void;
  onQuickMove?: (product: Product) => void;
  onHoverProduct?: (product: Product | null) => void;
  onPageChange: (page: number) => void;
  locations?: InventoryLocation[];
};


function linkSummary(product: Product): string | null {
  if (product.produto_vinculado_id) {
    const name = product.produto_vinculado_nome
      ? ` ${product.produto_vinculado_nome}`
      : "";
    return `Equivalente a #${product.produto_vinculado_id}${name}`;
  }
  if (product.linked_count > 0) {
    return `${product.linked_count} ${
      product.linked_count === 1 ? "vínculo" : "vínculos"
    }`;
  }
  return null;
}

export function ProductsListTable({
  rows,
  page,
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
  onOpenLinks,
  onQuickMove,
  onHoverProduct,
  onPageChange,
  locations = [],
}: ProductsListTableProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const ROW_HEIGHT = useRowHeight(60);
  const compact = ROW_HEIGHT < 60;
  const visual = useProductsVisual(rows.map((row) => row.id));

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  if (loading) {
    return (
      <Stack gap={6} mt="xs" aria-label="Carregando produtos">
        {Array.from({ length: 8 }, (_, index) => (
          <Group key={index} gap="sm" wrap="nowrap">
            <Skeleton h={38} w={38} radius="md" />
            <Stack gap={6} style={{ flex: 1 }}>
              <Skeleton h={12} w={`${55 - (index % 3) * 10}%`} radius="sm" />
              <Skeleton h={10} w="18%" radius="sm" />
            </Stack>
            <Skeleton h={22} w={44} radius="sm" />
          </Group>
        ))}
      </Stack>
    );
  }

  if (errorMessage) {
    return (
      <EmptyState
        message="Falha ao carregar produtos"
        description={errorMessage}
        actionLabel="Tentar novamente"
        onAction={onRetry}
      />
    );
  }

  const columnCount = 4 + locations.length;
  const virtualItems = rowVirtualizer.getVirtualItems();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom =
    virtualItems.length > 0
      ? rowVirtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end
      : 0;

  return (
    <Stack gap="sm">
      <div
        ref={parentRef}
        className="table-shell"
        style={{
          height: "calc(100vh - 330px)",
          minHeight: 320,
          overflow: "auto",
        }}
      >
        <Table layout="fixed" stickyHeader verticalSpacing={0} miw={640}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Produto</Table.Th>
              <Table.Th w={124}>Vendas 90 dias</Table.Th>
              {locations.map((loc) => (
                <Table.Th key={loc.id} w={110} ta="right">
                  {loc.label || loc.name}
                </Table.Th>
              ))}
              <Table.Th w={90} ta="right">
                Total
              </Table.Th>
              <Table.Th w={196} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {paddingTop > 0 && (
              <Table.Tr>
                <Table.Td
                  style={{ height: paddingTop, padding: 0 }}
                  colSpan={columnCount}
                />
              </Table.Tr>
            )}

            {virtualItems.map((virtualRow) => {
              const product = rows[virtualRow.index];
              const inStock = product.total_stock > 0;
              const brand = detectBrand(product.nome);
              const condition = detectCondition(product.nome);
              const links = linkSummary(product);
              const hasLinks =
                product.linked_count > 0 || !!product.produto_vinculado_id;

              return (
                <Table.Tr
                  key={product.id}
                  className={selectedId === product.id ? "row-selected" : undefined}
                  onClick={() => onOpenDetails(product)}
                  onMouseEnter={() => onHoverProduct?.(product)}
                  onMouseLeave={() => onHoverProduct?.(null)}
                  style={{ cursor: "pointer", height: ROW_HEIGHT }}
                >
                  <Table.Td>
                    <Group gap={10} wrap="nowrap">
                    {!compact && (
                      <ProductThumb base64={visual.get(product.id)?.thumb_base64} alt={product.nome} />
                    )}
                    <Stack gap={2} miw={0} style={{ flex: 1 }}>
                      <Group gap={8} wrap="nowrap">
                        {brand && (
                          <Badge
                            size="xs"
                            color={brand.color}
                            variant="light"
                            style={{ flexShrink: 0 }}
                          >
                            {brand.label}
                          </Badge>
                        )}
                        <Badge
                          size="xs"
                          color={condition.color}
                          variant="outline"
                          style={{ flexShrink: 0 }}
                        >
                          {condition.label}
                        </Badge>
                        <Text
                          fw={650}
                          size="sm"
                          truncate="end"
                          c={inStock ? undefined : "dimmed"}
                        >
                          {product.nome}
                        </Text>
                      </Group>
                      <Text size="xs" c="dimmed" truncate="end">
                        <span className="mono">#{product.id}</span>
                        {links && <> · {links}</>}
                      </Text>
                    </Stack>
                    </Group>
                  </Table.Td>

                  <Table.Td>
                    <SalesMiniBars weeks={visual.get(product.id)?.saidas_semanas} />
                  </Table.Td>

                  {locations.map((loc) => {
                    const qty = product.inventories?.[loc.id] ?? 0;
                    return (
                      <Table.Td key={loc.id} ta="right">
                        {qty > 0 ? (
                          <StockPill value={qty} />
                        ) : (
                          <Text size="sm" c="var(--text-subtle)">
                            —
                          </Text>
                        )}
                      </Table.Td>
                    );
                  })}

                  <Table.Td ta="right">
                    <StockPill value={product.total_stock} />
                  </Table.Td>

                  <Table.Td>
                    <Group
                      gap={2}
                      justify="flex-end"
                      wrap="nowrap"
                      className="row-actions"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <Tooltip label="Movimentar estoque (tecla N)">
                        <ActionIcon
                          color="blue"
                          variant="light"
                          aria-label="Movimentar estoque (tecla N)"
                          onClick={() => onQuickMove?.(product)}
                        >
                          <IconArrowsExchange size={16} stroke={1.75} />
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip
                        label={hasLinks ? "Ver vínculos" : "Adicionar vínculo"}
                      >
                        <ActionIcon
                          color={hasLinks ? "brand" : "gray"}
                          aria-label="Vínculos"
                          onClick={() => onOpenLinks(product)}
                        >
                          <IconLink size={16} stroke={1.5} />
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label="Gerar etiqueta">
                        <ActionIcon
                          color="gray"
                          aria-label="Gerar etiqueta"
                          onClick={() => onOpenSingleLabel(product.id)}
                        >
                          <IconBarcode size={16} stroke={1.5} />
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label="Editar cadastro">
                        <ActionIcon
                          color="gray"
                          aria-label="Editar cadastro"
                          onClick={() => onOpenEdit(product)}
                        >
                          <IconEdit size={16} stroke={1.5} />
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label="Excluir produto">
                        <ActionIcon
                          color="gray"
                          className="action-danger"
                          aria-label="Excluir produto"
                          onClick={() => onConfirmDelete(product)}
                        >
                          <IconTrash size={16} stroke={1.5} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              );
            })}

            {paddingBottom > 0 && (
              <Table.Tr>
                <Table.Td
                  style={{ height: paddingBottom, padding: 0 }}
                  colSpan={columnCount}
                />
              </Table.Tr>
            )}

            {rows.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={columnCount} style={{ borderBottom: 0 }}>
                  <EmptyState
                    message="Nenhum produto encontrado"
                    description={
                      query.trim()
                        ? "Tente outro código, modelo ou equivalência."
                        : undefined
                    }
                    actionLabel={query.trim() ? "Limpar busca" : undefined}
                    onAction={query.trim() ? onClearSearch : undefined}
                  />
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </div>

      <Group justify="space-between">
        <Text size="xs" c="dimmed" className="num">
          Mostrando {rows.length} de {totalItems.toLocaleString("pt-BR")} produtos
        </Text>
        {totalPages > 1 && (
          <Pagination
            value={page}
            onChange={onPageChange}
            total={totalPages}
            size="sm"
          />
        )}
      </Group>
    </Stack>
  );
}
