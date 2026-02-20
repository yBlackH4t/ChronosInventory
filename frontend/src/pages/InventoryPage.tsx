import { useEffect, useMemo, useRef, useState } from "react";
import {
  Badge,
  Button,
  Card,
  Group,
  NumberInput,
  Pagination,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconPrinter } from "@tabler/icons-react";
import dayjs from "dayjs";

import { api } from "../lib/apiClient";
import { buildInventorySheetHtml } from "../lib/inventorySheetTemplate";
import DataTable from "../components/ui/DataTable";
import EmptyState from "../components/ui/EmptyState";
import FilterToolbar from "../components/ui/FilterToolbar";
import PageHeader from "../components/ui/PageHeader";
import type {
  InventoryAdjustmentReason,
  InventoryCountItemIn,
  InventoryCountOut,
  InventorySessionCreateIn,
  InventorySessionOut,
  SuccessResponse,
} from "../lib/api";
import { notifyError, notifySuccess } from "../lib/notify";

const ADJUSTMENT_REASON_OPTIONS: { value: InventoryAdjustmentReason; label: string }[] = [
  { value: "AVARIA", label: "Avaria" },
  { value: "PERDA", label: "Perda" },
  { value: "CORRECAO_INVENTARIO", label: "Correcao inventario" },
  { value: "ERRO_OPERACIONAL", label: "Erro operacional" },
  { value: "TRANSFERENCIA", label: "Transferencia" },
];

type SessionItemEdit = {
  qtd_fisico: number;
  motivo_ajuste?: InventoryAdjustmentReason | null;
  observacao?: string | null;
};

type CollectorResolvedInput =
  | { kind: "product_id"; value: number }
  | { kind: "product_code"; value: string };

type CollectorLogStatus = "OK" | "ERRO";

type CollectorLogItem = {
  id: string;
  at: string;
  input: string;
  status: CollectorLogStatus;
  message: string;
};

