import { ActionIcon, Badge, Button, Checkbox, Group, NumberInput, Pagination, Select, Table, Text, TextInput, Tooltip } from "@mantine/core";
import { IconBarcode } from "@tabler/icons-react";

import DataTable from "../ui/DataTable";
import EmptyState from "../ui/EmptyState";
import FilterToolbar from "../ui/FilterToolbar";
import type { Product, ProductStatusFilter, SuccessResponse } from "../../lib/api";

const STATUS_OPTIONS = [
  { value: "ATIVO", label: "Ativos" },
  { value: "TODOS", label: "Todos" },
  { value: "INATIVO", label: "Inativos" },
];

const STOCK_OPTIONS = [
  { value: "COM_ESTOQUE", label: "Com estoque (> 0)" },
  { value: "TODOS", label: "Todos" },
  { value: "SEM_ESTOQUE", label: "Sem estoque (= 0)" },
] as const;

type StockFilter = (typeof STOCK_OPTIONS)[number]["value"];
type CopiesMode = "ONE" | "TOTAL_STOCK" | "MANUAL";

const COPIES_MODE_OPTIONS: { value: CopiesMode; label: string }[] = [
  { value: "ONE", label: "1 por item" },
  { value: "TOTAL_STOCK", label: "Igual estoque total" },
  { value: "MANUAL", label: "Manual por item" },
];

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
  setCopiesMode,
  defaultManualCopies,
  setDefaultManualCopies,
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

  return (
    <>
      <FilterToolbar>
        <Group align="end" wrap="wrap">
          <TextInput
            label="Buscar"
            placeholder="Nome ou numero"
            value={query}
            onChange={(event) => {
              setQuery(event.currentTarget.value);
              setPage(1);
            }}
            w={320}
          />
          <Select
            label="Status"
            data={STATUS_OPTIONS}
            value={status}
            onChange={(value) => {
              setStatus((value as ProductStatusFilter) || "ATIVO");
              setPage(1);
            }}
            w={180}
          />
          <Select
            label="Estoque"
            data={STOCK_OPTIONS.map((item) => ({ value: item.value, label: item.label }))}
            value={stockFilter}
            onChange={(value) => {
              setStockFilter((value as StockFilter) || "COM_ESTOQUE");
              setPage(1);
            }}
            w={220}
          />
          <Select
            label="Por pagina"
            data={["10", "20", "50", "100"]}
            value={pageSize}
            onChange={(value) => {
              if (!value) return;
              setPageSize(value);
              setPage(1);
            }}
            w={120}
          />
          <Select
            label="Copias"
            data={COPIES_MODE_OPTIONS}
            value={copiesMode}
            onChange={(value) => setCopiesMode((value as CopiesMode) || "ONE")}
            w={210}
          />
          {copiesMode === "MANUAL" && (
            <NumberInput
              label="Padrao manual"
              value={defaultManualCopies}
              min={1}
              max={MAX_COPIES_PER_ITEM}
              onChange={(value) =>
                setDefaultManualCopies(
                  Math.max(1, Math.min(MAX_COPIES_PER_ITEM, Math.round(Number(value || 1))))
                )
              }
              w={160}
            />
          )}
          <Button
            variant="subtle"
            onClick={() => {
              setQuery("");
              setStatus("ATIVO");
              setStockFilter("COM_ESTOQUE");
              setPage(1);
              setSelectedIds([]);
              setManualCopiesById({});
            }}
          >
            Limpar filtros
          </Button>
        </Group>
      </FilterToolbar>

      <DataTable minWidth={980}>
        <Table striped highlightOnHover withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>
                <Checkbox
                  checked={allVisibleSelected}
                  indeterminate={selectedVisibleCount > 0 && !allVisibleSelected}
                  onChange={(event) => toggleSelectAllVisible(event.currentTarget.checked)}
                />
              </Table.Th>
              <Table.Th>ID</Table.Th>
              <Table.Th>Nome</Table.Th>
              <Table.Th>Canoas</Table.Th>
              <Table.Th>PF</Table.Th>
              <Table.Th>Total</Table.Th>
              <Table.Th>Copias</Table.Th>
              <Table.Th>Acoes</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((product) => {
              const checked = selectedSet.has(product.id);
              return (
                <Table.Tr key={product.id}>
                  <Table.Td>
                    <Checkbox
                      checked={checked}
                      onChange={(event) => toggleRow(product.id, event.currentTarget.checked)}
                    />
                  </Table.Td>
                  <Table.Td>{product.id}</Table.Td>
                  <Table.Td>{product.nome}</Table.Td>
                  <Table.Td>{product.qtd_canoas}</Table.Td>
                  <Table.Td>{product.qtd_pf}</Table.Td>
                  <Table.Td>{product.total_stock}</Table.Td>
                  <Table.Td>
                    {copiesMode === "MANUAL" ? (
                      <NumberInput
                        min={1}
                        max={MAX_COPIES_PER_ITEM}
                        value={resolveManualCopies(product.id)}
                        onChange={(value) => setManualCopies(product.id, Number(value || 1))}
                        w={110}
                      />
                    ) : (
                      <Badge variant="light">{resolveCopies(product)}</Badge>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Tooltip label="Gerar etiqueta deste item">
                      <ActionIcon
                        variant="light"
                        onClick={() => runPrintSingle(product)}
                        aria-label={`Gerar etiqueta do item ${product.id}`}
                      >
                        <IconBarcode size={16} />
                      </ActionIcon>
                    </Tooltip>
                  </Table.Td>
                </Table.Tr>
              );
            })}
            {listQuery.isError && (
              <Table.Tr>
                <Table.Td colSpan={8}>
                  <EmptyState message={loadError} actionLabel="Tentar novamente" onAction={() => void listQuery.refetch()} />
                </Table.Td>
              </Table.Tr>
            )}
            {!listQuery.isError && rows.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={8}>
                  <EmptyState message="Nenhum item encontrado para os filtros selecionados." />
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </DataTable>

      <Group justify="space-between">
        <Text size="sm" c="dimmed">
          Total: {listQuery.data?.meta?.total_items ?? 0}
        </Text>
        <Pagination value={page} onChange={setPage} total={totalPages} />
      </Group>
    </>
  );
}
