import { useMemo, useState } from "react";
import {
  Badge,
  Button,
  Checkbox,
  Group,
  Pagination,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import PageHeader from "../components/ui/PageHeader";
import FilterToolbar from "../components/ui/FilterToolbar";
import DataTable from "../components/ui/DataTable";
import EmptyState from "../components/ui/EmptyState";
import { api } from "../lib/apiClient";
import { ApiError } from "../lib/api";
import type { Product, ProductStatusFilter, ProductStatusBulkIn, SuccessResponse } from "../lib/api";
import { notifyError, notifySuccess } from "../lib/notify";


const STATUS_OPTIONS = [
  { value: "TODOS", label: "Todos" },
  { value: "ATIVO", label: "Ativos" },
  { value: "INATIVO", label: "Inativos" },
];


export default function ProductStatusPage() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<ProductStatusFilter>("TODOS");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState("20");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const listQuery = useQuery<SuccessResponse<Product[]>>({
    queryKey: ["produtos-status", query, status, page, pageSize],
    queryFn: ({ signal }) =>
      api.listProductsStatus(
        {
          query: query.trim() || undefined,
          status,
          page,
          page_size: Number(pageSize),
          sort: "nome",
        },
        { signal }
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
        `${response.data.updated} item(ns) ${variables.ativo ? "reativado(s)" : "inativado(s)"} com sucesso.`
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
    [visibleIds, selectedSet]
  );
  const allVisibleSelected = visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;

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

  return (
    <Stack gap="lg">
      <PageHeader
        title="Ativar/Inativar Itens"
        subtitle="Painel rapido para gerenciar status de muitos itens ao mesmo tempo."
        actions={(
          <>
            <Badge variant="light">Selecionados: {selectedIds.length}</Badge>
            <Button
              variant="light"
              color="red"
              onClick={() => runBulkStatus(false)}
              loading={bulkMutation.isPending}
              disabled={selectedIds.length === 0}
            >
              Marcar inativo
            </Button>
            <Button
              variant="light"
              color="green"
              onClick={() => runBulkStatus(true)}
              loading={bulkMutation.isPending}
              disabled={selectedIds.length === 0}
            >
              Reativar
            </Button>
          </>
        )}
      />

      <FilterToolbar>
        <Group align="end" wrap="wrap">
          <TextInput
            label="Buscar"
            placeholder="Nome do item"
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
              setStatus((value as ProductStatusFilter) || "TODOS");
              setPage(1);
            }}
            w={180}
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
          <Button
            variant="subtle"
            onClick={() => {
              setQuery("");
              setStatus("TODOS");
              setPage(1);
              setSelectedIds([]);
            }}
          >
            Limpar filtros
          </Button>
        </Group>
      </FilterToolbar>

      <DataTable minWidth={940}>
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
              <Table.Th>Status</Table.Th>
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
                    <Badge color={product.ativo ? "green" : "gray"} variant="light">
                      {product.ativo ? "ATIVO" : "INATIVO"}
                    </Badge>
                  </Table.Td>
                </Table.Tr>
              );
            })}
            {listQuery.isError && (
              <Table.Tr>
                <Table.Td colSpan={7}>
                  <EmptyState
                    message={`${loadError} Verifique se o backend esta atualizado para 1.2.0+.`}
                    actionLabel="Tentar novamente"
                    onAction={() => void listQuery.refetch()}
                  />
                </Table.Td>
              </Table.Tr>
            )}
            {!listQuery.isError && rows.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={7}>
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
    </Stack>
  );
}
