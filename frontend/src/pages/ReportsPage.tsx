import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Group,
  Loader,
  Stack,
  Tabs,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";

import { api } from "../lib/apiClient";
import PageHeader from "../components/ui/PageHeader";
const ReportsStockSection = lazy(() => import("../components/reports/ReportsStockSection"));
const ReportsSelectedItemsSection = lazy(
  () => import("../components/reports/ReportsSelectedItemsSection")
);
const ReportsSalesSection = lazy(() => import("../components/reports/ReportsSalesSection"));
const ReportsInactiveSection = lazy(() => import("../components/reports/ReportsInactiveSection"));
import { downloadBlob } from "../lib/download";
import { loadTabState, saveTabState } from "../state/tabStateCache";
import type { DownloadResponse, Product, SuccessResponse } from "../lib/api";
import { notifyError, notifySuccess } from "../lib/notify";

type SelectedReportProduct = Pick<Product, "id" | "nome" | "qtd_canoas" | "qtd_pf" | "total_stock">;

type ReportsTabState = {
  activeSection: "estoque" | "selecionados" | "vendas" | "parados";
  salesDateFrom: string | null;
  salesDateTo: string | null;
  salesScope: "AMBOS" | "CANOAS" | "PF";
  inactiveDays: number;
  inactiveDateTo: string | null;
  inactiveScope: "AMBOS" | "CANOAS" | "PF";
  selectedSearch: string;
  selectedItems: SelectedReportProduct[];
};

const REPORTS_TAB_ID = "reports";
const DEFAULT_REPORTS_TAB_STATE: ReportsTabState = {
  activeSection: "estoque",
  salesDateFrom: dayjs().startOf("month").format("YYYY-MM-DD"),
  salesDateTo: dayjs().format("YYYY-MM-DD"),
  salesScope: "AMBOS",
  inactiveDays: 30,
  inactiveDateTo: dayjs().format("YYYY-MM-DD"),
  inactiveScope: "AMBOS",
  selectedSearch: "",
  selectedItems: [],
};

const SCOPE_OPTIONS = [
  { value: "AMBOS", label: "Ambos" },
  { value: "CANOAS", label: "Canoas" },
  { value: "PF", label: "Passo Fundo" },
] as const;

function normalizeSelectedProduct(product: Partial<SelectedReportProduct> | Product): SelectedReportProduct {
  const qtd_canoas = Number(product.qtd_canoas || 0);
  const qtd_pf = Number(product.qtd_pf || 0);
  const total_stock = Number(product.total_stock ?? qtd_canoas + qtd_pf);
  return {
    id: Number(product.id || 0),
    nome: String(product.nome || ""),
    qtd_canoas,
    qtd_pf,
    total_stock,
  };
}

function locationLabel(qtdCanoas: number, qtdPf: number) {
  if (qtdCanoas > 0 && qtdPf > 0) return "Canoas / PF";
  if (qtdCanoas > 0) return "Canoas";
  if (qtdPf > 0) return "PF";
  return "Sem saldo";
}

function ReportSectionFallback() {
  return (
    <Group justify="center" py="xl">
      <Loader size="sm" />
    </Group>
  );
}

