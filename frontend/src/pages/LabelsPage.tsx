import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Button,
  Group,
  Loader,
  NumberInput,
  SegmentedControl,
  Stack,
  Text,
} from "@mantine/core";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { IconBarcode, IconPrinter, IconTruckDelivery } from "@tabler/icons-react";

const NfeLabelDesignerPanel = lazy(
  () => import("../components/labels/NfeLabelDesignerPanel"),
);
import LabelsInternalSection from "../components/labels/LabelsInternalSection";
import PageHeader from "../components/ui/PageHeader";
import type { Product, ProductStatusFilter, SuccessResponse } from "../lib/api";
import { api } from "../lib/apiClient";
import {
  buildLabelsPrintHtml,
  type LabelPrintableItem,
} from "../lib/labelsPrint";
import { notifyError, notifySuccess } from "../lib/notify";
import { printHtml } from "../lib/printHtml";
import { loadTabState, saveTabState } from "../state/tabStateCache";

type StockFilter = "COM_ESTOQUE" | "TODOS" | "SEM_ESTOQUE";
type CopiesMode = "ONE" | "TOTAL_STOCK" | "MANUAL";
type LabelMode = "INTERNAL" | "NFE";

const COPIES_MODE_OPTIONS: { value: CopiesMode; label: string }[] = [
  { value: "ONE", label: "1 por item" },
  { value: "TOTAL_STOCK", label: "= estoque" },
  { value: "MANUAL", label: "Manual" },
];

const LABELS_TAB_ID = "labels";

// Kept across tab switches and reloads, like the other pages.
type LabelsTabState = {
  labelMode: LabelMode;
  query: string;
  status: ProductStatusFilter;
  stockFilter: StockFilter;
  page: number;
  pageSize: string;
  selectedIds: number[];
  copiesMode: CopiesMode;
  defaultManualCopies: number;
  manualCopiesById: Record<number, number>;
};

const MAX_COPIES_PER_ITEM = 500;
const MAX_LABELS_PER_PRINT = 2000;

function parseIdsParam(raw: string | null): number[] {
  if (!raw) return [];
  const values = raw
    .split(",")
    .map((value) => Number.parseInt(value.trim(), 10))
    .filter((value) => Number.isFinite(value) && value > 0);
  return Array.from(new Set(values));
}


function printLabels(items: LabelPrintableItem[]) {
  printHtml(buildLabelsPrintHtml(items));
}

