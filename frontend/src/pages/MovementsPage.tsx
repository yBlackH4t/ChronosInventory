import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Collapse,
  Group,
  Loader,
  Modal,
  Pagination,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { useForm } from "@mantine/form";
import { useDebouncedValue, useDisclosure } from "@mantine/hooks";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";

import { api } from "../lib/apiClient";
import DataTable from "../components/ui/DataTable";
import EmptyState from "../components/ui/EmptyState";
import FilterToolbar from "../components/ui/FilterToolbar";
import PageHeader from "../components/ui/PageHeader";
import type { MovementCreate, MovementOut, Product, SuccessResponse } from "../lib/api";
import { clearTabState, loadTabState, saveTabState } from "../state/tabStateCache";

const MOVEMENT_TYPES = [
  { value: "ENTRADA", label: "Entrada" },
  { value: "SAIDA", label: "Saida" },
  { value: "TRANSFERENCIA", label: "Transferencia" },
];

const MOVEMENT_NATURES = [
  { value: "OPERACAO_NORMAL", label: "Operacao normal" },
  { value: "TRANSFERENCIA_EXTERNA", label: "Transferencia externa" },
  { value: "DEVOLUCAO", label: "Devolucao" },
  { value: "AJUSTE", label: "Ajuste" },
];

const ADJUSTMENT_REASON_LABELS: Record<string, string> = {
  AVARIA: "Avaria",
  PERDA: "Perda",
  CORRECAO_INVENTARIO: "Correcao inventario",
  ERRO_OPERACIONAL: "Erro operacional",
  TRANSFERENCIA: "Transferencia",
};

const LOCATIONS = [
  { value: "CANOAS", label: "Canoas" },
  { value: "PF", label: "Passo Fundo" },
];

type MovementFilters = {
  produto_id: string;
  tipo: "" | MovementCreate["tipo"];
  natureza: "" | NonNullable<MovementCreate["natureza"]>;
  origem: "" | "CANOAS" | "PF";
  destino: "" | "CANOAS" | "PF";
  date_from: Date | null;
  date_to: Date | null;
};

type SerializedMovementFilters = {
  produto_id: string;
  tipo: "" | MovementCreate["tipo"];
  natureza: "" | NonNullable<MovementCreate["natureza"]>;
  origem: "" | "CANOAS" | "PF";
  destino: "" | "CANOAS" | "PF";
  date_from: string | null;
  date_to: string | null;
};

type MovementsTabState = {
  page: number;
  pageSize: string;
  sort: string;
  productSearch: string;
  showProductId: boolean;
  filters: SerializedMovementFilters;
  historyProductId: number | null;
  historyOpened: boolean;
  scrollY: number;
};

const MOVEMENTS_TAB_ID = "movements";

const DEFAULT_MOVEMENT_FILTERS: MovementFilters = {
  produto_id: "",
  tipo: "",
  natureza: "",
  origem: "",
  destino: "",
  date_from: null,
  date_to: null,
};

const DEFAULT_MOVEMENTS_TAB_STATE: MovementsTabState = {
  page: 1,
  pageSize: "10",
  sort: "-data",
  productSearch: "",
  showProductId: false,
  filters: {
    produto_id: "",
    tipo: "",
    natureza: "",
    origem: "",
    destino: "",
    date_from: null,
    date_to: null,
  },
  historyProductId: null,
  historyOpened: false,
  scrollY: 0,
};

function serializeFilters(filters: MovementFilters): SerializedMovementFilters {
  return {
    ...filters,
    date_from: filters.date_from ? dayjs(filters.date_from).format("YYYY-MM-DD") : null,
    date_to: filters.date_to ? dayjs(filters.date_to).format("YYYY-MM-DD") : null,
  };
}

function deserializeFilters(filters: SerializedMovementFilters | undefined): MovementFilters {
  if (!filters) return { ...DEFAULT_MOVEMENT_FILTERS };
  return {
    ...filters,
    date_from: filters.date_from ? dayjs(filters.date_from).toDate() : null,
    date_to: filters.date_to ? dayjs(filters.date_to).toDate() : null,
  };
}

function movementColor(tipo: MovementOut["tipo"]) {
  if (tipo === "ENTRADA") return "green";
  if (tipo === "SAIDA") return "red";
  return "yellow";
}