export default function ReportsPage() {
  const persistedState = useMemo<ReportsTabState>(() => {
    const cached = loadTabState<Partial<ReportsTabState>>(REPORTS_TAB_ID) ?? {};
    return {
      ...DEFAULT_REPORTS_TAB_STATE,
      ...cached,
      selectedItems: Array.isArray(cached.selectedItems)
        ? cached.selectedItems
            .map((item) => normalizeSelectedProduct(item))
            .filter((item) => item.id > 0 && item.nome.trim().length > 0)
        : [],
    };
  }, []);

  const [salesDateFrom, setSalesDateFrom] = useState<Date | null>(
    persistedState.salesDateFrom ? dayjs(persistedState.salesDateFrom).toDate() : dayjs().startOf("month").toDate()
  );
  const [activeSection, setActiveSection] = useState<ReportsTabState["activeSection"]>(persistedState.activeSection);
  const [salesDateTo, setSalesDateTo] = useState<Date | null>(
    persistedState.salesDateTo ? dayjs(persistedState.salesDateTo).toDate() : dayjs().toDate()
  );
  const [salesScope, setSalesScope] = useState<"AMBOS" | "CANOAS" | "PF">(persistedState.salesScope);
  const [inactiveDays, setInactiveDays] = useState<number>(persistedState.inactiveDays);
  const [inactiveDateTo, setInactiveDateTo] = useState<Date | null>(
    persistedState.inactiveDateTo ? dayjs(persistedState.inactiveDateTo).toDate() : dayjs().toDate()
  );
  const [inactiveScope, setInactiveScope] = useState<"AMBOS" | "CANOAS" | "PF">(persistedState.inactiveScope);
  const [selectedSearch, setSelectedSearch] = useState(persistedState.selectedSearch);
  const [selectedItems, setSelectedItems] = useState<SelectedReportProduct[]>(persistedState.selectedItems);
  const [debouncedSelectedSearch] = useDebouncedValue(selectedSearch, 300);

  useEffect(() => {
    saveTabState<ReportsTabState>(REPORTS_TAB_ID, {
      activeSection,
      salesDateFrom: salesDateFrom ? dayjs(salesDateFrom).format("YYYY-MM-DD") : null,
      salesDateTo: salesDateTo ? dayjs(salesDateTo).format("YYYY-MM-DD") : null,
      salesScope,
      inactiveDays,
      inactiveDateTo: inactiveDateTo ? dayjs(inactiveDateTo).format("YYYY-MM-DD") : null,
      inactiveScope,
      selectedSearch,
      selectedItems,
    });
  }, [
    activeSection,
    inactiveDateTo,
    inactiveDays,
    inactiveScope,
    salesDateFrom,
    salesDateTo,
    salesScope,
    selectedItems,
    selectedSearch,
  ]);

  const selectedIds = useMemo(() => new Set(selectedItems.map((item) => item.id)), [selectedItems]);

  const lookupQuery = useQuery<SuccessResponse<Product[]>>({
    queryKey: ["reports-product-lookup", debouncedSelectedSearch],
    queryFn: ({ signal }) =>
      api.listProducts(
        {
          query: debouncedSelectedSearch,
          page: 1,
          page_size: 12,
          sort: "nome",
        },
        { signal }
      ),
    enabled: debouncedSelectedSearch.trim().length >= 2,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const stockReportMutation = useMutation<DownloadResponse, Error, void>({
    mutationFn: () => api.reportStockPDF(),
    onSuccess: (res) => {
      const filename = res.filename || "Relatorio_Estoque.pdf";
      downloadBlob(res.blob, filename);
      notifySuccess("Relatorio de estoque gerado.");
    },
    onError: (error) => notifyError(error),
  });

  const selectedStockReportMutation = useMutation<DownloadResponse, Error, void>({
    mutationFn: () => api.reportSelectedStockPDF({ product_ids: selectedItems.map((item) => item.id) }),
    onSuccess: (res) => {
      downloadBlob(res.blob, res.filename || "Relatorio_Estoque_Selecionado.pdf");
      notifySuccess("Relatorio dos itens selecionados gerado.");
    },
    onError: (error) => notifyError(error),
  });

  const salesReportMutation = useMutation<DownloadResponse, Error, void>({
    mutationFn: () =>
      api.reportRealSalesPDF({
        date_from: dayjs(salesDateFrom || new Date()).format("YYYY-MM-DD"),
        date_to: dayjs(salesDateTo || new Date()).format("YYYY-MM-DD"),
        scope: salesScope,
      }),
    onSuccess: (res) => {
      downloadBlob(res.blob, res.filename || "Relatorio_Vendas_Reais.pdf");
      notifySuccess("Relatorio de vendas reais gerado.");
    },
    onError: (error) => notifyError(error),
  });

  const inactiveReportMutation = useMutation<DownloadResponse, Error, void>({
    mutationFn: () =>
      api.reportInactiveStockPDF({
        days: inactiveDays,
        date_to: dayjs(inactiveDateTo || new Date()).format("YYYY-MM-DD"),
        scope: inactiveScope,
      }),
    onSuccess: (res) => {
      downloadBlob(res.blob, res.filename || "Relatorio_Estoque_Parado.pdf");
      notifySuccess("Relatorio de estoque parado gerado.");
    },
    onError: (error) => notifyError(error),
  });

  const addSelectedItem = (product: Product) => {
    setSelectedItems((current) => {
      if (current.some((item) => item.id === product.id)) return current;
      return [...current, normalizeSelectedProduct(product)];
    });
  };

  const removeSelectedItem = (productId: number) => {
    setSelectedItems((current) => current.filter((item) => item.id !== productId));
  };

  const moveSelectedItem = (itemId: number, direction: "up" | "down") => {
    setSelectedItems((current) => {
      const fromIndex = current.findIndex((item) => item.id === itemId);
      if (fromIndex < 0) return current;

      const toIndex = direction === "up" ? fromIndex - 1 : fromIndex + 1;
      if (toIndex < 0 || toIndex >= current.length) return current;

      const next = [...current];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  };

  const resetView = () => {
    setActiveSection(DEFAULT_REPORTS_TAB_STATE.activeSection);
    setSalesDateFrom(dayjs().startOf("month").toDate());
    setSalesDateTo(dayjs().toDate());
    setSalesScope("AMBOS");
    setInactiveDays(30);
    setInactiveDateTo(dayjs().toDate());
    setInactiveScope("AMBOS");
    setSelectedSearch("");
    setSelectedItems([]);
    saveTabState(REPORTS_TAB_ID, DEFAULT_REPORTS_TAB_STATE);
  };

  const searchResults = lookupQuery.data?.data ?? [];
  const lookupErrorMessage = lookupQuery.error instanceof Error ? lookupQuery.error.message : null;

  return (
    <Stack gap="lg">
      <PageHeader
        title="Relatorios"
        subtitle="Documentos prontos para conferencia interna, vendas reais, itens parados e listas personalizadas."
        actions={(
          <>
            <Badge variant="light">Filtros salvos nesta sessao</Badge>
            <Button size="xs" variant="subtle" onClick={resetView}>
              Resetar visao
            </Button>
          </>
        )}
      />

      <Tabs value={activeSection} onChange={(value) => setActiveSection((value as ReportsTabState["activeSection"]) || "estoque")}>
        <Tabs.List>
          <Tabs.Tab value="estoque">Estoque</Tabs.Tab>
          <Tabs.Tab value="selecionados">Selecionados</Tabs.Tab>
          <Tabs.Tab value="vendas">Vendas reais</Tabs.Tab>
          <Tabs.Tab value="parados">Estoque parado</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="estoque" pt="md">
          <Suspense fallback={<ReportSectionFallback />}>
            <ReportsStockSection
              onGenerate={() => stockReportMutation.mutate()}
              loading={stockReportMutation.isPending}
            />
          </Suspense>
        </Tabs.Panel>

        <Tabs.Panel value="selecionados" pt="md">
          <Suspense fallback={<ReportSectionFallback />}>
            <ReportsSelectedItemsSection
              selectedItems={selectedItems}
              selectedIds={selectedIds}
              selectedSearch={selectedSearch}
              setSelectedSearch={setSelectedSearch}
              searchResults={searchResults}
              loadingSearch={lookupQuery.isFetching && debouncedSelectedSearch.trim().length >= 2}
              lookupErrorMessage={lookupErrorMessage}
              addSelectedItem={addSelectedItem}
              removeSelectedItem={removeSelectedItem}
              moveSelectedItem={moveSelectedItem}
              clearSelectedItems={() => setSelectedItems([])}
              locationLabel={locationLabel}
              loadingGenerate={selectedStockReportMutation.isPending}
              generateSelectedReport={() => selectedStockReportMutation.mutate()}
            />
          </Suspense>
        </Tabs.Panel>

        <Tabs.Panel value="vendas" pt="md">
          <Suspense fallback={<ReportSectionFallback />}>
            <ReportsSalesSection
              salesDateFrom={salesDateFrom}
              setSalesDateFrom={setSalesDateFrom}
              salesDateTo={salesDateTo}
              setSalesDateTo={setSalesDateTo}
              salesScope={salesScope}
              setSalesScope={setSalesScope}
              scopeOptions={[...SCOPE_OPTIONS]}
              loading={salesReportMutation.isPending}
              onGenerate={() => salesReportMutation.mutate()}
            />
          </Suspense>
        </Tabs.Panel>

        <Tabs.Panel value="parados" pt="md">
          <Suspense fallback={<ReportSectionFallback />}>
            <ReportsInactiveSection
              inactiveDays={inactiveDays}
              setInactiveDays={setInactiveDays}
              inactiveDateTo={inactiveDateTo}
              setInactiveDateTo={setInactiveDateTo}
              inactiveScope={inactiveScope}
              setInactiveScope={setInactiveScope}
              scopeOptions={[...SCOPE_OPTIONS]}
              loading={inactiveReportMutation.isPending}
              onGenerate={() => inactiveReportMutation.mutate()}
            />
          </Suspense>
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
