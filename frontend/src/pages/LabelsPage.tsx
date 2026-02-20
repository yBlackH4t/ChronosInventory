import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ActionIcon,
  Badge,
  Button,
  Checkbox,
  Group,
  NumberInput,
  Pagination,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { IconBarcode, IconPrinter } from "@tabler/icons-react";

import DataTable from "../components/ui/DataTable";
import EmptyState from "../components/ui/EmptyState";
import FilterToolbar from "../components/ui/FilterToolbar";
import PageHeader from "../components/ui/PageHeader";
import type { Product, ProductStatusFilter, SuccessResponse } from "../lib/api";
import { ApiError } from "../lib/api";
import { api } from "../lib/apiClient";
import { buildLabelsPrintHtml, type LabelPrintableItem } from "../lib/labelsPrint";
import { notifyError, notifySuccess } from "../lib/notify";

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
  if (typeof document === "undefined" || typeof window === "undefined") return;
  const html = buildLabelsPrintHtml(items);

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

export default function LabelsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const preselectedFromUrl = useMemo(() => parseIdsParam(searchParams.get("ids")), [searchParams]);

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

  const loadError =
    listQuery.error instanceof ApiError
      ? listQuery.error.message
      : listQuery.error instanceof Error
        ? listQuery.error.message
        : "Falha ao carregar itens para etiquetas.";

  return (
    <Stack gap="lg">
      <PageHeader
        title="Etiquetas"
        subtitle="Gere etiquetas por item ou em lote. O codigo de barras e vinculado ao ID do item no banco."
        actions={(
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
        )}
      />

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
    </Stack>
  );
}
