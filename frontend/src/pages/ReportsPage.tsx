import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { Button, Grid, Group, Loader, Stack, Tabs, Text } from "@mantine/core";
import {
  IconBuildingWarehouse,
  IconCash,
  IconChartBar,
  IconHourglassEmpty,
  IconListCheck,
} from "@tabler/icons-react";
import { useDebouncedValue } from "@mantine/hooks";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";

import { api } from "../lib/apiClient";
import PageHeader from "../components/ui/PageHeader";
import "../styles/vidro-telas.css";
const ReportsStockSection = lazy(
  () => import("../components/reports/ReportsStockSection"),
);
const ReportsSelectedItemsSection = lazy(
  () => import("../components/reports/ReportsSelectedItemsSection"),
);
const ReportsSalesSection = lazy(
  () => import("../components/reports/ReportsSalesSection"),
);
const ReportsInactiveSection = lazy(
  () => import("../components/reports/ReportsInactiveSection"),
);
const ReportsAnalysisSection = lazy(
  () => import("../components/reports/ReportsAnalysisSection"),
);
import { downloadBlob } from "../lib/download";
import { loadTabState, saveTabState } from "../state/tabStateCache";
import type { DownloadResponse, Product, SuccessResponse } from "../lib/api";
import { notifyError, notifySuccess } from "../lib/notify";
import { notifyUndo } from "../lib/notifyUndo";

import { useLocations } from "../hooks/useLocations";

type SelectedReportProduct = Pick<
  Product,
  "id" | "nome" | "inventories" | "total_stock"
>;

const REPORT_TYPES: {
  value: ReportsTabState["activeSection"];
  label: string;
  hint: string;
  icon: typeof IconCash;
}[] = [
  { value: "estoque", label: "Estoque atual", hint: "Saldos por filial", icon: IconBuildingWarehouse },
  { value: "vendas", label: "Vendas reais", hint: "Saídas de operação normal", icon: IconCash },
  { value: "parados", label: "Estoque parado", hint: "Itens sem giro no período", icon: IconHourglassEmpty },
  { value: "selecionados", label: "Lista personalizada", hint: "Itens escolhidos por você", icon: IconListCheck },
  { value: "analises", label: "Análises", hint: "Gráficos que saíram do Painel", icon: IconChartBar },
];

type ReportsTabState = {
  activeSection: "estoque" | "selecionados" | "vendas" | "parados" | "analises";
  salesDateFrom: string | null;
  salesDateTo: string | null;
  salesScope: number | null;
  inactiveDays: number;
  inactiveDateTo: string | null;
  inactiveScope: number | null;
  selectedSearch: string;
  selectedItems: SelectedReportProduct[];
};

const REPORTS_TAB_ID = "reports";
const DEFAULT_REPORTS_TAB_STATE: ReportsTabState = {
  activeSection: "estoque",
  salesDateFrom: dayjs().startOf("month").format("YYYY-MM-DD"),
  salesDateTo: dayjs().format("YYYY-MM-DD"),
  salesScope: null,
  inactiveDays: 30,
  inactiveDateTo: dayjs().format("YYYY-MM-DD"),
  inactiveScope: null,
  selectedSearch: "",
  selectedItems: [],
};

function normalizeSelectedProduct(
  product: Partial<SelectedReportProduct> | Product,
): SelectedReportProduct {
  const inventories = product.inventories || {};
  const total_stock = Number(
    product.total_stock ??
      Object.values(inventories).reduce((a, b) => a + b, 0),
  );
  return {
    id: Number(product.id || 0),
    nome: String(product.nome || ""),
    inventories,
    total_stock,
  };
}

function locationLabel(
  inventories: Record<number, number> | undefined,
  locations: { id: number; name: string }[],
) {
  if (!inventories) return "Sem saldo";
  const activeLocs = locations.filter((loc) => (inventories[loc.id] ?? 0) > 0);
  if (activeLocs.length === 0) return "Sem saldo";
  return activeLocs.map((l) => l.name).join(" / ");
}

function ReportSectionFallback() {
  return (
    <Group justify="center" py="xl">
      <Loader size="sm" />
    </Group>
  );
}

