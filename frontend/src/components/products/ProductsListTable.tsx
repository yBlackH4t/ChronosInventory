import {
  ActionIcon,
  Button,
  Group,
  Menu,
  Pagination,
  Skeleton,
  Stack,
  Table,
  Text,
  Tooltip,
  VisuallyHidden,
} from "@mantine/core";
import {
  IconArrowsExchange,
  IconBarcode,
  IconDots,
  IconEdit,
  IconLink,
  IconTrash,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useMemo, useRef } from "react";

import type { InventoryLocation, Product, StockSummary, SuccessResponse } from "../../lib/api";
import { api } from "../../lib/apiClient";
import { useRowHeight } from "../../lib/appearance";
import { detectBrand, detectCondition } from "../../lib/brands";
import { clickableRowProps } from "../../lib/clickableRow";
import { brandTitle, locationColumns, splitProductCode, versionTitle } from "../../lib/productView";
import { useProductsVisual } from "../../hooks/useProductsVisual";
import { useFlipList } from "../../hooks/useFlipList";
import { useProfileScope } from "../../state/profileScope";
import EmptyState from "../ui/EmptyState";
import ProductThumb from "./ProductThumb";
import SalesMiniBars from "./SalesMiniBars";
import StockNumber, { type StockFlash } from "./StockNumber";
import "../../styles/products-movements.css";

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
  flash?: StockFlash | null;
  onRetry: () => void;
  onClearSearch: () => void;
  onOpenDetails: (product: Product, row: HTMLElement | null) => void;
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

