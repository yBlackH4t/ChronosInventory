import { useMemo, useState } from "react";
import {
  Badge,
  Button,
  Checkbox,
  Group,
  Pagination,
  Popover,
  SegmentedControl,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import {
  IconAdjustmentsHorizontal,
  IconSearch,
  IconChecklist,
} from "@tabler/icons-react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import PageHeader from "../components/ui/PageHeader";
import EmptyState from "../components/ui/EmptyState";
import StatusDot from "../components/ui/StatusDot";
import { api } from "../lib/apiClient";
import { ApiError } from "../lib/api";
import type {
  Product,
  ProductStatusFilter,
  ProductStatusBulkIn,
  SuccessResponse,
} from "../lib/api";
import { notifyError, notifySuccess } from "../lib/notify";
import { useLocations } from "../hooks/useLocations";

const STATUS_OPTIONS = [
  { value: "TODOS", label: "Todos" },
  { value: "ATIVO", label: "Ativos" },
  { value: "INATIVO", label: "Inativos" },
];
const STOCK_OPTIONS = [
  { value: "TODOS", label: "Todos" },
  { value: "COM_ESTOQUE", label: "Com estoque" },
  { value: "SEM_ESTOQUE", label: "Sem estoque" },
] as const;
type StockFilter = (typeof STOCK_OPTIONS)[number]["value"];

export default function ProductStatusPage() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<ProductStatusFilter>("TODOS");
  const [stockFilter, setStockFilter] = useState<StockFilter>("TODOS");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState("20");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const { locations } = useLocations();

  const listQuery = useQuery<SuccessResponse<Product[]>>({
    queryKey: ["produtos-status", query, status, stockFilter, page, pageSize],
    queryFn: ({ signal }) =>
      api.listProductsStatus(
        {
          query: query.trim() || undefined,
          status,
          has_stock:
            stockFilter === "TODOS" ? undefined : stockFilter === "COM_ESTOQUE",
          page,
          page_size: Number(pageSize),
          sort: "nome",
        },
        { signal },
      ),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const bulkMutation = useMutation<
    SuccessResponse<{ updated: number }>,
    Error,
    ProductStatusBulkIn
  >({
    mutationFn: (payload) => api.bulkUpdateProductStatus(payload),
    onSuccess: (response, variables) => {
      notifySuccess(
        `${response.data.updated} item(ns) ${variables.ativo ? "reativado(s)" : "inativado(s)"} com sucesso.`,
      );
      setSelectedIds([]);
      queryClient.invalidateQueries({ queryKey: ["produtos-status"] });
      queryClient.invalidateQueries({ queryKey: ["produtos"] });
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error) => notifyError(error),
  });

  const rows = listQuery.data?.data ?? [];
  const totalPages = Math.max(listQuery.data?.meta?.total_pages ?? 1, 1);
  const loadError =
    listQuery.error instanceof ApiError
      ? listQuery.error.message
      : listQuery.error instanceof Error
        ? listQuery.error.message
        : "Falha ao carregar itens.";

  const visibleIds = useMemo(() => rows.map((row) => row.id), [rows]);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedVisibleCount = useMemo(
    () => visibleIds.filter((id) => selectedSet.has(id)).length,
    [visibleIds, selectedSet],
  );
  const allVisibleSelected =
    visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;

  const toggleSelectAllVisible = (checked: boolean) => {
    setSelectedIds((current) => {
      if (!checked) {
        const visible = new Set(visibleIds);
        return current.filter((id) => !visible.has(id));
      }
      const merged = new Set(current);
      visibleIds.forEach((id) => merged.add(id));
      return Array.from(merged);
    });
  };

  const toggleRow = (id: number, checked: boolean) => {
    setSelectedIds((current) => {
      if (checked) return Array.from(new Set([...current, id]));
      return current.filter((item) => item !== id);
    });
  };

  const runBulkStatus = (ativo: boolean) => {
    if (selectedIds.length === 0) {
      notifyError(new Error("Selecione ao menos um item."));
      return;
    }
    bulkMutation.mutate({ ids: selectedIds, ativo });
  };

  const columnCount = 5 + locations.length;
  const optionsCount =
    Number(stockFilter !== "TODOS") + Number(pageSize !== "20");

  return (
    <Stack gap="lg">
      <PageHeader
        icon={IconChecklist}
        title="Ativação em massa"
        subtitle="Ative ou inative vários produtos de uma vez. Itens inativos saem das operações, mas mantêm o histórico."
      />

      <div className="toolbar-row">
        <TextInput
          size="md"
          aria-label="Buscar produtos"
          placeholder="Buscar por nome ou #ID"
          leftSection={<IconSearch size={18} stroke={1.5} />}
          value={query}
          onChange={(event) => {
            setQuery(event.currentTarget.value);
            setPage(1);
          }}
          style={{ flex: 1, minWidth: 260 }}
        />
        <SegmentedControl
          value={status}
          onChange={(value) => {
            setStatus((value as ProductStatusFilter) || "TODOS");
            setPage(1);
          }}
          data={STATUS_OPTIONS}
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
                label="Estoque"
                data={STOCK_OPTIONS.map((item) => ({
                  value: item.value,
                  label: item.label,
                }))}
                value={stockFilter}
                allowDeselect={false}
                onChange={(value) => {
                  setStockFilter((value as StockFilter) || "TODOS");
                  setPage(1);
                }}
                comboboxProps={{ withinPortal: false }}
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
                comboboxProps={{ withinPortal: false }}
              />
              <Button
                variant="subtle"
                color="gray"
                size="xs"
                onClick={() => {
                  setQuery("");
                  setStatus("TODOS");
                  setStockFilter("TODOS");
                  setPage(1);
                  setSelectedIds([]);
                }}
              >
                Limpar filtros e seleção
              </Button>
            </Stack>
          </Popover.Dropdown>
        </Popover>
      </div>

      <div className="table-shell">
        <Table.ScrollContainer minWidth={760}>
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
                  <Table.Th key={loc.id} w={100} ta="right">
                    {loc.label || loc.name}
                  </Table.Th>
                ))}
                <Table.Th w={80} ta="right">
                  Total
                </Table.Th>
                <Table.Th w={120}>Status</Table.Th>
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
                      <Text size="sm" fw={500} lineClamp={1} c={product.ativo ? undefined : "dimmed"}>
                        {product.nome}
                      </Text>
                      <Text size="xs" c="dimmed" className="mono">
                        #{product.id}
                      </Text>
                    </Table.Td>
                    {locations.map((loc) => (
                      <Table.Td key={loc.id} ta="right" className="num">
                        {product.inventories?.[loc.id] ?? 0}
                      </Table.Td>
                    ))}
                    <Table.Td ta="right" fw={600} className="num">
                      {product.total_stock}
                    </Table.Td>
                    <Table.Td>
                      <StatusDot tone={product.ativo ? "success" : "neutral"}>
                        {product.ativo ? "Ativo" : "Inativo"}
                      </StatusDot>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
              {listQuery.isError && (
                <Table.Tr>
                  <Table.Td colSpan={columnCount} style={{ borderBottom: 0 }}>
                    <EmptyState
                      message="Falha ao carregar itens"
                      description={`${loadError} Se continuar, instale a atualização do Chronos e abra o app de novo.`}
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

      {selectedIds.length > 0 && (
        <div className="selection-bar">
          <Group gap="sm" wrap="nowrap">
            <Text size="sm" fw={600} className="num">
              {selectedIds.length}{" "}
              {selectedIds.length === 1 ? "selecionado" : "selecionados"}
            </Text>
            <Button variant="subtle" color="gray" size="xs" onClick={() => setSelectedIds([])}>
              Limpar
            </Button>
          </Group>
          <Group gap="xs">
            <Button
              variant="default"
              onClick={() => runBulkStatus(false)}
              loading={bulkMutation.isPending}
            >
              Inativar
            </Button>
            <Button
              onClick={() => runBulkStatus(true)}
              loading={bulkMutation.isPending}
            >
              Reativar
            </Button>
          </Group>
        </div>
      )}
    </Stack>
  );
}
