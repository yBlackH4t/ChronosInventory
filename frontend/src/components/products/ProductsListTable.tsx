import {
  ActionIcon,
  Group,
  Menu,
  Pagination,
  Select,
  Skeleton,
  Stack,
  Table,
  Text,
  Tooltip,
  VisuallyHidden,
} from "@mantine/core";
import {
  IconArrowDown,
  IconArrowUp,
  IconArrowsExchange,
  IconArrowsSort,
  IconBarcode,
  IconDots,
  IconEdit,
  IconLink,
  IconTrash,
} from "@tabler/icons-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useMemo, useRef, useState } from "react";
import { useLocalStorage } from "@mantine/hooks";

import type { InventoryLocation, Product } from "../../lib/api";
import { useRowHeight } from "../../lib/appearance";
import { detectBrand, detectCondition } from "../../lib/brands";
import { clickableRowProps } from "../../lib/clickableRow";
import { brandTitle, locationColumns, nameAroundCode, productMonogram, versionTitle } from "../../lib/productView";
import { useProductsVisual } from "../../hooks/useProductsVisual";
import { useFlipList } from "../../hooks/useFlipList";
import { useStockTotals } from "../../hooks/useStockTotals";
import EmptyState from "../ui/EmptyState";
import CopyCode from "../ui/CopyCode";
import { applySavedOrder, moveItem } from "../../lib/reorder";
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
  /** "Cadastrar esta peça" quando a busca não acha nada: abre o cadastro com o texto buscado. */
  onCreateFromSearch?: (text: string) => void;
  onOpenDetails: (product: Product, row: HTMLElement | null) => void;
  onOpenSingleLabel: (productId: number) => void;
  onOpenEdit: (product: Product) => void;
  onConfirmDelete: (product: Product) => void;
  onOpenLinks: (product: Product) => void;
  onQuickMove?: (product: Product) => void;
  onHoverProduct?: (product: Product | null) => void;
  onPageChange: (page: number) => void;
  sort?: string;
  onSortChange?: (sort: string) => void;
  pageSizes?: { value: string; label: string }[];
  onPageSizeChange?: (size: string) => void;
  locations?: InventoryLocation[];
};

type SortField = "id" | "nome" | "total_stock";

// Primeiro clique: Cód. e Descrição crescentes, Total do maior para o menor.
function nextSort(current: string | undefined, field: SortField): string {
  const firstDesc = field === "total_stock";
  if (current === field) return `-${field}`;
  if (current === `-${field}`) return field;
  return firstDesc ? `-${field}` : field;
}

