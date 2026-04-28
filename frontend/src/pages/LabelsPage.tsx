import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Badge,
  Button,
  Group,
  Stack,
  Text,
  Loader,
  SegmentedControl,
} from "@mantine/core";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { IconPrinter } from "@tabler/icons-react";

const NfeLabelDesignerPanel = lazy(() => import("../components/labels/NfeLabelDesignerPanel"));
import LabelsInternalSection from "../components/labels/LabelsInternalSection";
import FilterToolbar from "../components/ui/FilterToolbar";
import PageHeader from "../components/ui/PageHeader";
import type { Product, ProductStatusFilter, SuccessResponse } from "../lib/api";
import { api } from "../lib/apiClient";
import { buildLabelsPrintHtml, type LabelPrintableItem } from "../lib/labelsPrint";
import { notifyError, notifySuccess } from "../lib/notify";

const STOCK_FILTER_VALUES = ["COM_ESTOQUE", "TODOS", "SEM_ESTOQUE"] as const;
type StockFilter = (typeof STOCK_FILTER_VALUES)[number];
type CopiesMode = "ONE" | "TOTAL_STOCK" | "MANUAL";
type LabelMode = "INTERNAL" | "NFE";

const COPIES_MODE_OPTIONS: { value: CopiesMode; label: string }[] = [
  { value: "ONE", label: "1 por item" },
  { value: "TOTAL_STOCK", label: "Igual estoque total" },
  { value: "MANUAL", label: "Manual por item" },
];

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

function printHtml(html: string) {
  if (typeof document === "undefined" || typeof window === "undefined") return;
  const frame = document.createElement("iframe");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  frame.style.visibility = "hidden";

  const cleanup = () => {
    window.setTimeout(() => {
      if (frame.parentNode) frame.parentNode.removeChild(frame);
    }, 500);
  };

  frame.onload = () => {
    const frameWindow = frame.contentWindow;
    if (!frameWindow) {
      cleanup();
      return;
    }
    frameWindow.focus();
    frameWindow.print();
    cleanup();
  };

  document.body.appendChild(frame);
  if (!frame.contentDocument) {
    cleanup();
    return;
  }
  frame.contentDocument.open();
  frame.contentDocument.write(html);
  frame.contentDocument.close();
}

function printLabels(items: LabelPrintableItem[]) {
  printHtml(buildLabelsPrintHtml(items));
}

export default function LabelsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const preselectedFromUrl = useMemo(() => parseIdsParam(searchParams.get("ids")), [searchParams]);

  const [labelMode, setLabelMode] = useState<LabelMode>("INTERNAL");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<ProductStatusFilter>("ATIVO");
  const [stockFilter, setStockFilter] = useState<StockFilter>("COM_ESTOQUE");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState("20");
  const [selectedIds, setSelectedIds] = useState<number[]>(preselectedFromUrl);
  const [printing, setPrinting] = useState(false);
  const [copiesMode, setCopiesMode] = useState<CopiesMode>("ONE");
  const [defaultManualCopies, setDefaultManualCopies] = useState(1);
  const [manualCopiesById, setManualCopiesById] = useState<Record<number, number>>({});

  const listQuery = useQuery<SuccessResponse<Product[]>>({
    queryKey: ["labels-products", query, status, stockFilter, page, pageSize],
    queryFn: ({ signal }) =>
      api.listProductsStatus(
        {
          query: query.trim() || undefined,
          status,
          has_stock: stockFilter === "TODOS" ? undefined : stockFilter === "COM_ESTOQUE",
          page,
          page_size: Number(pageSize),
          sort: "nome",
        },
        { signal }
      ),
    enabled: labelMode === "INTERNAL",
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const rows = useMemo(() => listQuery.data?.data ?? [], [listQuery.data?.data]);
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
    [visibleIds, selectedSet]
  );
  const allVisibleSelected = visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;

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
    if (copiesMode === "TOTAL_STOCK") return Math.max(0, Math.floor(Number(product.total_stock || 0)));
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
    const next = Math.max(1, Math.min(MAX_COPIES_PER_ITEM, Math.round(Number(value || 1))));
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
        const fetched = await Promise.allSettled(missingIds.map((id) => api.getProduct(id)));
        const failed: number[] = [];
        fetched.forEach((result, index) => {
          if (result.status === "fulfilled") {
            byId.set(result.value.data.id, result.value.data);
          } else {
            failed.push(missingIds[index]);
          }
        });
        if (failed.length > 0) {
          notifyError(new Error(`Nao foi possivel carregar ${failed.length} item(ns) selecionado(s).`));
        }
      }

      const items = Array.from(byId.values());
      if (items.length === 0) {
        notifyError(new Error("Nenhum item valido para impressao."));
        return;
      }

      const batch = buildPrintBatch(items);
      if (batch.expanded.length === 0) {
        notifyError(new Error("Nenhuma etiqueta para imprimir. Verifique o modo de copias."));
        return;
      }
      if (batch.limited) {
        notifyError(new Error(`Limite de ${MAX_LABELS_PER_PRINT} etiquetas por impressao atingido.`));
      } else if (batch.skipped > 0 || batch.capped > 0) {
        notifySuccess(
          `Impressao preparada: ${batch.expanded.length} etiqueta(s). Ignorados: ${batch.skipped}. Ajustados no limite: ${batch.capped}.`
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
      notifyError(new Error("Este item nao gerou etiquetas no modo atual de copias."));
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
            ? "Gere etiquetas de estoque por item ou em lote."
            : "Editor visual de etiqueta de expedicao (arraste e solte)."
        }
        actions={
          labelMode === "INTERNAL" ? (
            <>
              <Badge variant="light">Selecionados: {selectedIds.length}</Badge>
              <Badge variant="light">Modo: {COPIES_MODE_OPTIONS.find((item) => item.value === copiesMode)?.label}</Badge>
              <Button
                leftSection={<IconPrinter size={16} />}
                onClick={() => void runPrintSelected()}
                disabled={selectedIds.length === 0}
                loading={printing}
              >
                Gerar etiquetas selecionadas
              </Button>
            </>
          ) : (
            <Badge variant="light">Designer visual ativo</Badge>
          )
        }
      />

      <FilterToolbar>
        <Group justify="space-between" wrap="wrap">
          <SegmentedControl
            value={labelMode}
            onChange={(value) => setLabelMode((value as LabelMode) || "INTERNAL")}
            data={[
              { value: "INTERNAL", label: "Etiqueta de estoque" },
              { value: "NFE", label: "Etiqueta de expedicao (designer)" },
            ]}
          />
          {labelMode === "NFE" && (
            <Text size="xs" c="dimmed">
              Fluxo: carregar XML, montar layout visual e imprimir.
            </Text>
          )}
        </Group>
      </FilterToolbar>

      {labelMode === "INTERNAL" ? (
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