export default function InventoryPage() {
  const queryClient = useQueryClient();
  const [sessionName, setSessionName] = useState("");
  const [sessionLocal, setSessionLocal] = useState<"CANOAS" | "PF">("CANOAS");
  const [sessionObservacao, setSessionObservacao] = useState("");
  const [sessionPage, setSessionPage] = useState(1);
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [itemsPage, setItemsPage] = useState(1);
  const [onlyDivergent, setOnlyDivergent] = useState(true);
  const [search, setSearch] = useState("");
  const [edits, setEdits] = useState<Record<number, SessionItemEdit>>({});
  const [collectorInput, setCollectorInput] = useState("");
  const [collectorStep, setCollectorStep] = useState(1);
  const [collectorLoading, setCollectorLoading] = useState(false);
  const [collectorInitializing, setCollectorInitializing] = useState(false);
  const [collectorModeActive, setCollectorModeActive] = useState(false);
  const [collectorSessionId, setCollectorSessionId] = useState<number | null>(null);
  const [collectorLog, setCollectorLog] = useState<CollectorLogItem[]>([]);
  const collectorInputRef = useRef<HTMLInputElement>(null);

  const sessionsQuery = useQuery<SuccessResponse<InventorySessionOut[]>>({
    queryKey: ["inventory-sessions", sessionPage],
    queryFn: ({ signal }) =>
      api.inventoryListSessions({ page: sessionPage, page_size: 20 }, { signal }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const selectedSession = useMemo(
    () => sessionsQuery.data?.data?.find((item) => item.id === selectedSessionId) ?? null,
    [selectedSessionId, sessionsQuery.data?.data]
  );

  useEffect(() => {
    if (!selectedSessionId) {
      setCollectorModeActive(false);
      setCollectorSessionId(null);
      return;
    }
    if (collectorSessionId !== selectedSessionId) {
      setCollectorModeActive(false);
    }
  }, [collectorSessionId, selectedSessionId]);

  useEffect(() => {
    if (!collectorModeActive) return;
    const timer = window.setTimeout(() => {
      collectorInputRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [collectorModeActive]);

  const itemsQuery = useQuery<SuccessResponse<InventoryCountOut[]>>({
    queryKey: ["inventory-session-items", selectedSessionId, itemsPage, onlyDivergent, search],
    queryFn: ({ signal }) =>
      api.inventoryListSessionItems(
        selectedSessionId!,
        {
          page: itemsPage,
          page_size: 50,
          only_divergent: onlyDivergent,
          query: search.trim() || undefined,
        },
        { signal }
      ),
    enabled: !!selectedSessionId,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const createSessionMutation = useMutation<SuccessResponse<InventorySessionOut>, Error, InventorySessionCreateIn>({
    mutationFn: (payload) => api.inventoryCreateSession(payload),
    onSuccess: (response) => {
      notifySuccess("Sessao de inventario criada");
      setSessionName("");
      setSessionObservacao("");
      setSelectedSessionId(response.data.id);
      setItemsPage(1);
      setEdits({});
      queryClient.invalidateQueries({ queryKey: ["inventory-sessions"] });
    },
    onError: (error) => notifyError(error),
  });

  const updateItemsMutation = useMutation<
    SuccessResponse<InventorySessionOut>,
    Error,
    { sessionId: number; items: InventoryCountItemIn[] }
  >({
    mutationFn: ({ sessionId, items }) => api.inventoryUpdateSessionItems(sessionId, { items }),
    onSuccess: () => {
      notifySuccess("Contagens salvas");
      setEdits({});
      queryClient.invalidateQueries({ queryKey: ["inventory-session-items", selectedSessionId] });
      queryClient.invalidateQueries({ queryKey: ["inventory-sessions"] });
    },
    onError: (error) => notifyError(error),
  });

  const applyMutation = useMutation({
    mutationFn: (sessionId: number) => api.inventoryApplySession(sessionId),
    onSuccess: (response) => {
      notifySuccess(`Ajustes aplicados: ${response.data.applied_items} item(ns)`);
      setEdits({});
      queryClient.invalidateQueries({ queryKey: ["inventory-session-items", selectedSessionId] });
      queryClient.invalidateQueries({ queryKey: ["inventory-sessions"] });
    },
    onError: (error) => notifyError(error),
  });

  const normalizeText = (value: string): string => String(value || "").toUpperCase();
  const appendCollectorLog = (entry: Omit<CollectorLogItem, "id" | "at">) => {
    setCollectorLog((current) => [
      {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        at: dayjs().format("HH:mm:ss"),
        ...entry,
      },
      ...current,
    ].slice(0, 12));
  };

  const parseCollectorInput = (rawValue: string): CollectorResolvedInput | null => {
    const value = normalizeText(rawValue).trim();
    if (!value) return null;

    const ciMatch = value.match(/^CI[-\s]?(\d{1,10})$/i);
    if (ciMatch) {
      return {
        kind: "product_id",
        value: Number.parseInt(ciMatch[1], 10),
      };
    }

    const digits = value.replace(/\D/g, "");
    if (!digits) return null;

    if (/^\d+$/.test(value) && digits.length <= 4) {
      return {
        kind: "product_id",
        value: Number.parseInt(digits, 10),
      };
    }

    return {
      kind: "product_code",
      value: digits,
    };
  };

  const resolveCollectorItem = async (
    sessionId: number,
    parsedInput: CollectorResolvedInput
  ): Promise<InventoryCountOut> => {
    const query = parsedInput.kind === "product_id"
      ? String(parsedInput.value)
      : parsedInput.value;
    const response = await api.inventoryListSessionItems(sessionId, {
      page: 1,
      page_size: 50,
      only_divergent: false,
      query,
    });
    const rows = response.data ?? [];

    if (parsedInput.kind === "product_id") {
      const exact = rows.find((item) => item.produto_id === parsedInput.value);
      if (!exact) {
        throw new Error(`Item ${parsedInput.value} nao encontrado nesta sessao.`);
      }
      return exact;
    }

    const normalizedCode = normalizeText(parsedInput.value);
    const byCodeInName = rows.filter((item) => normalizeText(item.produto_nome).includes(normalizedCode));
    if (byCodeInName.length === 1) {
      return byCodeInName[0];
    }
    if (byCodeInName.length > 1) {
      const sample = byCodeInName
        .slice(0, 3)
        .map((item) => `${item.produto_nome} (#${item.produto_id})`)
        .join(" | ");
      throw new Error(`Codigo ambiguo. Matches: ${sample}`);
    }

    throw new Error(`Codigo ${parsedInput.value} nao encontrado nesta sessao.`);
  };

  const onCreateSession = () => {
    createSessionMutation.mutate({
      nome: sessionName.trim(),
      local: sessionLocal,
      observacao: sessionObservacao.trim() || undefined,
    });
  };

  const setItemEdit = (
    produtoId: number,
    patch: Partial<SessionItemEdit>,
    fallback: InventoryCountOut
  ) => {
    setEdits((current) => {
      const base = current[produtoId] ?? {
        qtd_fisico: fallback.qtd_fisico ?? fallback.qtd_sistema,
        motivo_ajuste: fallback.motivo_ajuste ?? null,
        observacao: fallback.observacao ?? "",
      };
      return {
        ...current,
        [produtoId]: {
          ...base,
          ...patch,
        },
      };
    });
  };

  const savePageCounts = () => {
    if (!selectedSessionId) return;
    const payload = Object.entries(edits).map(([produtoId, item]) => ({
      produto_id: Number(produtoId),
      qtd_fisico: Number(item.qtd_fisico ?? 0),
      motivo_ajuste: item.motivo_ajuste ?? undefined,
      observacao: (item.observacao || "").trim() || undefined,
    }));
    if (payload.length === 0) {
      notifyError(new Error("Nenhuma alteracao pendente para salvar."));
      return;
    }
    updateItemsMutation.mutate({ sessionId: selectedSessionId, items: payload });
  };

  const listAllSessionItems = async (sessionId: number): Promise<InventoryCountOut[]> => {
    const pageSize = 200;
    let page = 1;
    let totalPages = 1;
    const collected: InventoryCountOut[] = [];

    while (page <= totalPages) {
      const response = await api.inventoryListSessionItems(sessionId, {
        page,
        page_size: pageSize,
        only_divergent: false,
      });
      collected.push(...(response.data || []));
      totalPages = Math.max(response.meta?.total_pages ?? 1, 1);
      page += 1;
    }

    return collected;
  };

  const initializeCollectorMode = () => {
    if (!selectedSessionId) {
      notifyError(new Error("Abra uma sessao antes de iniciar o modo bip."));
      return;
    }
    if (selectedSession?.status !== "ABERTO") {
      notifyError(new Error("Somente sessoes abertas podem iniciar modo bip."));
      return;
    }

    modals.openConfirmModal({
      title: "Iniciar inventario por bip",
      children: (
        <Text size="sm">
          Essa acao zera o fisico de todos os itens da sessao para 0 e prepara o inventario por leitura.
          Itens nao bipados ficarao como divergencia negativa.
        </Text>
      ),
      labels: { confirm: "Iniciar e zerar fisico", cancel: "Cancelar" },
      confirmProps: { color: "orange" },
      onConfirm: async () => {
        setCollectorInitializing(true);
        try {
          const allItems = await listAllSessionItems(selectedSessionId);
          if (allItems.length === 0) {
            throw new Error("Sessao sem itens para iniciar coletor.");
          }

          const chunkSize = 300;
          for (let index = 0; index < allItems.length; index += chunkSize) {
            const chunk = allItems.slice(index, index + chunkSize);
            await api.inventoryUpdateSessionItems(selectedSessionId, {
              items: chunk.map((item) => ({
                produto_id: item.produto_id,
                qtd_fisico: 0,
              })),
            });
          }

          setCollectorModeActive(true);
          setCollectorSessionId(selectedSessionId);
          setCollectorInput("");
          setCollectorLog([]);
          setEdits({});
          appendCollectorLog({
            input: "init",
            status: "OK",
            message: `Modo bip iniciado. ${allItems.length} item(ns) zerado(s).`,
          });
          notifySuccess("Modo bip iniciado. Agora e so bipar os itens.");
          void queryClient.invalidateQueries({ queryKey: ["inventory-session-items", selectedSessionId] });
          void queryClient.invalidateQueries({ queryKey: ["inventory-sessions"] });
          window.setTimeout(() => collectorInputRef.current?.focus(), 0);
        } catch (error) {
          notifyError(error, "Falha ao iniciar modo bip.");
        } finally {
          setCollectorInitializing(false);
        }
      },
    });
  };

  const stopCollectorMode = () => {
    setCollectorModeActive(false);
    appendCollectorLog({
      input: "stop",
      status: "OK",
      message: "Modo bip encerrado.",
    });
  };

  const runCollector = async () => {
    if (!selectedSessionId) {
      notifyError(new Error("Abra uma sessao antes de usar o coletor."));
      return;
    }
    if (selectedSession?.status !== "ABERTO") {
      notifyError(new Error("Coletor disponivel apenas para sessoes abertas."));
      return;
    }
    if (!collectorModeActive || collectorSessionId !== selectedSessionId) {
      notifyError(new Error("Inicie primeiro o modo bip para esta sessao."));
      return;
    }

    const rawInput = collectorInput.trim();
    if (!rawInput) {
      notifyError(new Error("Leia ou digite uma etiqueta primeiro."));
      return;
    }
    const parsedInput = parseCollectorInput(rawInput);
    if (!parsedInput) {
      appendCollectorLog({
        input: rawInput,
        status: "ERRO",
        message: "Formato invalido. Use CI-<id> ou codigo numerico da peca.",
      });
      notifyError(new Error("Formato invalido. Use CI-<id> ou codigo numerico da peca."));
      return;
    }

    setCollectorLoading(true);
    try {
      const item = await resolveCollectorItem(selectedSessionId, parsedInput);
      const currentValue = item.qtd_fisico ?? 0;
      const increment = Math.max(1, Math.round(Number(collectorStep || 1)));
      const nextValue = currentValue + increment;

      await api.inventoryUpdateSessionItems(selectedSessionId, {
        items: [
          {
            produto_id: item.produto_id,
            qtd_fisico: nextValue,
          },
        ],
      });
      setEdits((current) => {
        if (!(item.produto_id in current)) return current;
        const next = { ...current };
        delete next[item.produto_id];
        return next;
      });
      setCollectorInput("");
      appendCollectorLog({
        input: rawInput,
        status: "OK",
        message: `${item.produto_nome} (#${item.produto_id}) -> ${nextValue}`,
      });
      void queryClient.invalidateQueries({ queryKey: ["inventory-session-items", selectedSessionId] });
      void queryClient.invalidateQueries({ queryKey: ["inventory-sessions"] });
      window.setTimeout(() => collectorInputRef.current?.focus(), 0);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha no coletor.";
      appendCollectorLog({
        input: rawInput,
        status: "ERRO",
        message,
      });
      notifyError(error, "Falha no coletor.");
    } finally {
      setCollectorLoading(false);
    }
  };

  const confirmApply = () => {
    if (!selectedSessionId) return;
    modals.openConfirmModal({
      title: "Aplicar ajustes do inventario",
      children: (
        <Text size="sm">
          Esta operacao vai gerar movimentacoes de AJUSTE para todas as divergencias da sessao.
        </Text>
      ),
      labels: { confirm: "Aplicar ajustes", cancel: "Cancelar" },
      confirmProps: { color: "orange" },
      onConfirm: () => applyMutation.mutate(selectedSessionId),
    });
  };

  const sessions = sessionsQuery.data?.data ?? [];
  const sessionsPages = Math.max(sessionsQuery.data?.meta?.total_pages ?? 1, 1);
  const items = itemsQuery.data?.data ?? [];
  const itemPages = Math.max(itemsQuery.data?.meta?.total_pages ?? 1, 1);

  const printTemplate = () => {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    const html = buildInventorySheetHtml({
      sessionName: selectedSession?.nome || sessionName.trim() || "Sessao manual",
      local: selectedSession?.local || sessionLocal,
      totalRows: 56,
    });

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
        if (frame.parentNode) {
          frame.parentNode.removeChild(frame);
        }
      }, 500);
    };

    frame.onload = () => {
      const frameWindow = frame.contentWindow;
      if (!frameWindow) {
        cleanup();
        notifyError(new Error("Nao foi possivel abrir a impressao da folha."));
        return;
      }
      frameWindow.focus();
      frameWindow.print();
      cleanup();
    };

    frame.onerror = () => {
      cleanup();
      notifyError(new Error("Falha ao preparar a folha para impressao."));
    };

    document.body.appendChild(frame);
    if (!frame.contentDocument) {
      cleanup();
      notifyError(new Error("Falha ao criar documento de impressao."));
      return;
    }
    frame.contentDocument.open();
    frame.contentDocument.write(html);
    frame.contentDocument.close();
  };

  return (
    <Stack gap="lg">
      <PageHeader
        title="Inventario"
        subtitle="Crie sessoes de contagem, identifique divergencias e aplique ajustes em lote."
        actions={<Button leftSection={<IconPrinter size={16} />} variant="light" onClick={printTemplate}>Imprimir folha modelo</Button>}
      />

      <Card withBorder>
        <Stack>
          <Title order={4}>Nova sessao de inventario</Title>
          <Group align="end" wrap="wrap">
            <TextInput
              label="Nome da sessao"
              placeholder="Ex: Inventario mensal - fevereiro"
              value={sessionName}
              onChange={(event) => setSessionName(event.currentTarget.value)}
              w={320}
            />
            <Select
              label="Local"
              data={[
                { value: "CANOAS", label: "Canoas" },
                { value: "PF", label: "Passo Fundo" },
              ]}
              value={sessionLocal}
              onChange={(value) => setSessionLocal((value as "CANOAS" | "PF") || "CANOAS")}
              w={180}
            />
            <TextInput
              label="Observacao"
              value={sessionObservacao}
              onChange={(event) => setSessionObservacao(event.currentTarget.value)}
              w={320}
            />
            <Button
              onClick={onCreateSession}
              loading={createSessionMutation.isPending}
              disabled={sessionName.trim().length === 0}
            >
              Criar sessao
            </Button>
          </Group>
        </Stack>
      </Card>

      <Card withBorder>
        <Stack>
          <Title order={4}>Sessoes de inventario</Title>
          <DataTable minWidth={980}>
            <Table striped highlightOnHover withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>ID</Table.Th>
                  <Table.Th>Nome</Table.Th>
                  <Table.Th>Local</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Itens</Table.Th>
                  <Table.Th>Contados</Table.Th>
                  <Table.Th>Divergentes</Table.Th>
                  <Table.Th>Criado em</Table.Th>
                  <Table.Th>Acoes</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {sessions.map((session) => (
                  <Table.Tr
                    key={session.id}
                    className={selectedSessionId === session.id ? "row-selected" : ""}
                  >
                    <Table.Td>{session.id}</Table.Td>
                    <Table.Td>{session.nome}</Table.Td>
                    <Table.Td>{session.local}</Table.Td>
                    <Table.Td>
                      <Badge color={session.status === "ABERTO" ? "blue" : "green"} variant="light">
                        {session.status}
                      </Badge>
                    </Table.Td>
                    <Table.Td>{session.total_items}</Table.Td>
                    <Table.Td>{session.counted_items}</Table.Td>
                    <Table.Td>{session.divergent_items}</Table.Td>
                    <Table.Td>{dayjs(session.created_at).format("DD/MM/YYYY HH:mm")}</Table.Td>
                    <Table.Td>
                      <Button
                        size="xs"
                        variant={selectedSessionId === session.id ? "filled" : "light"}
                        onClick={() => {
                          setSelectedSessionId(session.id);
                          setItemsPage(1);
                          setEdits({});
                          setCollectorInput("");
                          setCollectorLog([]);
                        }}
                      >
                        Abrir
                      </Button>
                    </Table.Td>
                  </Table.Tr>
                ))}
                {sessions.length === 0 && (
                  <Table.Tr>
                    <Table.Td colSpan={9}>
                      <EmptyState message="Nenhuma sessao de inventario criada." />
                    </Table.Td>
                  </Table.Tr>
                )}
              </Table.Tbody>
            </Table>
          </DataTable>

          <Group justify="space-between">
            <Text size="sm" c="dimmed">
              Total: {sessionsQuery.data?.meta?.total_items ?? 0}
            </Text>
            <Pagination value={sessionPage} onChange={setSessionPage} total={sessionsPages} />
          </Group>
        </Stack>
      </Card>

      {selectedSession && (
        <Card withBorder>
          <Stack>
            <Group justify="space-between" wrap="wrap">
              <Stack gap={2}>
                <Title order={4}>Contagens da sessao #{selectedSession.id}</Title>
                <Text size="sm" c="dimmed">
                  {selectedSession.nome} | {selectedSession.local} | Status: {selectedSession.status}
                </Text>
              </Stack>
              <Group>
                <Button
                  variant="light"
                  onClick={savePageCounts}
                  loading={updateItemsMutation.isPending}
                  disabled={selectedSession.status !== "ABERTO"}
                >
                  Salvar contagens
                </Button>
                <Button
                  color="orange"
                  onClick={confirmApply}
                  loading={applyMutation.isPending}
                  disabled={selectedSession.status !== "ABERTO"}
                >
                  Aplicar ajustes
                </Button>
              </Group>
            </Group>

            <FilterToolbar>
              <Stack gap="xs">
                <Group justify="space-between" wrap="wrap">
                  <Text fw={600} size="sm">
                    Coletor por etiqueta
                  </Text>
                  <Badge color={collectorModeActive ? "green" : "gray"} variant="light">
                    {collectorModeActive ? "Modo bip ativo" : "Modo bip inativo"}
                  </Badge>
                </Group>
                <Text size="xs" c="dimmed">
                  Fluxo simples: iniciar modo bip (zera fisico para 0), depois so bipar item por item.
                  O sistema compara automaticamente e mostra faltando/a mais na divergencia.
                </Text>
                <Group align="end" wrap="wrap">
                  <Button
                    color={collectorModeActive ? "gray" : "blue"}
                    variant={collectorModeActive ? "light" : "filled"}
                    onClick={initializeCollectorMode}
                    loading={collectorInitializing}
                    disabled={selectedSession.status !== "ABERTO" || collectorInitializing || collectorLoading}
                  >
                    Iniciar modo bip
                  </Button>
                  <Button
                    variant="subtle"
                    onClick={stopCollectorMode}
                    disabled={!collectorModeActive || collectorInitializing || collectorLoading}
                  >
                    Encerrar modo bip
                  </Button>
                  <TextInput
                    label="Etiqueta"
                    placeholder="Bipe ou digite CI-123 / 4031196"
                    value={collectorInput}
                    onChange={(event) => setCollectorInput(event.currentTarget.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void runCollector();
                      }
                    }}
                    ref={collectorInputRef}
                    w={320}
                    disabled={selectedSession.status !== "ABERTO" || collectorLoading || !collectorModeActive}
                  />
                  <NumberInput
                    label="Incremento"
                    min={1}
                    max={200}
                    value={collectorStep}
                    onChange={(value) => setCollectorStep(Math.max(1, Math.round(Number(value || 1))))}
                    w={120}
                    disabled={selectedSession.status !== "ABERTO" || collectorLoading || !collectorModeActive}
                  />
                  <Button
                    onClick={() => void runCollector()}
                    loading={collectorLoading}
                    disabled={selectedSession.status !== "ABERTO" || !collectorModeActive}
                  >
                    Somar
                  </Button>
                  <Button
                    variant="subtle"
                    onClick={() => setCollectorLog([])}
                    disabled={collectorLog.length === 0 || collectorLoading}
                  >
                    Limpar log
                  </Button>
                </Group>
                {collectorLog.length > 0 && (
                  <DataTable minWidth={780}>
                    <Table withTableBorder striped>
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>Hora</Table.Th>
                          <Table.Th>Entrada</Table.Th>
                          <Table.Th>Status</Table.Th>
                          <Table.Th>Mensagem</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {collectorLog.map((entry) => (
                          <Table.Tr key={entry.id}>
                            <Table.Td>{entry.at}</Table.Td>
                            <Table.Td>{entry.input}</Table.Td>
                            <Table.Td>
                              <Badge color={entry.status === "OK" ? "green" : "red"} variant="light">
                                {entry.status}
                              </Badge>
                            </Table.Td>
                            <Table.Td>{entry.message}</Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  </DataTable>
                )}
              </Stack>
            </FilterToolbar>

            <FilterToolbar>
              <Group align="end" wrap="wrap">
                <Switch
                  label="Somente divergentes"
                  checked={onlyDivergent}
                  onChange={(event) => {
                    setOnlyDivergent(event.currentTarget.checked);
                    setItemsPage(1);
                  }}
                />
                <TextInput
                  label="Buscar item"
                  placeholder="Nome ou ID"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.currentTarget.value);
                    setItemsPage(1);
                  }}
                  w={260}
                />
              </Group>
            </FilterToolbar>

            {itemsQuery.isLoading ? (
              <Text c="dimmed">Carregando itens...</Text>
            ) : (
              <DataTable minWidth={1200}>
                <Table striped highlightOnHover withTableBorder>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>ID</Table.Th>
                      <Table.Th>Produto</Table.Th>
                      <Table.Th>Sistema</Table.Th>
                      <Table.Th>Fisico</Table.Th>
                      <Table.Th>Divergencia</Table.Th>
                      <Table.Th>Analise</Table.Th>
                      <Table.Th>Motivo</Table.Th>
                      <Table.Th>Observacao</Table.Th>
                      <Table.Th>Movimento</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {items.map((item) => {
                      const edit = edits[item.produto_id];
                      const qtdFisico = edit?.qtd_fisico ?? item.qtd_fisico ?? item.qtd_sistema;
                      const divergencia = qtdFisico - item.qtd_sistema;
                      return (
                        <Table.Tr key={item.produto_id}>
                          <Table.Td>{item.produto_id}</Table.Td>
                          <Table.Td>{item.produto_nome}</Table.Td>
                          <Table.Td>{item.qtd_sistema}</Table.Td>
                          <Table.Td>
                            <NumberInput
                              min={0}
                              value={qtdFisico}
                              onChange={(value) =>
                                setItemEdit(item.produto_id, { qtd_fisico: Number(value ?? 0) }, item)
                              }
                              disabled={selectedSession.status !== "ABERTO"}
                              w={120}
                            />
                          </Table.Td>
                          <Table.Td>
                            <Badge color={divergencia === 0 ? "gray" : divergencia > 0 ? "green" : "red"} variant="light">
                              {divergencia}
                            </Badge>
                          </Table.Td>
                          <Table.Td>
                            <Badge
                              color={divergencia === 0 ? "gray" : divergencia > 0 ? "green" : "red"}
                              variant="light"
                            >
                              {divergencia === 0
                                ? "OK"
                                : divergencia > 0
                                  ? `A mais: ${divergencia}`
                                  : `Faltando: ${Math.abs(divergencia)}`}
                            </Badge>
                          </Table.Td>
                          <Table.Td>
                            <Select
                              data={ADJUSTMENT_REASON_OPTIONS}
                              value={(edit?.motivo_ajuste ?? item.motivo_ajuste ?? null) as string | null}
                              onChange={(value) =>
                                setItemEdit(
                                  item.produto_id,
                                  { motivo_ajuste: (value as InventoryAdjustmentReason | null) ?? null },
                                  item
                                )
                              }
                              placeholder={divergencia !== 0 ? "Obrigatorio se divergir" : "-"}
                              disabled={selectedSession.status !== "ABERTO" || divergencia === 0}
                              w={220}
                            />
                          </Table.Td>
                          <Table.Td>
                            <TextInput
                              value={(edit?.observacao ?? item.observacao ?? "") || ""}
                              onChange={(event) =>
                                setItemEdit(item.produto_id, { observacao: event.currentTarget.value }, item)
                              }
                              placeholder={divergencia !== 0 ? "Obrigatorio se divergir" : "-"}
                              disabled={selectedSession.status !== "ABERTO" || divergencia === 0}
                              w={260}
                            />
                          </Table.Td>
                          <Table.Td>{item.applied_movement_id || "-"}</Table.Td>
                        </Table.Tr>
                      );
                    })}
                    {items.length === 0 && (
                      <Table.Tr>
                        <Table.Td colSpan={9}>
                          <EmptyState message="Nenhum item para o filtro selecionado." />
                        </Table.Td>
                      </Table.Tr>
                    )}
                  </Table.Tbody>
                </Table>
              </DataTable>
            )}

            <Group justify="space-between">
              <Text size="sm" c="dimmed">
                Total: {itemsQuery.data?.meta?.total_items ?? 0}
              </Text>
              <Pagination value={itemsPage} onChange={setItemsPage} total={itemPages} />
            </Group>
          </Stack>
        </Card>
      )}
    </Stack>
  );
}
