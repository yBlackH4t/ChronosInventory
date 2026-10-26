import {
  ActionIcon,
  Badge,
  Button,
  Checkbox,
  Group,
  NumberInput,
  Pagination,
  Popover,
  SegmentedControl,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import {
  IconAdjustmentsHorizontal,
  IconBarcode,
  IconSearch,
} from "@tabler/icons-react";

import EmptyState from "../ui/EmptyState";
import StockNumber from "../products/StockNumber";
import { detectBrand } from "../../lib/brands";
import { splitProductCode } from "../../lib/productView";
import type {
  Product,
  ProductStatusFilter,
  SuccessResponse,
} from "../../lib/api";
import { useLocations } from "../../hooks/useLocations";
import "../../styles/products-movements.css";

// Código da peça em destaque e o resto do nome ao lado, como em Produtos.
function ProductNameCell({ nome, id }: { nome: string; id: number }) {
  const { code, rest } = splitProductCode(nome, detectBrand(nome));
  return (
    <Stack gap={2} miw={0}>
      <Group gap={10} wrap="nowrap" miw={0}>
        {code && <span className="pm-code-cell">{code}</span>}
        <Text size="sm" fw={600} truncate="end" title={nome}>
          {(code ? rest : "") || nome}
        </Text>
      </Group>
      <Text size="xs" c="dimmed" className="mono">
        #{id}
      </Text>
    </Stack>
  );
}

const STATUS_OPTIONS = [
  { value: "ATIVO", label: "Ativos" },
  { value: "TODOS", label: "Todos" },
  { value: "INATIVO", label: "Inativos" },
];

const STOCK_OPTIONS = [
  { value: "COM_ESTOQUE", label: "Com estoque" },
  { value: "TODOS", label: "Todos" },
  { value: "SEM_ESTOQUE", label: "Sem estoque" },
] as const;

type StockFilter = (typeof STOCK_OPTIONS)[number]["value"];
type CopiesMode = "ONE" | "TOTAL_STOCK" | "MANUAL";

const MAX_COPIES_PER_ITEM = 500;

type Props = {
  query: string;
  setQuery: (value: string) => void;
  status: ProductStatusFilter;
  setStatus: (value: ProductStatusFilter) => void;
  stockFilter: StockFilter;
  setStockFilter: (value: StockFilter) => void;
  page: number;
  setPage: (value: number) => void;
  pageSize: string;
  setPageSize: (value: string) => void;
  copiesMode: CopiesMode;
  setCopiesMode: (value: CopiesMode) => void;
  defaultManualCopies: number;
  setDefaultManualCopies: (value: number) => void;
  setSelectedIds: (value: number[]) => void;
  setManualCopiesById: (value: Record<number, number>) => void;
  rows: Product[];
  totalPages: number;
  selectedSet: Set<number>;
  allVisibleSelected: boolean;
  selectedVisibleCount: number;
  listQuery: {
    isError: boolean;
    error: unknown;
    data?: SuccessResponse<Product[]>;
    refetch: () => Promise<unknown>;
  };
  toggleSelectAllVisible: (checked: boolean) => void;
  toggleRow: (id: number, checked: boolean) => void;
  resolveManualCopies: (productId: number) => number;
  resolveCopies: (product: Product) => number;
  setManualCopies: (productId: number, value: number) => void;
  runPrintSingle: (product: Product) => void;
};

// Nested dropdowns must stay inside the popover, or a click on them closes it.
const IN_POPOVER = { withinPortal: false } as const;

export default function LabelsInternalSection({
  query,
  setQuery,
  status,
  setStatus,
  stockFilter,
  setStockFilter,
  page,
  setPage,
  pageSize,
  setPageSize,
  copiesMode,
  setSelectedIds,
  setManualCopiesById,
  rows,
  totalPages,
  selectedSet,
  allVisibleSelected,
  selectedVisibleCount,
  listQuery,
  toggleSelectAllVisible,
  toggleRow,
  resolveManualCopies,
  resolveCopies,
  setManualCopies,
  runPrintSingle,
}: Props) {
  const loadError =
    listQuery.error instanceof Error
      ? listQuery.error.message
      : "Falha ao carregar itens para etiquetas.";

  const { locations } = useLocations();
  const columnCount = 5 + locations.length;
  const optionsCount =
    Number(status !== "ATIVO") + Number(pageSize !== "20");

  return (
    <Stack gap="md">
      <div className="toolbar-row">
        <TextInput
          size="md"
          aria-label="Buscar produtos"
          placeholder="Buscar por nome ou código"
          leftSection={<IconSearch size={18} stroke={1.5} />}
          value={query}
          onChange={(event) => {
            setQuery(event.currentTarget.value);
            setPage(1);
          }}
          style={{ flex: 1, minWidth: 260 }}
        />
        <SegmentedControl
          value={stockFilter}
          onChange={(value) => {
            setStockFilter((value as StockFilter) || "COM_ESTOQUE");
            setPage(1);
          }}
          data={STOCK_OPTIONS.map((item) => ({
            value: item.value,
            label: item.label,
          }))}
        />
        <Popover position="bottom-end" width={260}>
          <Popover.Target>
            <Button
              variant="default"
              leftSection={<IconAdjustmentsHorizontal size={16} stroke={1.5} />}
              rightSection={
                optionsCount > 0 ? (
                  <Badge size="xs" circle variant="filled">
                    {optionsCount}
                  </Badge>
                ) : undefined
              }
            >
              Opções
            </Button>
          </Popover.Target>
          <Popover.Dropdown>
            <Stack gap="sm">
              <Select
                label="Status do produto"
                data={STATUS_OPTIONS}
                value={status}
                allowDeselect={false}
                onChange={(value) => {
                  setStatus((value as ProductStatusFilter) || "ATIVO");
                  setPage(1);
                }}
                comboboxProps={IN_POPOVER}
              />
              <Select
                label="Itens por página"
                data={["10", "20", "50", "100"]}
                value={pageSize}
                allowDeselect={false}
                onChange={(value) => {
                  if (!value) return;
                  setPageSize(value);
                  setPage(1);
                }}
                comboboxProps={IN_POPOVER}
              />
              <Button
                variant="subtle"
                color="gray"
                size="xs"
                onClick={() => {
                  setQuery("");
                  setStatus("ATIVO");
                  setStockFilter("COM_ESTOQUE");
                  setPage(1);
                  setSelectedIds([]);
                  setManualCopiesById({});
                }}
              >
                Limpar filtros e seleção
              </Button>
            </Stack>
          </Popover.Dropdown>
        </Popover>
      </div>

      <div className="table-shell">
        <Table.ScrollContainer minWidth={820}>
          <Table verticalSpacing="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th w={44}>
                  <Checkbox
                    size="xs"
                    aria-label="Selecionar todos visíveis"
                    checked={allVisibleSelected}
                    indeterminate={
                      selectedVisibleCount > 0 && !allVisibleSelected
                    }
                    onChange={(event) =>
                      toggleSelectAllVisible(event.currentTarget.checked)
                    }
                  />
                </Table.Th>
                <Table.Th>Produto</Table.Th>
                {locations.map((loc) => (
                  <Table.Th key={loc.id} w={120} ta="right" className="pm-th">
                    {loc.label || loc.name}
                  </Table.Th>
                ))}
                <Table.Th w={80} ta="right">
                  Total
                </Table.Th>
                <Table.Th w={120} ta="right">
                  Cópias
                </Table.Th>
                <Table.Th w={56} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((product) => {
                const checked = selectedSet.has(product.id);
                return (
                  <Table.Tr
                    key={product.id}
                    className={checked ? "row-selected" : undefined}
                    style={{ cursor: "pointer" }}
                    onClick={() => toggleRow(product.id, !checked)}
                  >
                    <Table.Td onClick={(event) => event.stopPropagation()}>
                      <Checkbox
                        size="xs"
                        aria-label={`Selecionar ${product.nome}`}
                        checked={checked}
                        onChange={(event) =>
                          toggleRow(product.id, event.currentTarget.checked)
                        }
                      />
                    </Table.Td>
                    <Table.Td>
                      <ProductNameCell nome={product.nome} id={product.id} />
                    </Table.Td>
                    {locations.map((loc) => {
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
                      <StockNumber value={product.total_stock} />
                    </Table.Td>
                    <Table.Td ta="right" onClick={(event) => event.stopPropagation()}>
                      {copiesMode === "MANUAL" ? (
                        <NumberInput
                          size="xs"
                          aria-label="Cópias"
                          min={1}
                          max={MAX_COPIES_PER_ITEM}
                          value={resolveManualCopies(product.id)}
                          onChange={(value) =>
                            setManualCopies(product.id, Number(value || 1))
                          }
                          w={90}
                          ml="auto"
                        />
                      ) : (
                        <Text size="sm" className="num" c="dimmed">
                          ×{resolveCopies(product)}
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td onClick={(event) => event.stopPropagation()}>
                      <Group justify="flex-end" className="row-actions">
                        <Tooltip label="Imprimir só este item">
                          <ActionIcon
                            color="gray"
                            onClick={() => runPrintSingle(product)}
                            aria-label={`Imprimir etiqueta do item ${product.id}`}
                          >
                            <IconBarcode size={16} stroke={1.5} />
                          </ActionIcon>
                        </Tooltip>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
              {listQuery.isError && (
                <Table.Tr>
                  <Table.Td colSpan={columnCount} style={{ borderBottom: 0 }}>
                    <EmptyState
                      message="Falha ao carregar itens"
                      description={loadError}
                      actionLabel="Tentar novamente"
                      onAction={() => void listQuery.refetch()}
                    />
                  </Table.Td>
                </Table.Tr>
              )}
              {!listQuery.isError && rows.length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={columnCount} style={{ borderBottom: 0 }}>
                    <EmptyState message="Nenhum item encontrado" />
                  </Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </div>

      <Group justify="space-between">
        <Text size="xs" c="dimmed" className="num">
          {(listQuery.data?.meta?.total_items ?? 0).toLocaleString("pt-BR")} itens
        </Text>
        {totalPages > 1 && (
          <Pagination size="sm" value={page} onChange={setPage} total={totalPages} />
        )}
      </Group>
    </Stack>
  );
}
