import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "@mantine/form";
import { useDebouncedValue, useDisclosure } from "@mantine/hooks";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";

import type { MovementOut, Product, SuccessResponse } from "../lib/api";
import { api } from "../lib/apiClient";
import {
  DEFAULT_MOVEMENT_FILTERS,
  DEFAULT_MOVEMENTS_TAB_STATE,
  MOVEMENTS_TAB_ID,
  deserializeFilters,
  serializeFilters,
  type MovementFilters,
  type MovementsTabState,
} from "../lib/movements";
import { useMovementsTablePreferences } from "./useMovementsTablePreferences";
import { useProfileScope } from "../state/profileScope";
import { clearTabState, loadTabState, saveTabState } from "../state/tabStateCache";

export function useMovementsPageState() {
  const { profileScopeKey } = useProfileScope();
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
  const { tablePreferences, setTablePreferences, tableLayout, resetTablePreferences } =
    useMovementsTablePreferences();

  const filtersForm = useForm<MovementFilters>({
    initialValues: persistedFilters,
  });

  const serializedFilters = useMemo(
    () => serializeFilters(filtersForm.values),
    [filtersForm.values]
  );

  const productLookupQuery = useQuery<SuccessResponse<Product[]>>({
    queryKey: ["movimentacoes-product-lookup", profileScopeKey, debouncedProductSearch],
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
    queryKey: ["movimentacoes", profileScopeKey, page, pageSize, sort, serializedFilters],
    queryFn: ({ signal }) =>
      api.listMovements(
        {
          produto_id: serializedFilters.produto_id ? Number(serializedFilters.produto_id) : undefined,
          tipo: serializedFilters.tipo || undefined,
          natureza: serializedFilters.natureza || undefined,
          origem: serializedFilters.origem || undefined,
          destino: serializedFilters.destino || undefined,
          date_from: serializedFilters.date_from
            ? dayjs(serializedFilters.date_from).startOf("day").format("YYYY-MM-DDTHH:mm:ss")
            : undefined,
          date_to: serializedFilters.date_to
            ? dayjs(serializedFilters.date_to).endOf("day").format("YYYY-MM-DDTHH:mm:ss")
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
    queryKey: ["historico", profileScopeKey, historyProductId],
    queryFn: ({ signal }) =>
      api.getProductHistory(historyProductId!, { page: 1, page_size: 20, sort: "-data" }, { signal }),
    enabled: !!historyProductId && historyOpened,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const totalItems = listQuery.data?.meta?.total_items ?? 0;
  const totalPages = Math.max(listQuery.data?.meta?.total_pages ?? 1, 1);
  const listErrorMessage = listQuery.error instanceof Error ? listQuery.error.message : null;
  const historyErrorMessage = historyQuery.error instanceof Error ? historyQuery.error.message : null;

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

  const tableColumnCount = tableLayout.showExtraColumns ? 13 : 11;

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
    <K extends keyof MovementFilters>(field: K, value: MovementFilters[K]) => {
      filtersForm.setFieldValue(field, value as never);
      setPage(1);
    },
    [filtersForm]
  );

  const clearFilters = useCallback(() => {
    filtersForm.setValues({ ...DEFAULT_MOVEMENT_FILTERS });
    setPage(1);
  }, [filtersForm]);

  const resetView = useCallback(() => {
    setPage(DEFAULT_MOVEMENTS_TAB_STATE.page);
    setPageSize(DEFAULT_MOVEMENTS_TAB_STATE.pageSize);
    setSort(DEFAULT_MOVEMENTS_TAB_STATE.sort);
    setProductSearch(DEFAULT_MOVEMENTS_TAB_STATE.productSearch);
    setShowProductId(DEFAULT_MOVEMENTS_TAB_STATE.showProductId);
    setShowAdvancedFilters(false);
    setHistoryProductId(DEFAULT_MOVEMENTS_TAB_STATE.historyProductId);
    historyHandlers.close();
    filtersForm.setValues({ ...DEFAULT_MOVEMENT_FILTERS });
    resetTablePreferences();
    clearTabState(MOVEMENTS_TAB_ID);
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [filtersForm, historyHandlers, resetTablePreferences]);

  const openHistory = useCallback(
    (productId: number) => {
      setHistoryProductId(productId);
      historyHandlers.open();
    },
    [historyHandlers]
  );

  const closeHistory = useCallback(() => {
    historyHandlers.close();
    setHistoryProductId(null);
  }, [historyHandlers]);

  return {
    activeViewCount,
    clearFilters,
    closeHistory,
    filters: filtersForm.values,
    historyErrorMessage,
    historyOpened,
    historyProductId,
    historyRows: historyQuery.data?.data ?? [],
    historyLoading: historyQuery.isLoading,
    historyRefetch: historyQuery.refetch,
    listErrorMessage,
    loading: listQuery.isLoading,
    openHistory,
    page,
    pageSize,
    productLookupLoading: productLookupQuery.isFetching,
    productOptions,
    productSearch,
    resetView,
    rows: listQuery.data?.data ?? [],
    setFilterValue,
    setPage,
    setPageSize: (value: string) => {
      setPageSize(value);
      setPage(1);
    },
    setProductSearch,
    setShowAdvancedFilters,
    setShowProductId,
    setSort: (value: string) => {
      setSort(value);
      setPage(1);
    },
    showAdvancedFilters,
    showProductId,
    sort,
    tableColumnCount,
    tableLayout,
    tablePreferences,
    setTablePreferences,
    totalItems,
    totalPages,
    listRefetch: listQuery.refetch,
  };
}