export default function ReportsPage() {
  const { locations } = useLocations();
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
    persistedState.salesDateFrom
      ? dayjs(persistedState.salesDateFrom).toDate()
      : dayjs().startOf("month").toDate(),
  );
  const [activeSection, setActiveSection] = useState<
    ReportsTabState["activeSection"]
  >(persistedState.activeSection);
  const [salesDateTo, setSalesDateTo] = useState<Date | null>(
    persistedState.salesDateTo
      ? dayjs(persistedState.salesDateTo).toDate()
      : dayjs().toDate(),
  );
  const [salesScope, setSalesScope] = useState<number | null>(
    persistedState.salesScope,
  );
  const [inactiveDays, setInactiveDays] = useState<number>(
    persistedState.inactiveDays,
  );
  const [inactiveDateTo, setInactiveDateTo] = useState<Date | null>(
    persistedState.inactiveDateTo
      ? dayjs(persistedState.inactiveDateTo).toDate()
      : dayjs().toDate(),
  );
  const [inactiveScope, setInactiveScope] = useState<number | null>(
    persistedState.inactiveScope,
  );
  const [selectedSearch, setSelectedSearch] = useState(
    persistedState.selectedSearch,
  );
  const [selectedItems, setSelectedItems] = useState<SelectedReportProduct[]>(
    persistedState.selectedItems,
  );
  const [debouncedSelectedSearch] = useDebouncedValue(selectedSearch, 300);

  useEffect(() => {
    saveTabState<ReportsTabState>(REPORTS_TAB_ID, {
      activeSection,
      salesDateFrom: salesDateFrom
        ? dayjs(salesDateFrom).format("YYYY-MM-DD")
        : null,
      salesDateTo: salesDateTo ? dayjs(salesDateTo).format("YYYY-MM-DD") : null,
      salesScope,
      inactiveDays,
      inactiveDateTo: inactiveDateTo
        ? dayjs(inactiveDateTo).format("YYYY-MM-DD")
        : null,
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

  const selectedIds = useMemo(
    () => new Set(selectedItems.map((item) => item.id)),
    [selectedItems],
  );

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
        { signal },
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
      notifySuccess("Relatório de estoque gerado.");
    },
    onError: (error) => notifyError(error),
  });

  const selectedStockReportMutation = useMutation<
    DownloadResponse,
    Error,
    void
  >({
    mutationFn: () =>
      api.reportSelectedStockPDF({
        product_ids: selectedItems.map((item) => item.id),
      }),
    onSuccess: (res) => {
      downloadBlob(
        res.blob,
        res.filename || "Relatorio_Estoque_Selecionado.pdf",
      );
      notifySuccess("Relatório dos itens selecionados gerado.");
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
      notifySuccess("Relatório de vendas reais gerado.");
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
      notifySuccess("Relatório de estoque parado gerado.");
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
    const before = selectedItems;
    const removed = before.find((item) => item.id === productId);
    setSelectedItems((current) =>
      current.filter((item) => item.id !== productId),
    );
    if (removed) {
      notifyUndo(`${removed.nome} saiu da lista.`, () => setSelectedItems(before));
    }
  };

  const clearSelectedItems = () => {
    const before = selectedItems;
    setSelectedItems([]);
    if (before.length > 0) {
      notifyUndo(
        `Lista limpa (${before.length} ${before.length === 1 ? "item" : "itens"}).`,
        () => setSelectedItems(before),
      );
    }
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
    setSalesScope(null);
    setInactiveDays(30);
    setInactiveDateTo(dayjs().toDate());
    setInactiveScope(null);
    setSelectedSearch("");
    setSelectedItems([]);
    saveTabState(REPORTS_TAB_ID, DEFAULT_REPORTS_TAB_STATE);
  };

  const searchResults = lookupQuery.data?.data ?? [];
  const lookupErrorMessage =
    lookupQuery.error instanceof Error ? lookupQuery.error.message : null;

  return (
    <Stack gap="lg">
      <PageHeader
        title="Relatórios"
        subtitle="Documentos em PDF para conferência, vendas reais, itens parados e listas personalizadas."
        actions={
          <Button variant="subtle" color="gray" onClick={resetView}>
            Restaurar padrão
          </Button>
        }
      />

      <Grid gap="lg">
        <Grid.Col span={{ base: 12, md: 4, lg: 3 }}>
          <div className="surface-panel vt-report-nav" style={{ overflow: "hidden" }}>
            {REPORT_TYPES.map((report) => (
              <button
                key={report.value}
                type="button"
                className="settings-item"
                data-active={activeSection === report.value || undefined}
                onClick={() => setActiveSection(report.value)}
              >
                <span className="settings-item-icon">
                  <report.icon size={18} stroke={1.5} />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <Text size="sm" fw={600}>
                    {report.label}
                  </Text>
                  <Text size="xs" c="dimmed" truncate>
                    {report.hint}
                  </Text>
                </span>
              </button>
            ))}
          </div>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 8, lg: 9 }}>
      <Tabs
        value={activeSection}
        onChange={(value) =>
          setActiveSection(
            (value as ReportsTabState["activeSection"]) || "estoque",
          )
        }
      >
        <Tabs.Panel value="estoque">
          <Suspense fallback={<ReportSectionFallback />}>
            <ReportsStockSection
              onGenerate={() => stockReportMutation.mutate()}
              loading={stockReportMutation.isPending}
              failed={stockReportMutation.isError}
            />
          </Suspense>
        </Tabs.Panel>

        <Tabs.Panel value="selecionados">
          <Suspense fallback={<ReportSectionFallback />}>
            <ReportsSelectedItemsSection
              selectedItems={selectedItems}
              selectedIds={selectedIds}
              selectedSearch={selectedSearch}
              setSelectedSearch={setSelectedSearch}
              searchResults={searchResults}
              loadingSearch={
                lookupQuery.isFetching &&
                debouncedSelectedSearch.trim().length >= 2
              }
              lookupErrorMessage={lookupErrorMessage}
              addSelectedItem={addSelectedItem}
              removeSelectedItem={removeSelectedItem}
              moveSelectedItem={moveSelectedItem}
              clearSelectedItems={clearSelectedItems}
              locationLabel={(inv) =>
                locationLabel(inv as Record<number, number>, locations)
              }
              loadingGenerate={selectedStockReportMutation.isPending}
              failed={selectedStockReportMutation.isError}
              generateSelectedReport={() =>
                selectedStockReportMutation.mutate()
              }
            />
          </Suspense>
        </Tabs.Panel>

        <Tabs.Panel value="vendas">
          <Suspense fallback={<ReportSectionFallback />}>
            <ReportsSalesSection
              salesDateFrom={salesDateFrom}
              setSalesDateFrom={setSalesDateFrom}
              salesDateTo={salesDateTo}
              setSalesDateTo={setSalesDateTo}
              salesScope={salesScope === null ? "AMBOS" : String(salesScope)}
              setSalesScope={(val) =>
                setSalesScope(val === "AMBOS" ? null : Number(val))
              }
              scopeOptions={[
                { value: "AMBOS", label: "Todas as filiais" },
                ...locations.map((loc) => ({
                  value: String(loc.id),
                  label: loc.label || loc.name,
                })),
              ]}
              loading={salesReportMutation.isPending}
              failed={salesReportMutation.isError}
              onGenerate={() => salesReportMutation.mutate()}
            />
          </Suspense>
        </Tabs.Panel>

        <Tabs.Panel value="parados">
          <Suspense fallback={<ReportSectionFallback />}>
            <ReportsInactiveSection
              inactiveDays={inactiveDays}
              setInactiveDays={setInactiveDays}
              inactiveDateTo={inactiveDateTo}
              setInactiveDateTo={setInactiveDateTo}
              inactiveScope={
                inactiveScope === null ? "AMBOS" : String(inactiveScope)
              }
              setInactiveScope={(val) =>
                setInactiveScope(val === "AMBOS" ? null : Number(val))
              }
              scopeOptions={[
                { value: "AMBOS", label: "Todas as filiais" },
                ...locations.map((loc) => ({
                  value: String(loc.id),
                  label: loc.label || loc.name,
                })),
              ]}
              loading={inactiveReportMutation.isPending}
              failed={inactiveReportMutation.isError}
              onGenerate={() => inactiveReportMutation.mutate()}
            />
          </Suspense>
        </Tabs.Panel>

        <Tabs.Panel value="analises">
          <Suspense fallback={<ReportSectionFallback />}>
            {activeSection === "analises" ? <ReportsAnalysisSection /> : null}
          </Suspense>
        </Tabs.Panel>
      </Tabs>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}