function movementNatureLabel(natureza: MovementOut["natureza"]) {
  return MOVEMENT_NATURES.find((item) => item.value === natureza)?.label ?? natureza;
}

function adjustmentReasonLabel(reason?: string | null) {
  if (!reason) return "-";
  return ADJUSTMENT_REASON_LABELS[reason] ?? reason;
}

export default function MovementsPage() {
  const persistedState = useMemo(
    () => loadTabState<MovementsTabState>(MOVEMENTS_TAB_ID) ?? DEFAULT_MOVEMENTS_TAB_STATE,
    []
  );
  const persistedFilters = useMemo(
    () => deserializeFilters(persistedState.filters),
    [persistedState.filters]
  );

  const [page, setPage] = useState(persistedState.page);
  const [pageSize, setPageSize] = useState(persistedState.pageSize);
  const [sort, setSort] = useState<string>(persistedState.sort);
  const [productSearch, setProductSearch] = useState(persistedState.productSearch);
  const [showProductId, setShowProductId] = useState(persistedState.showProductId);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(
    Boolean(persistedState.showProductId || persistedFilters.origem || persistedFilters.destino)
  );
  const [historyProductId, setHistoryProductId] = useState<number | null>(
    persistedState.historyProductId
  );
  const [scrollY, setScrollY] = useState(persistedState.scrollY);
  const [debouncedProductSearch] = useDebouncedValue(productSearch, 300);
  const [historyOpened, historyHandlers] = useDisclosure(persistedState.historyOpened);

  const filtersForm = useForm<MovementFilters>({
    initialValues: persistedFilters,
  });

  const serializedFilters = useMemo(
    () => serializeFilters(filtersForm.values),
    [filtersForm.values]
  );

  const productLookupQuery = useQuery<SuccessResponse<Product[]>>({
    queryKey: ["movimentacoes-product-lookup", debouncedProductSearch],
    queryFn: ({ signal }) =>
      api.listProducts(
        {
          query: debouncedProductSearch,
          page: 1,
          page_size: 20,
          sort: "nome",
        },
        { signal }
      ),
    enabled: debouncedProductSearch.trim().length >= 2,
    staleTime: 30_000,
  });

  const productOptions = useMemo(() => {
    const options = (productLookupQuery.data?.data ?? []).map((product) => ({
      value: String(product.id),
      label: `${product.nome} (#${product.id})`,
    }));
    const selectedId = filtersForm.values.produto_id;
    if (selectedId && !options.some((option) => option.value === selectedId)) {
      options.unshift({ value: selectedId, label: `Produto #${selectedId}` });
    }
    return options;
  }, [filtersForm.values.produto_id, productLookupQuery.data?.data]);

  const listQuery = useQuery<SuccessResponse<MovementOut[]>>({
    queryKey: ["movimentacoes", page, pageSize, sort, serializedFilters],
    queryFn: ({ signal }) =>
      api.listMovements(
        {
          produto_id: serializedFilters.produto_id ? Number(serializedFilters.produto_id) : undefined,
          tipo: serializedFilters.tipo || undefined,
          natureza: serializedFilters.natureza || undefined,
          origem: serializedFilters.origem || undefined,
          destino: serializedFilters.destino || undefined,
          date_from: serializedFilters.date_from
            ? dayjs(serializedFilters.date_from).startOf("day").toISOString()
            : undefined,
          date_to: serializedFilters.date_to
            ? dayjs(serializedFilters.date_to).endOf("day").toISOString()
            : undefined,
          page,
          page_size: Number(pageSize),
          sort,
        },
        { signal }
      ),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const historyQuery = useQuery<SuccessResponse<MovementOut[]>>({
    queryKey: ["historico", historyProductId],
    queryFn: ({ signal }) =>
      api.getProductHistory(historyProductId!, { page: 1, page_size: 20, sort: "-data" }, { signal }),
    enabled: !!historyProductId && historyOpened,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const totalItems = listQuery.data?.meta?.total_items ?? 0;
  const totalPages = Math.max(listQuery.data?.meta?.total_pages ?? 1, 1);

  const activeViewCount = useMemo(() => {
    let count = 0;
    if (filtersForm.values.produto_id) count += 1;
    if (filtersForm.values.tipo) count += 1;
    if (filtersForm.values.natureza) count += 1;
    if (filtersForm.values.origem) count += 1;
    if (filtersForm.values.destino) count += 1;
    if (filtersForm.values.date_from) count += 1;
    if (filtersForm.values.date_to) count += 1;
    if (sort !== DEFAULT_MOVEMENTS_TAB_STATE.sort) count += 1;
    if (pageSize !== DEFAULT_MOVEMENTS_TAB_STATE.pageSize) count += 1;
    return count;
  }, [
    filtersForm.values.produto_id,
    filtersForm.values.tipo,
    filtersForm.values.natureza,
    filtersForm.values.origem,
    filtersForm.values.destino,
    filtersForm.values.date_from,
    filtersForm.values.date_to,
    pageSize,
    sort,
  ]);

  const persistState = useCallback(
    (nextScrollY = scrollY) => {
      saveTabState<MovementsTabState>(MOVEMENTS_TAB_ID, {
        page,
        pageSize,
        sort,
        productSearch,
        showProductId,
        filters: serializedFilters,
        historyProductId,
        historyOpened,
        scrollY: nextScrollY,
      });
    },
    [
      historyOpened,
      historyProductId,
      page,
      pageSize,
      productSearch,
      scrollY,
      serializedFilters,
      showProductId,
      sort,
    ]
  );

  useEffect(() => {
    persistState();
  }, [persistState]);

  useEffect(() => {
    if (!persistedState.scrollY || persistedState.scrollY <= 0) return;
    const timer = window.setTimeout(() => {
      window.scrollTo({ top: persistedState.scrollY, behavior: "auto" });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [persistedState.scrollY]);

  useEffect(() => {
    let timeout: number | null = null;
    const onScroll = () => {
      if (timeout !== null) return;
      timeout = window.setTimeout(() => {
        setScrollY(window.scrollY);
        timeout = null;
      }, 180);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      if (timeout !== null) window.clearTimeout(timeout);
      window.removeEventListener("scroll", onScroll);
      persistState(window.scrollY);
    };
  }, [persistState]);

  const setFilterValue = useCallback(
    (field: keyof MovementFilters, value: MovementFilters[keyof MovementFilters]) => {
      filtersForm.setFieldValue(field, value as never);
      setPage(1);
    },
    [filtersForm]
  );

  const clearFilters = () => {
    filtersForm.setValues({ ...DEFAULT_MOVEMENT_FILTERS });
    setPage(1);
  };

  const resetView = () => {
    setPage(DEFAULT_MOVEMENTS_TAB_STATE.page);
    setPageSize(DEFAULT_MOVEMENTS_TAB_STATE.pageSize);
    setSort(DEFAULT_MOVEMENTS_TAB_STATE.sort);
    setProductSearch(DEFAULT_MOVEMENTS_TAB_STATE.productSearch);
    setShowProductId(DEFAULT_MOVEMENTS_TAB_STATE.showProductId);
    setShowAdvancedFilters(false);
    setHistoryProductId(DEFAULT_MOVEMENTS_TAB_STATE.historyProductId);
    historyHandlers.close();
    filtersForm.setValues({ ...DEFAULT_MOVEMENT_FILTERS });
    clearTabState(MOVEMENTS_TAB_ID);
    window.scrollTo({ top: 0, behavior: "auto" });
  };

  const openHistory = (productId: number) => {
    setHistoryProductId(productId);
    historyHandlers.open();
  };

  const closeHistory = () => {
    historyHandlers.close();
    setHistoryProductId(null);
  };

  return (
    <Stack gap="xl">
      <Stack gap="sm">
        <PageHeader
          title="Historico de movimentacoes"
          subtitle="Filtros detalhados para rastrear entradas, saidas, transferencias e devolucoes."
          actions={(
            <>
              <Badge variant="light">Filtros ativos: {activeViewCount}</Badge>
              <Button
                size="xs"
                variant="subtle"
                onClick={clearFilters}
                disabled={activeViewCount === 0}
              >
                Limpar filtros
              </Button>
              <Button size="xs" variant="subtle" onClick={resetView}>
                Resetar visao
              </Button>
            </>
          )}
        />

        <FilterToolbar>
          <Stack gap="sm">
            <Group align="end" wrap="wrap">
              <Select
                label="Produto (nome)"
                placeholder="Buscar por nome"
                data={productOptions}
                searchable
                clearable
                w={280}
                value={filtersForm.values.produto_id || null}
                onChange={(value) => setFilterValue("produto_id", value ?? "")}
                searchValue={productSearch}
                onSearchChange={setProductSearch}
                nothingFoundMessage={
                  productSearch.trim().length < 2 ? "Digite ao menos 2 letras" : "Nenhum produto"
                }
                rightSection={productLookupQuery.isFetching ? <Loader size="xs" /> : undefined}
              />
              <Select
                label="Tipo"
                data={MOVEMENT_TYPES}
                clearable
                value={filtersForm.values.tipo || null}
                onChange={(value) => setFilterValue("tipo", (value as MovementFilters["tipo"]) ?? "")}
                w={180}
              />
              <Select
                label="Natureza"
                data={MOVEMENT_NATURES}
                clearable
                value={filtersForm.values.natureza || null}
                onChange={(value) =>
                  setFilterValue("natureza", (value as MovementFilters["natureza"]) ?? "")
                }
                w={220}
              />
              <DatePickerInput
                label="De"
                value={filtersForm.values.date_from}
                onChange={(value) => setFilterValue("date_from", value as Date | null)}
                w={170}
              />
              <DatePickerInput
                label="Ate"
                value={filtersForm.values.date_to}
                onChange={(value) => setFilterValue("date_to", value as Date | null)}
                w={170}
              />
              <Select
                label="Por pagina"
                data={["10", "20", "50"]}
                value={pageSize}
                onChange={(value) => {
                  if (!value) return;
                  setPageSize(value);
                  setPage(1);
                }}
                w={120}
              />
              <Button
                variant="light"
                onClick={() => {
                  setSort(sort === "-data" ? "data" : "-data");
                  setPage(1);
                }}
              >
                Ordenar: {sort === "-data" ? "Mais recentes" : "Mais antigos"}
              </Button>
            </Group>

            <Group justify="space-between" wrap="wrap">
              <Text size="xs" c="dimmed">
                Use filtros avancados para origem, destino e busca por ID.
              </Text>
              <Button
                size="xs"
                variant="default"
                onClick={() => setShowAdvancedFilters((value) => !value)}
              >
                {showAdvancedFilters ? "Ocultar filtros avancados" : "Mostrar filtros avancados"}
              </Button>
            </Group>

            <Collapse in={showAdvancedFilters}>
              <Group align="end" wrap="wrap">
                <Switch
                  label="Buscar por ID"
                  checked={showProductId}
                  onChange={(event) => setShowProductId(event.currentTarget.checked)}
                />
                {showProductId && (
                  <TextInput
                    label="Produto ID"
                    value={filtersForm.values.produto_id}
                    onChange={(event) =>
                      setFilterValue("produto_id", event.currentTarget.value.replace(/\D/g, ""))
                    }
                    w={140}
                  />
                )}
                <Select
                  label="Origem"
                  data={LOCATIONS}
                  clearable
                  value={filtersForm.values.origem || null}
                  onChange={(value) => setFilterValue("origem", (value as MovementFilters["origem"]) ?? "")}
                  w={140}
                />
                <Select
                  label="Destino"
                  data={LOCATIONS}
                  clearable
                  value={filtersForm.values.destino || null}
                  onChange={(value) =>
                    setFilterValue("destino", (value as MovementFilters["destino"]) ?? "")
                  }
                  w={140}
                />
              </Group>
            </Collapse>
          </Stack>
        </FilterToolbar>

        {listQuery.isLoading ? (
          <Group justify="center" mt="xl">
            <Loader />
          </Group>
        ) : (
          <DataTable minWidth={1100}>
            <Table striped highlightOnHover withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>ID</Table.Th>
                  <Table.Th>Produto</Table.Th>
                  <Table.Th>Tipo</Table.Th>
                  <Table.Th>Natureza</Table.Th>
                  <Table.Th>Qtd</Table.Th>
                  <Table.Th>Origem</Table.Th>
                  <Table.Th>Destino</Table.Th>
                  <Table.Th>Documento</Table.Th>
                  <Table.Th>Motivo ajuste</Table.Th>
                  <Table.Th>Local externo</Table.Th>
                  <Table.Th>Observacao</Table.Th>
                  <Table.Th>Data</Table.Th>
                  <Table.Th>Acoes</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {listQuery.data?.data?.map((mov: MovementOut) => (
                  <Table.Tr key={mov.id}>
                    <Table.Td>{mov.id}</Table.Td>
                    <Table.Td>{mov.produto_nome || `ID ${mov.produto_id}`}</Table.Td>
                    <Table.Td>
                      <Badge color={movementColor(mov.tipo)} variant="light">
                        {mov.tipo}
                      </Badge>
                    </Table.Td>
                    <Table.Td>{movementNatureLabel(mov.natureza)}</Table.Td>
                    <Table.Td>{mov.quantidade}</Table.Td>
                    <Table.Td>{mov.origem || "-"}</Table.Td>
                    <Table.Td>{mov.destino || "-"}</Table.Td>
                    <Table.Td>{mov.documento || "-"}</Table.Td>
                    <Table.Td>{adjustmentReasonLabel(mov.motivo_ajuste)}</Table.Td>
                    <Table.Td>{mov.local_externo || "-"}</Table.Td>
                    <Table.Td>{mov.observacao || "-"}</Table.Td>
                    <Table.Td>{dayjs(mov.data).format("DD/MM/YYYY HH:mm")}</Table.Td>
                    <Table.Td>
                      <Button size="xs" variant="light" onClick={() => openHistory(mov.produto_id)}>
                        Ver historico
                      </Button>
                    </Table.Td>
                  </Table.Tr>
                ))}
                {(listQuery.data?.data?.length ?? 0) === 0 && (
                  <Table.Tr>
                    <Table.Td colSpan={13}>
                      <EmptyState
                        message="Nenhuma movimentacao encontrada"
                        actionLabel={activeViewCount > 0 ? "Limpar filtros" : undefined}
                        onAction={activeViewCount > 0 ? clearFilters : undefined}
                      />
                    </Table.Td>
                  </Table.Tr>
                )}
              </Table.Tbody>
            </Table>
          </DataTable>
        )}

        <Group justify="space-between">
          <Text size="sm" c="dimmed">
            Total: {totalItems}
          </Text>
          <Pagination value={page} onChange={setPage} total={totalPages} />
        </Group>
      </Stack>

      <Modal opened={historyOpened} onClose={closeHistory} title="Historico do produto" size="lg">
        {!historyProductId ? (
          <Text c="dimmed">Selecione um produto para carregar o historico.</Text>
        ) : historyQuery.isLoading ? (
          <Group justify="center" mt="sm">
            <Loader size="sm" />
          </Group>
        ) : (
          <Table.ScrollContainer minWidth={900}>
            <Table striped withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>ID</Table.Th>
                  <Table.Th>Tipo</Table.Th>
                  <Table.Th>Natureza</Table.Th>
                  <Table.Th>Qtd</Table.Th>
                  <Table.Th>Origem</Table.Th>
                  <Table.Th>Destino</Table.Th>
                  <Table.Th>Documento</Table.Th>
                  <Table.Th>Motivo ajuste</Table.Th>
                  <Table.Th>Local externo</Table.Th>
                  <Table.Th>Observacao</Table.Th>
                  <Table.Th>Data</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {historyQuery.data?.data?.map((mov: MovementOut) => (
                  <Table.Tr key={mov.id}>
                    <Table.Td>{mov.id}</Table.Td>
                    <Table.Td>
                      <Badge color={movementColor(mov.tipo)} variant="light">
                        {mov.tipo}
                      </Badge>
                    </Table.Td>
                    <Table.Td>{movementNatureLabel(mov.natureza)}</Table.Td>
                    <Table.Td>{mov.quantidade}</Table.Td>
                    <Table.Td>{mov.origem || "-"}</Table.Td>
                    <Table.Td>{mov.destino || "-"}</Table.Td>
                    <Table.Td>{mov.documento || "-"}</Table.Td>
                    <Table.Td>{adjustmentReasonLabel(mov.motivo_ajuste)}</Table.Td>
                    <Table.Td>{mov.local_externo || "-"}</Table.Td>
                    <Table.Td>{mov.observacao || "-"}</Table.Td>
                    <Table.Td>{dayjs(mov.data).format("DD/MM/YYYY HH:mm")}</Table.Td>
                  </Table.Tr>
                ))}
                {(historyQuery.data?.data?.length ?? 0) === 0 && (
                  <Table.Tr>
                    <Table.Td colSpan={11}>
                      <EmptyState message="Sem historico" />
                    </Table.Td>
                  </Table.Tr>
                )}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Modal>
    </Stack>
  );
}