/** Totais por filial do estoque inteiro (o mesmo cache do Painel). */
function useStockTotals() {
  const { profileScopeKey } = useProfileScope();
  return useQuery<SuccessResponse<StockSummary>>({
    queryKey: ["analytics", profileScopeKey, "stock-summary", null],
    queryFn: ({ signal }) => api.getAnalyticsStockSummary({ scope: null }, { signal }),
    staleTime: 60_000,
  });
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
  flash,
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
  const totalsQuery = useStockTotals();

  const columns = useMemo(
    () =>
      locationColumns(
        locations.map((loc) => loc.id),
        totalsQuery.data?.data?.locations,
        rows,
      ),
    [locations, totalsQuery.data?.data?.locations, rows],
  );
  const shownLocations = locations.filter((loc) => columns.ids.includes(loc.id));
  const onlyLocation = locations.find((loc) => loc.id === columns.onlyLocationId);

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  // Busca ao vivo: as linhas que ficam deslizam para o lugar novo e as novas esmaecem.
  const signature = useMemo(() => rows.map((row) => row.id).join(","), [rows]);
  useFlipList(parentRef, signature);

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

  const columnCount = 4 + shownLocations.length;
  const virtualItems = rowVirtualizer.getVirtualItems();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom =
    virtualItems.length > 0
      ? rowVirtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end
      : 0;

  const totalLabel = shownLocations.length > 0 ? "Total" : "Saldo";

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
        <Table layout="fixed" stickyHeader verticalSpacing={0} miw={680}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Produto</Table.Th>
              <Table.Th w={124}>Vendas 90 dias</Table.Th>
              {shownLocations.map((loc) => (
                <Table.Th key={loc.id} w={104} ta="right">
                  {loc.label || loc.name}
                </Table.Th>
              ))}
              <Table.Th w={onlyLocation ? 150 : 96} ta="right">
                {onlyLocation ? (
                  <Tooltip
                    label={`Só ${onlyLocation.label || onlyLocation.name} tem estoque; as outras filiais estão zeradas`}
                    multiline
                    w={240}
                  >
                    <span>
                      {totalLabel} · {onlyLocation.label || onlyLocation.name}
                    </span>
                  </Tooltip>
                ) : (
                  totalLabel
                )}
              </Table.Th>
              <Table.Th w={200}>
                <VisuallyHidden>Ações</VisuallyHidden>
              </Table.Th>
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
              const { code, rest } = splitProductCode(product.nome, brand);
              const links = linkSummary(product);
              const hasLinks =
                product.linked_count > 0 || !!product.produto_vinculado_id;
              const rowFlash = flash && flash.productId === product.id ? flash : null;

              return (
                <Table.Tr
                  key={product.id}
                  data-flip-key={product.id}
                  {...clickableRowProps((row) => onOpenDetails(product, row))}
                  className={selectedId === product.id ? "clickable-row row-selected" : "clickable-row"}
                  onMouseEnter={() => onHoverProduct?.(product)}
                  onMouseLeave={() => onHoverProduct?.(null)}
                  onFocus={() => onHoverProduct?.(product)}
                  onBlur={() => onHoverProduct?.(null)}
                  style={{ height: ROW_HEIGHT }}
                >
                  <Table.Td>
                    <Group gap={12} wrap="nowrap">
                      {!compact && (
                        <span data-shared="thumb" style={{ display: "inline-flex" }}>
                          <ProductThumb base64={visual.get(product.id)?.thumb_base64} alt={product.nome} />
                        </span>
                      )}
                      <Stack gap={3} miw={0} style={{ flex: 1 }}>
                        <Group gap={8} wrap="nowrap" miw={0}>
                          {code && (
                            <span className="pm-code" data-shared="code" title={product.nome}>
                              {code}
                            </span>
                          )}
                          {(rest || !code) && (
                            <Text
                              size="sm"
                              fw={code ? 500 : 650}
                              truncate="end"
                              c={inStock ? undefined : "var(--text-muted)"}
                              title={product.nome}
                            >
                              {code ? rest : product.nome}
                            </Text>
                          )}
                        </Group>
                        {!compact && (
                          <div className="pm-meta">
                            <span
                              className="pm-version-dot"
                              style={{ background: `var(--mantine-color-${condition.color}-filled)` }}
                              aria-hidden
                            />
                            <span>
                              {[brandTitle(brand), versionTitle(condition)].filter(Boolean).join(" · ")}
                            </span>
                            <span className="pm-sep" aria-hidden>
                              ·
                            </span>
                            <span className="mono">#{product.id}</span>
                            {links && (
                              <>
                                <span className="pm-sep" aria-hidden>
                                  ·
                                </span>
                                <span className="pm-meta-fill">{links}</span>
                              </>
                            )}
                          </div>
                        )}
                      </Stack>
                    </Group>
                  </Table.Td>

                  <Table.Td>
                    <SalesMiniBars weeks={visual.get(product.id)?.saidas_semanas} />
                  </Table.Td>

                  {shownLocations.map((loc) => {
                    const qty = product.inventories?.[loc.id] ?? 0;
                    return (
                      <Table.Td key={loc.id} ta="right">
                        <span className="pm-stock-branch" data-zero={qty === 0 || undefined}>
                          {qty > 0 ? qty.toLocaleString("pt-BR") : "—"}
                        </span>
                      </Table.Td>
                    );
                  })}

                  <Table.Td ta="right">
                    <StockNumber value={product.total_stock} flash={rowFlash} />
                  </Table.Td>

                  <Table.Td>
                    <Group
                      gap={4}
                      justify="flex-end"
                      wrap="nowrap"
                      className="pm-actions"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <Tooltip label="Movimentar estoque (tecla N)" openDelay={400}>
                        <Button
                          size="compact-sm"
                          variant="light"
                          leftSection={<IconArrowsExchange size={15} stroke={1.75} />}
                          onClick={() => onQuickMove?.(product)}
                          aria-label={`Movimentar estoque de ${product.nome} (tecla N)`}
                        >
                          Movimentar
                        </Button>
                      </Tooltip>
                      <Menu position="bottom-end" withinPortal>
                        <Menu.Target>
                          <ActionIcon size={32} aria-label={`Mais ações de ${product.nome}`}>
                            <IconDots size={18} stroke={1.75} />
                          </ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                          <Menu.Item
                            leftSection={<IconLink size={16} stroke={1.5} />}
                            onClick={() => onOpenLinks(product)}
                          >
                            {hasLinks ? "Ver vínculos" : "Adicionar vínculo"}
                          </Menu.Item>
                          <Menu.Item
                            leftSection={<IconBarcode size={16} stroke={1.5} />}
                            onClick={() => onOpenSingleLabel(product.id)}
                          >
                            Gerar etiqueta
                          </Menu.Item>
                          <Menu.Item
                            leftSection={<IconEdit size={16} stroke={1.5} />}
                            onClick={() => onOpenEdit(product)}
                          >
                            Editar cadastro
                          </Menu.Item>
                          <Menu.Divider />
                          <Menu.Item
                            color="danger"
                            leftSection={<IconTrash size={16} stroke={1.5} />}
                            onClick={() => onConfirmDelete(product)}
                          >
                            Excluir produto
                          </Menu.Item>
                        </Menu.Dropdown>
                      </Menu>
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
