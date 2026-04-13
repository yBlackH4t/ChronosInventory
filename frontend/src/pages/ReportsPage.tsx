import { useEffect, useMemo, useState } from "react";
import type { DragEvent } from "react";
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  NumberInput,
  ScrollArea,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { useDebouncedValue } from "@mantine/hooks";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { IconGripVertical, IconPlus, IconTrash } from "@tabler/icons-react";
import dayjs from "dayjs";

import { api } from "../lib/apiClient";
import PageHeader from "../components/ui/PageHeader";
import { downloadBlob } from "../lib/download";
import { loadTabState, saveTabState } from "../state/tabStateCache";
import type { DownloadResponse, Product, SuccessResponse } from "../lib/api";
import { notifyError, notifySuccess } from "../lib/notify";

type SelectedReportProduct = Pick<Product, "id" | "nome" | "qtd_canoas" | "qtd_pf" | "total_stock">;

type ReportsTabState = {
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
  const [draggedItemId, setDraggedItemId] = useState<number | null>(null);
  const [dragOverItemId, setDragOverItemId] = useState<number | null>(null);
  const [debouncedSelectedSearch] = useDebouncedValue(selectedSearch, 300);

  useEffect(() => {
    saveTabState<ReportsTabState>(REPORTS_TAB_ID, {
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

  const moveSelectedItem = (draggedId: number, targetId: number) => {
    if (draggedId === targetId) return;
    setSelectedItems((current) => {
      const fromIndex = current.findIndex((item) => item.id === draggedId);
      const toIndex = current.findIndex((item) => item.id === targetId);
      if (fromIndex < 0 || toIndex < 0) return current;

      const next = [...current];
      const [moved] = next.splice(fromIndex, 1);
      const insertIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
      next.splice(insertIndex, 0, moved);
      return next;
    });
  };

  const handleDragStart = (event: DragEvent<HTMLElement>, itemId: number) => {
    setDraggedItemId(itemId);
    setDragOverItemId(itemId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(itemId));
  };

  const handleDragOver = (event: DragEvent<HTMLElement>, itemId: number) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (dragOverItemId !== itemId) {
      setDragOverItemId(itemId);
    }
  };

  const handleDrop = (event: DragEvent<HTMLElement>, itemId: number) => {
    event.preventDefault();
    const transferredId = Number(event.dataTransfer.getData("text/plain"));
    const sourceId = Number.isFinite(transferredId) && transferredId > 0 ? transferredId : draggedItemId;
    if (sourceId) {
      moveSelectedItem(sourceId, itemId);
    }
    setDraggedItemId(null);
    setDragOverItemId(null);
  };

  const handleDragEnd = () => {
    setDraggedItemId(null);
    setDragOverItemId(null);
  };

  const resetView = () => {
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

      <Card withBorder>
        <Stack gap="md">
          <Group justify="space-between">
            <Text fw={600}>Relatorio de estoque</Text>
            <Badge variant="outline" color="gray">
              PDF
            </Badge>
          </Group>
          <Text size="sm" c="dimmed">
            Lista os itens ativos com saldo atual por local. Ideal para conferencia rapida do estoque visivel no sistema.
          </Text>
          <Button
            onClick={() => stockReportMutation.mutate()}
            loading={stockReportMutation.isPending}
          >
            Gerar relatorio de estoque
          </Button>
        </Stack>
      </Card>

      <Card withBorder>
        <Stack gap="md">
          <Group justify="space-between" align="flex-start">
            <Stack gap={4}>
              <Text fw={600}>Relatorio de itens selecionados</Text>
              <Text size="sm" c="dimmed">
                Busque os itens, selecione os desejados e gere um PDF mostrando quantidade em Canoas, PF, total e onde tem saldo.
              </Text>
            </Stack>
            <Badge variant="outline" color="grape">
              Selecionados: {selectedItems.length}
            </Badge>
          </Group>

          <TextInput
            label="Buscar item"
            placeholder="Digite codigo ou nome da peca"
            value={selectedSearch}
            onChange={(event) => setSelectedSearch(event.currentTarget.value)}
          />

          <Card withBorder radius="md" p="sm">
            <Stack gap="xs">
              <Group justify="space-between">
                <Text fw={500}>Resultados da busca</Text>
                {lookupQuery.isFetching && debouncedSelectedSearch.trim().length >= 2 ? <Loader size="xs" /> : null}
              </Group>

              {selectedSearch.trim().length < 2 ? (
                <Text size="sm" c="dimmed">
                  Digite ao menos 2 letras para localizar produtos e adicionar ao relatorio.
                </Text>
              ) : lookupErrorMessage ? (
                <Text size="sm" c="red">
                  Falha ao buscar produtos: {lookupErrorMessage}
                </Text>
              ) : searchResults.length === 0 ? (
                <Text size="sm" c="dimmed">
                  Nenhum item encontrado para essa busca.
                </Text>
              ) : (
                <ScrollArea.Autosize mah={240} offsetScrollbars>
                  <Table striped highlightOnHover withTableBorder>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>ID</Table.Th>
                        <Table.Th>Produto</Table.Th>
                        <Table.Th>Canoas</Table.Th>
                        <Table.Th>PF</Table.Th>
                        <Table.Th>Total</Table.Th>
                        <Table.Th>Acoes</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {searchResults.map((product) => {
                        const alreadySelected = selectedIds.has(product.id);
                        return (
                          <Table.Tr key={product.id}>
                            <Table.Td>{product.id}</Table.Td>
                            <Table.Td>{product.nome}</Table.Td>
                            <Table.Td>{product.qtd_canoas}</Table.Td>
                            <Table.Td>{product.qtd_pf}</Table.Td>
                            <Table.Td>{product.total_stock}</Table.Td>
                            <Table.Td>
                              <Button
                                size="xs"
                                variant={alreadySelected ? "light" : "filled"}
                                leftSection={<IconPlus size={14} />}
                                disabled={alreadySelected}
                                onClick={() => addSelectedItem(product)}
                              >
                                {alreadySelected ? "Selecionado" : "Selecionar"}
                              </Button>
                            </Table.Td>
                          </Table.Tr>
                        );
                      })}
                    </Table.Tbody>
                  </Table>
                </ScrollArea.Autosize>
              )}
            </Stack>
          </Card>

          <Card withBorder radius="md" p="sm">
            <Stack gap="xs">
              <Group justify="space-between">
                <Text fw={500}>Itens escolhidos para o relatorio</Text>
                <Button
                  variant="subtle"
                  size="xs"
                  onClick={() => setSelectedItems([])}
                  disabled={selectedItems.length === 0}
                >
                  Limpar selecionados
                </Button>
              </Group>
              <Text size="sm" c="dimmed">
                Segure o icone de arrastar e solte mais acima ou mais abaixo para definir a ordem do PDF.
              </Text>

              {selectedItems.length === 0 ? (
                <Text size="sm" c="dimmed">
                  Nenhum item selecionado ainda. Busque acima e clique em Selecionar.
                </Text>
              ) : (
                <ScrollArea.Autosize mah={260} offsetScrollbars>
                  <Table striped highlightOnHover withTableBorder>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th></Table.Th>
                        <Table.Th>ID</Table.Th>
                        <Table.Th>Produto</Table.Th>
                        <Table.Th>Canoas</Table.Th>
                        <Table.Th>PF</Table.Th>
                        <Table.Th>Total</Table.Th>
                        <Table.Th>Onde tem</Table.Th>
                        <Table.Th>Acoes</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {selectedItems.map((item) => (
                        <Table.Tr
                          key={item.id}
                          onDragOver={(event) => handleDragOver(event, item.id)}
                          onDrop={(event) => handleDrop(event, item.id)}
                          style={{
                            opacity: draggedItemId === item.id ? 0.45 : 1,
                            borderTop:
                              dragOverItemId === item.id && draggedItemId !== item.id
                                ? "2px solid var(--mantine-color-blue-5)"
                                : undefined,
                          }}
                        >
                          <Table.Td>
                            <span
                              draggable
                              onDragStart={(event) => handleDragStart(event, item.id)}
                              onDragEnd={handleDragEnd}
                              style={{ display: "inline-flex", cursor: "grab", userSelect: "none" }}
                            >
                              <ActionIcon
                                variant="subtle"
                                color="gray"
                                aria-label={`Arrastar ${item.nome}`}
                                style={{ cursor: "grab" }}
                              >
                                <IconGripVertical size={16} />
                              </ActionIcon>
                            </span>
                          </Table.Td>
                          <Table.Td>{item.id}</Table.Td>
                          <Table.Td>{item.nome}</Table.Td>
                          <Table.Td>{item.qtd_canoas}</Table.Td>
                          <Table.Td>{item.qtd_pf}</Table.Td>
                          <Table.Td>{item.total_stock}</Table.Td>
                          <Table.Td>{locationLabel(item.qtd_canoas, item.qtd_pf)}</Table.Td>
                          <Table.Td>
                            <ActionIcon
                              color="red"
                              variant="light"
                              onClick={() => removeSelectedItem(item.id)}
                              aria-label={`Remover ${item.nome}`}
                            >
                              <IconTrash size={16} />
                            </ActionIcon>
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </ScrollArea.Autosize>
              )}
            </Stack>
          </Card>

          <Group justify="space-between" align="center">
            <Text size="sm" c="dimmed">
              O PDF final sempre usa os saldos atuais do sistema no momento da geracao.
            </Text>
            <Button
              onClick={() => selectedStockReportMutation.mutate()}
              loading={selectedStockReportMutation.isPending}
              disabled={selectedItems.length === 0}
            >
              Gerar relatorio dos selecionados
            </Button>
          </Group>
        </Stack>
      </Card>

      <Card withBorder>
        <Stack gap="md">
          <Group justify="space-between">
            <Text fw={600}>Relatorio de vendas reais</Text>
            <Badge variant="outline" color="blue">
              SAIDA + OPERACAO_NORMAL
            </Badge>
          </Group>
          <Text size="sm" c="dimmed">
            Mostra apenas vendas reais. Transferencia externa, ajuste e devolucao ficam fora deste documento.
          </Text>
          <Group align="end" wrap="wrap">
            <DatePickerInput
              label="De"
              value={salesDateFrom}
              onChange={(value) => setSalesDateFrom(value as Date | null)}
              w={180}
            />
            <DatePickerInput
              label="Ate"
              value={salesDateTo}
              onChange={(value) => setSalesDateTo(value as Date | null)}
              w={180}
            />
            <Select
              label="Escopo"
              data={SCOPE_OPTIONS.map((item) => ({ value: item.value, label: item.label }))}
              value={salesScope}
              onChange={(value) => setSalesScope((value as "AMBOS" | "CANOAS" | "PF") || "AMBOS")}
              allowDeselect={false}
              w={180}
            />
            <Button
              onClick={() => salesReportMutation.mutate()}
              loading={salesReportMutation.isPending}
              disabled={!salesDateFrom || !salesDateTo}
            >
              Gerar relatorio de vendas
            </Button>
          </Group>
        </Stack>
      </Card>

      <Card withBorder>
        <Stack gap="md">
          <Group justify="space-between">
            <Text fw={600}>Relatorio de estoque parado</Text>
            <Badge variant="outline" color="orange">
              Sem giro
            </Badge>
          </Group>
          <Text size="sm" c="dimmed">
            Mostra itens ativos com estoque atual e sem movimentacao no periodo definido. Bom para revisao de itens encalhados.
          </Text>
          <Group align="end" wrap="wrap">
            <NumberInput
              label="Dias sem movimentacao"
              min={1}
              max={365}
              value={inactiveDays}
              onChange={(value) => setInactiveDays(Number(value || 30))}
              w={180}
            />
            <DatePickerInput
              label="Data base"
              value={inactiveDateTo}
              onChange={(value) => setInactiveDateTo(value as Date | null)}
              w={180}
            />
            <Select
              label="Escopo"
              data={SCOPE_OPTIONS.map((item) => ({ value: item.value, label: item.label }))}
              value={inactiveScope}
              onChange={(value) => setInactiveScope((value as "AMBOS" | "CANOAS" | "PF") || "AMBOS")}
              allowDeselect={false}
              w={180}
            />
            <Button
              onClick={() => inactiveReportMutation.mutate()}
              loading={inactiveReportMutation.isPending}
              disabled={!inactiveDateTo}
            >
              Gerar relatorio de estoque parado
            </Button>
          </Group>
        </Stack>
      </Card>
    </Stack>
  );
}