function SortHeader({
  label,
  field,
  sort,
  onSortChange,
  align = "left",
}: {
  label: string;
  field: SortField;
  sort?: string;
  onSortChange?: (sort: string) => void;
  align?: "left" | "right";
}) {
  const active = sort === field ? "asc" : sort === `-${field}` ? "desc" : null;
  if (!onSortChange) return <>{label}</>;
  const Icon = active === "asc" ? IconArrowUp : active === "desc" ? IconArrowDown : IconArrowsSort;
  return (
    <button
      type="button"
      className="pm-sort"
      data-active={active || undefined}
      data-align={align}
      onClick={() => onSortChange(nextSort(sort, field))}
      title={`Ordenar por ${label.toLowerCase()}`}
    >
      <span>{label}</span>
      <Icon size={13} stroke={2} aria-hidden />
    </button>
  );
}

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
  flash,
  onRetry,
  onClearSearch,
  onCreateFromSearch,
  onOpenDetails,
  onOpenSingleLabel,
  onOpenEdit,
  onConfirmDelete,
  onOpenLinks,
  onQuickMove,
  onHoverProduct,
  onPageChange,
  sort,
  onSortChange,
  pageSize,
  pageSizes,
  onPageSizeChange,
  locations = [],
}: ProductsListTableProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const ROW_HEIGHT = useRowHeight(54);
  const compact = ROW_HEIGHT < 54;
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
  // Ordem das colunas das filiais: arrastando o título da coluna (fica salva nesta máquina).
  const [columnOrder, setColumnOrder] = useLocalStorage<number[]>({
    key: "chronos.produtos.ordem_filiais",
    defaultValue: [],
  });
  const [dragColumn, setDragColumn] = useState<number | null>(null);
  const shownLocations = applySavedOrder(
    locations.filter((loc) => columns.ids.includes(loc.id)).map((loc) => loc.id),
    columnOrder,
  ).map((id) => locations.find((loc) => loc.id === id)!);
  const dropColumn = (targetId: number) => {
    if (dragColumn === null || dragColumn === targetId) return setDragColumn(null);
    const ids = shownLocations.map((loc) => loc.id);
    setColumnOrder(moveItem(ids, ids.indexOf(dragColumn), ids.indexOf(targetId)));
    setDragColumn(null);
  };
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

  const columnCount = (compact ? 5 : 6) + shownLocations.length;
  const virtualItems = rowVirtualizer.getVirtualItems();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom =
    virtualItems.length > 0
      ? rowVirtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end
      : 0;

  const totalLabel = shownLocations.length > 0 ? "Total" : "Saldo";
  // Colunas de largura fixa + 280px garantidos para o nome do produto.
  const tableMinWidth =
    (compact ? 0 : 56) + 84 + shownLocations.length * 124 + (onlyLocation ? 150 : 96) + 140 + 112 + 320;
  const sortAria = (field: SortField) =>
    sort === field ? "ascending" : sort === `-${field}` ? "descending" : undefined;
  const firstShown = rows.length > 0 ? (page - 1) * Number(pageSize) + 1 : 0;
  const lastShown = rows.length > 0 ? firstShown + rows.length - 1 : 0;

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
        <Table layout="fixed" stickyHeader verticalSpacing={0} miw={tableMinWidth} className="pm-table">
          <Table.Thead>
            <Table.Tr>
              {!compact && (
                <Table.Th w={56}>
                  <VisuallyHidden>Foto</VisuallyHidden>
                </Table.Th>
              )}
              <Table.Th w={84} aria-sort={sortAria("id")}>
                <SortHeader label="Cód." field="id" sort={sort} onSortChange={onSortChange} />
              </Table.Th>
              <Table.Th aria-sort={sortAria("nome")}>
                <SortHeader label="Descrição" field="nome" sort={sort} onSortChange={onSortChange} />
              </Table.Th>
              {shownLocations.map((loc) => (
                <Table.Th
                  key={loc.id}
                  w={124}
                  ta="right"
                  className="pm-th mi-drag-col"
                  draggable={shownLocations.length > 1}
                  data-dragging={dragColumn === loc.id || undefined}
                  title={shownLocations.length > 1 ? "Arraste para mudar a ordem das filiais" : undefined}
                  onDragStart={() => setDragColumn(loc.id)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => dropColumn(loc.id)}
                  onDragEnd={() => setDragColumn(null)}
                >
                  {loc.label || loc.name}
                </Table.Th>
              ))}
              <Table.Th w={onlyLocation ? 150 : 96} ta="right" className="pm-th" aria-sort={sortAria("total_stock")}>
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
                  <SortHeader
                    label={totalLabel}
                    field="total_stock"
                    sort={sort}
                    onSortChange={onSortChange}
                    align="right"
                  />
                )}
              </Table.Th>
              <Table.Th w={140} className="pm-th">Saídas 90 dias</Table.Th>
              <Table.Th w={112}>
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
              const name = nameAroundCode(product.nome);
              const links = linkSummary(product);
              const hasLinks =
                product.linked_count > 0 || !!product.produto_vinculado_id;
              const rowFlash = flash && flash.productId === product.id ? flash : null;
              const meta = [brandTitle(brand), versionTitle(condition)].filter(Boolean).join(" · ");

              return (
                <Table.Tr
                  key={product.id}
                  data-flip-key={product.id}
                  data-zero={inStock ? undefined : true}
                  {...clickableRowProps((row) => onOpenDetails(product, row))}
                  className={selectedId === product.id ? "clickable-row pm-row row-selected" : "clickable-row pm-row"}
                  onMouseEnter={() => onHoverProduct?.(product)}
                  onMouseLeave={() => onHoverProduct?.(null)}
                  onFocus={() => onHoverProduct?.(product)}
                  onBlur={() => onHoverProduct?.(null)}
                  style={{ height: ROW_HEIGHT }}
                >
                  {!compact && (
                    <Table.Td pr={0}>
                      <span data-shared="thumb" style={{ display: "inline-flex" }}>
                        <ProductThumb
                          base64={visual.get(product.id)?.thumb_base64}
                          alt={product.nome}
                          size={36}
                          monogram={productMonogram(product.nome, brand) ?? undefined}
                          color={brand?.color}
                        />
                      </span>
                    </Table.Td>
                  )}

                  <Table.Td>
                    <span className="pm-id num">{product.id}</span>
                  </Table.Td>

                  <Table.Td>
                    <Stack gap={2} miw={0}>
                      <div className="pm-name" title={product.nome}>
                        {name.before}
                        {name.code ? (
                          <CopyCode
                            code={name.code}
                            className="pm-name-code"
                            data-shared="code"
                            title="Clique para copiar o código"
                          />
                        ) : null}
                        {name.after}
                      </div>
                      {!compact && (meta || links) && (
                        <div className="pm-meta">
                          <span
                            className="pm-version-dot"
                            style={{ background: `var(--mantine-color-${condition.color}-filled)` }}
                            aria-hidden
                          />
                          <span>{meta}</span>
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
                  </Table.Td>

                  {shownLocations.map((loc) => {
                    const qty = product.inventories?.[loc.id] ?? 0;
                    return (
                      <Table.Td key={loc.id} ta="right">
                        <span className="pm-stock-branch" data-zero={qty === 0 || undefined}>
                          {qty > 0 ? qty.toLocaleString("pt-BR") : "·"}
                        </span>
                      </Table.Td>
                    );
                  })}

                  <Table.Td ta="right">
                    <StockNumber value={product.total_stock} flash={rowFlash} />
                  </Table.Td>

                  <Table.Td className="pm-sales-cell">
                    <SalesMiniBars weeks={visual.get(product.id)?.saidas_semanas} />
                  </Table.Td>

                  <Table.Td>
                    <Group
                      gap={4}
                      justify="flex-end"
                      wrap="nowrap"
                      className="pm-actions pm-actions-hover pm-actions-col"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <Tooltip label="Movimentar estoque (tecla N)" openDelay={400}>
                        <ActionIcon
                          size={30}
                          variant="light"
                          onClick={() => onQuickMove?.(product)}
                          aria-label={`Movimentar estoque de ${product.nome} (tecla N)`}
                        >
                          <IconArrowsExchange size={17} stroke={1.75} />
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label="Gerar etiqueta" openDelay={400}>
                        <ActionIcon size={30} onClick={() => onOpenSingleLabel(product.id)} aria-label={`Gerar etiqueta de ${product.nome}`}>
                          <IconBarcode size={17} stroke={1.75} />
                        </ActionIcon>
                      </Tooltip>
                      <Menu position="bottom-end" withinPortal>
                        <Menu.Target>
                          <ActionIcon size={30} aria-label={`Mais ações de ${product.nome}`}>
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
                    illustrated={Boolean(query.trim())}
                    message="Nenhum produto encontrado"
                    description={
                      query.trim()
                        ? `Nada com "${query.trim()}". Tente outro código, modelo ou equivalência, ou cadastre a peça.`
                        : undefined
                    }
                    primaryLabel={query.trim() && onCreateFromSearch ? "Cadastrar esta peça" : undefined}
                    onPrimary={query.trim() && onCreateFromSearch ? () => onCreateFromSearch(query.trim()) : undefined}
                    actionLabel={query.trim() ? "Limpar busca" : undefined}
                    onAction={query.trim() ? onClearSearch : undefined}
                  />
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </div>

      <Group justify="space-between" className="pm-footer">
        <Group gap="sm">
          <Text size="xs" c="dimmed" className="num">
            {rows.length > 0
              ? `${firstShown.toLocaleString("pt-BR")}–${lastShown.toLocaleString("pt-BR")} de ${totalItems.toLocaleString("pt-BR")}`
              : `0 de ${totalItems.toLocaleString("pt-BR")}`}
          </Text>
          {pageSizes && onPageSizeChange && (
            <Select
              size="xs"
              w={128}
              data={pageSizes.map((item) => ({ value: item.value, label: `${item.label} por página` }))}
              value={pageSize}
              allowDeselect={false}
              onChange={(value) => value && onPageSizeChange(value)}
              aria-label="Itens por página"
            />
          )}
        </Group>
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