export default function LabelsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const preselectedFromUrl = useMemo(
    () => parseIdsParam(searchParams.get("ids")),
    [searchParams],
  );

  const persisted = useMemo(
    () => loadTabState<LabelsTabState>(LABELS_TAB_ID),
    [],
  );
  // "?ids=" (label shortcut from a product) wins over the saved selection and
  // view; a single product is shown on its own via the "#id" search.
  const fromUrl = preselectedFromUrl.length > 0;
  const singleFromUrl =
    preselectedFromUrl.length === 1 ? preselectedFromUrl[0] : null;
  const saved = fromUrl ? null : persisted;

  const [labelMode, setLabelMode] = useState<LabelMode>(
    fromUrl ? "INTERNAL" : (persisted?.labelMode ?? "INTERNAL"),
  );
  const [query, setQuery] = useState(
    singleFromUrl ? `#${singleFromUrl}` : (saved?.query ?? ""),
  );
  const [status, setStatus] = useState<ProductStatusFilter>(
    saved?.status ?? "ATIVO",
  );
  const [stockFilter, setStockFilter] = useState<StockFilter>(
    singleFromUrl ? "TODOS" : (saved?.stockFilter ?? "COM_ESTOQUE"),
  );
  const [page, setPage] = useState(saved?.page ?? 1);
  const [pageSize, setPageSize] = useState(persisted?.pageSize ?? "20");
  const [selectedIds, setSelectedIds] = useState<number[]>(
    fromUrl ? preselectedFromUrl : (persisted?.selectedIds ?? []),
  );
  const [printing, setPrinting] = useState(false);
  const [copiesMode, setCopiesMode] = useState<CopiesMode>(
    persisted?.copiesMode ?? "ONE",
  );
  const [defaultManualCopies, setDefaultManualCopies] = useState(
    persisted?.defaultManualCopies ?? 1,
  );
  const [manualCopiesById, setManualCopiesById] = useState<
    Record<number, number>
  >(persisted?.manualCopiesById ?? {});

  useEffect(() => {
    saveTabState<LabelsTabState>(LABELS_TAB_ID, {
      labelMode,
      query,
      status,
      stockFilter,
      page,
      pageSize,
      selectedIds,
      copiesMode,
      defaultManualCopies,
      manualCopiesById,
    });
  }, [
    copiesMode,
    defaultManualCopies,
    labelMode,
    manualCopiesById,
    page,
    pageSize,
    query,
    selectedIds,
    status,
    stockFilter,
  ]);

  const listQuery = useQuery<SuccessResponse<Product[]>>({
    queryKey: ["labels-products", query, status, stockFilter, page, pageSize],
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
    enabled: labelMode === "INTERNAL",
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const rows = useMemo(
    () => listQuery.data?.data ?? [],
    [listQuery.data?.data],
  );
  const totalPages = Math.max(listQuery.data?.meta?.total_pages ?? 1, 1);

  useEffect(() => {
    if (preselectedFromUrl.length === 0) return;
    const next = new URLSearchParams(searchParams);
    next.delete("ids");
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
  }, [preselectedFromUrl, searchParams, setSearchParams]);

  const visibleIds = useMemo(() => rows.map((row) => row.id), [rows]);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedVisibleCount = useMemo(
    () => visibleIds.filter((id) => selectedSet.has(id)).length,
    [visibleIds, selectedSet],
  );
  const allVisibleSelected =
    visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;

  const selectedProducts = useMemo(() => {
    return rows.filter((product) => selectedSet.has(product.id));
  }, [rows, selectedSet]);

  const resolveManualCopies = (productId: number): number => {
    const value = manualCopiesById[productId] ?? defaultManualCopies;
    const rounded = Math.round(Number(value || 1));
    if (!Number.isFinite(rounded)) return 1;
    return Math.max(1, Math.min(MAX_COPIES_PER_ITEM, rounded));
  };

  const resolveCopies = (product: LabelPrintableItem): number => {
    if (copiesMode === "ONE") return 1;
    if (copiesMode === "TOTAL_STOCK")
      return Math.max(0, Math.floor(Number(product.total_stock || 0)));
    return resolveManualCopies(product.id);
  };

  const buildPrintBatch = (items: LabelPrintableItem[]) => {
    const expanded: LabelPrintableItem[] = [];
    let skipped = 0;
    let capped = 0;

    for (const item of items) {
      const rawCopies = resolveCopies(item);
      if (rawCopies <= 0) {
        skipped += 1;
        continue;
      }
      const copies = Math.min(rawCopies, MAX_COPIES_PER_ITEM);
      if (copies < rawCopies) capped += 1;

      for (let index = 0; index < copies; index += 1) {
        if (expanded.length >= MAX_LABELS_PER_PRINT) {
          return { expanded, skipped, capped, limited: true };
        }
        expanded.push(item);
      }
    }

    return { expanded, skipped, capped, limited: false };
  };

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

  const setManualCopies = (productId: number, value: number) => {
    const next = Math.max(
      1,
      Math.min(MAX_COPIES_PER_ITEM, Math.round(Number(value || 1))),
    );
    setManualCopiesById((current) => ({ ...current, [productId]: next }));
  };

  const runPrintSelected = async () => {
    if (selectedIds.length === 0) {
      notifyError(new Error("Selecione ao menos um item para gerar etiqueta."));
      return;
    }
    setPrinting(true);
    try {
      const byId = new Map<number, LabelPrintableItem>();
      selectedProducts.forEach((product) => byId.set(product.id, product));

      const missingIds = selectedIds.filter((id) => !byId.has(id));
      if (missingIds.length > 0) {
        const fetched = await Promise.allSettled(
          missingIds.map((id) => api.getProduct(id)),
        );
        const failed: number[] = [];
        fetched.forEach((result, index) => {
          if (result.status === "fulfilled") {
            byId.set(result.value.data.id, result.value.data);
          } else {
            failed.push(missingIds[index]);
          }
        });
        if (failed.length > 0) {
          notifyError(
            new Error(
              `Não foi possível carregar ${failed.length} item(ns) selecionado(s).`,
            ),
          );
        }
      }

      const items = Array.from(byId.values());
      if (items.length === 0) {
        notifyError(new Error("Nenhum item válido para impressão."));
        return;
      }

      const batch = buildPrintBatch(items);
      if (batch.expanded.length === 0) {
        notifyError(
          new Error(
            "Nenhuma etiqueta para imprimir. Verifique o modo de cópias.",
          ),
        );
        return;
      }
      if (batch.limited) {
        notifyError(
          new Error(
            `Limite de ${MAX_LABELS_PER_PRINT} etiquetas por impressão atingido.`,
          ),
        );
      } else if (batch.skipped > 0 || batch.capped > 0) {
        notifySuccess(
          `Impressão preparada: ${batch.expanded.length} etiqueta(s). Ignorados: ${batch.skipped}. Ajustados no limite: ${batch.capped}.`,
        );
      }
      printLabels(batch.expanded);
    } finally {
      setPrinting(false);
    }
  };

  const runPrintSingle = (product: Product) => {
    const batch = buildPrintBatch([product]);
    if (batch.expanded.length === 0) {
      notifyError(
        new Error("Este item não gerou etiquetas no modo atual de cópias."),
      );
      return;
    }
    printLabels(batch.expanded);
  };

  return (
    <Stack gap="lg">
      <PageHeader
        title="Etiquetas"
        subtitle={
          labelMode === "INTERNAL"
            ? "Etiquetas de estoque com código de barras, por item ou em lote."
            : "Etiqueta de expedição montada a partir do XML da NF-e."
        }
      />

      <SegmentedControl
        className="vt-mode-switch"
        value={labelMode}
        onChange={(value) => setLabelMode((value as LabelMode) || "INTERNAL")}
        data={[
          {
            value: "INTERNAL",
            label: (
              <Group gap={8} wrap="nowrap">
                <IconBarcode size={16} stroke={1.6} />
                <span>Estoque</span>
              </Group>
            ),
          },
          {
            value: "NFE",
            label: (
              <Group gap={8} wrap="nowrap">
                <IconTruckDelivery size={16} stroke={1.6} />
                <span>Expedição (NF-e)</span>
              </Group>
            ),
          },
        ]}
      />

      {labelMode === "INTERNAL" ? (
        <>
          <LabelsInternalSection
            query={query}
            setQuery={setQuery}
            status={status}
            setStatus={setStatus}
            stockFilter={stockFilter}
            setStockFilter={setStockFilter}
            page={page}
            setPage={setPage}
            pageSize={pageSize}
            setPageSize={setPageSize}
            copiesMode={copiesMode}
            setCopiesMode={setCopiesMode}
            defaultManualCopies={defaultManualCopies}
            setDefaultManualCopies={setDefaultManualCopies}
            setSelectedIds={setSelectedIds}
            setManualCopiesById={setManualCopiesById}
            rows={rows}
            totalPages={totalPages}
            selectedSet={selectedSet}
            allVisibleSelected={allVisibleSelected}
            selectedVisibleCount={selectedVisibleCount}
            listQuery={listQuery}
            toggleSelectAllVisible={toggleSelectAllVisible}
            toggleRow={toggleRow}
            resolveManualCopies={resolveManualCopies}
            resolveCopies={resolveCopies}
            setManualCopies={setManualCopies}
            runPrintSingle={runPrintSingle}
          />

          {selectedIds.length > 0 && (
            <div className="selection-bar">
              <Group gap="sm" wrap="nowrap">
                <Text size="sm" fw={600} className="num">
                  {selectedIds.length}{" "}
                  {selectedIds.length === 1 ? "selecionado" : "selecionados"}
                </Text>
                <Button
                  variant="subtle"
                  color="gray"
                  size="xs"
                  onClick={() => setSelectedIds([])}
                >
                  Limpar
                </Button>
              </Group>
              <Group gap="sm" wrap="wrap" justify="flex-end">
                <Text size="xs" c="dimmed">
                  Cópias
                </Text>
                <SegmentedControl
                  size="xs"
                  value={copiesMode}
                  onChange={(value) =>
                    setCopiesMode((value as CopiesMode) || "ONE")
                  }
                  data={COPIES_MODE_OPTIONS}
                />
                {copiesMode === "MANUAL" && (
                  <NumberInput
                    size="xs"
                    aria-label="Cópias padrão"
                    prefix="×"
                    value={defaultManualCopies}
                    min={1}
                    max={MAX_COPIES_PER_ITEM}
                    onChange={(value) =>
                      setDefaultManualCopies(
                        Math.max(
                          1,
                          Math.min(
                            MAX_COPIES_PER_ITEM,
                            Math.round(Number(value || 1)),
                          ),
                        ),
                      )
                    }
                    w={80}
                  />
                )}
                <Button
                  leftSection={<IconPrinter size={16} />}
                  onClick={() => void runPrintSelected()}
                  loading={printing}
                >
                  Imprimir etiquetas
                </Button>
              </Group>
            </div>
          )}
        </>
      ) : (
        <Suspense
          fallback={
            <Group justify="center" py="xl">
              <Loader size="sm" />
            </Group>
          }
        >
          <NfeLabelDesignerPanel />
        </Suspense>
      )}
    </Stack>
  );
}
