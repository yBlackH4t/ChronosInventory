import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActionIcon, Button, Menu, Stack } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { IconDots, IconPlus, IconPrinter, IconRestore } from "@tabler/icons-react";
import dayjs from "dayjs";

import { api } from "../lib/apiClient";
import { buildInventorySheetHtml } from "../lib/inventorySheetTemplate";
import PageHeader from "../components/ui/PageHeader";
import { InventorySessionsTable } from "../components/inventory/InventorySessionsTable";
import { InventorySessionDetailSection } from "../components/inventory/InventorySessionDetailSection";
import { InventoryCreateSessionModal } from "../components/inventory/InventoryCreateSessionCard";
import Panel from "../components/ui/Panel";
import { useInventoryModals } from "../components/inventory/useInventoryModals";
import {
  clearTabState,
  loadTabState,
  saveTabState,
} from "../state/tabStateCache";
import { useLocations } from "../hooks/useLocations";
import { useScanner } from "../lib/useScanner";
import type {
  InventoryCountItemIn,
  InventoryCountOut,
  InventorySessionDeleteOut,
  InventorySessionSummaryOut,
  InventoryStatusFilter,
  InventorySessionCreateIn,
  InventorySessionOut,
  SuccessResponse,
} from "../lib/api";
import { notifyError, notifySuccess } from "../lib/notify";
import { printHtml } from "../lib/printHtml";
import {
  ADJUSTMENT_REASON_OPTIONS,
  DEFAULT_INVENTORY_TAB_STATE,
  INVENTORY_STATUS_FILTER_OPTIONS,
  INVENTORY_TAB_ID,
  normalizeText,
  parseCollectorInput,
  type CollectorLogItem,
  type CollectorResolvedInput,
  type InventoryTabState,
  type SessionItemEdit,
} from "../components/inventory/inventoryCollector";

export default function InventoryPage() {
  const persistedState = useMemo(
    () =>
      loadTabState<InventoryTabState>(INVENTORY_TAB_ID) ??
      DEFAULT_INVENTORY_TAB_STATE,
    [],
  );
  const queryClient = useQueryClient();
  const [sessionName, setSessionName] = useState(persistedState.sessionName);
  const { locations, activeLocations } = useLocations();
  const [sessionLocationId, setSessionLocationId] = useState<number | null>(
    persistedState.sessionLocationId,
  );
  const [sessionObservacao, setSessionObservacao] = useState(
    persistedState.sessionObservacao,
  );
  const [sessionPage, setSessionPage] = useState(persistedState.sessionPage);
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(
    persistedState.selectedSessionId,
  );
  const [itemsPage, setItemsPage] = useState(persistedState.itemsPage);
  const [statusFilter, setStatusFilter] = useState<InventoryStatusFilter>(
    persistedState.statusFilter,
  );
  const [search, setSearch] = useState(persistedState.search);
  const [edits, setEdits] = useState<Record<number, SessionItemEdit>>({});
  const [collectorInput, setCollectorInput] = useState("");
  const [collectorStep, setCollectorStep] = useState(
    persistedState.collectorStep,
  );
  const [collectorLoading, setCollectorLoading] = useState(false);
  const [collectorInitializing, setCollectorInitializing] = useState(false);
  const [collectorModeActive, setCollectorModeActive] = useState(false);
  const [collectorSessionId, setCollectorSessionId] = useState<number | null>(
    null,
  );
  const [collectorLog, setCollectorLog] = useState<CollectorLogItem[]>([]);
  const collectorInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [scrollY, setScrollY] = useState(persistedState.scrollY);

  const { listen } = useScanner();

  useEffect(() => {
    return listen((code) => {
      if (collectorModeActive) {
        setCollectorInput(code);
        void runCollector(code);
      } else {
        setSearch(code);
      }
    });
  }, [listen, collectorModeActive]);

  const sessionsQuery = useQuery<SuccessResponse<InventorySessionOut[]>>({
    queryKey: ["inventory-sessions", sessionPage],
    queryFn: ({ signal }) =>
      api.inventoryListSessions(
        { page: sessionPage, page_size: 20 },
        { signal },
      ),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const selectedSession = useMemo(
    () =>
      sessionsQuery.data?.data?.find((item) => item.id === selectedSessionId) ??
      null,
    [selectedSessionId, sessionsQuery.data?.data],
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

  const persistState = useCallback(
    (nextScrollY = scrollY) => {
      saveTabState<InventoryTabState>(INVENTORY_TAB_ID, {
        sessionName,
        sessionLocationId,
        sessionObservacao,
        sessionPage,
        selectedSessionId,
        itemsPage,
        statusFilter,
        search,
        collectorStep,
        scrollY: nextScrollY,
      });
    },
    [
      collectorStep,
      itemsPage,
      scrollY,
      search,
      selectedSessionId,
      sessionLocationId,
      sessionName,
      sessionObservacao,
      sessionPage,
      statusFilter,
    ],
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

  const itemsQuery = useQuery<SuccessResponse<InventoryCountOut[]>>({
    queryKey: [
      "inventory-session-items",
      selectedSessionId,
      itemsPage,
      statusFilter,
      search,
    ],
    queryFn: ({ signal }) =>
      api.inventoryListSessionItems(
        selectedSessionId!,
        {
          page: itemsPage,
          page_size: 50,
          query: search.trim() || undefined,
          status_filter: statusFilter,
        },
        { signal },
      ),
    enabled: !!selectedSessionId,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const summaryQuery = useQuery<SuccessResponse<InventorySessionSummaryOut>>({
    queryKey: ["inventory-session-summary", selectedSessionId],
    queryFn: ({ signal }) =>
      api.inventoryGetSessionSummary(selectedSessionId!, { signal }),
    enabled: !!selectedSessionId,
    staleTime: 30_000,
  });

  const [createModalOpened, createModal] = useDisclosure(false);

  const createSessionMutation = useMutation<
    SuccessResponse<InventorySessionOut>,
    Error,
    InventorySessionCreateIn
  >({
    mutationFn: (payload) => api.inventoryCreateSession(payload),
    onSuccess: (response) => {
      notifySuccess("Sessão de inventário criada");
      createModal.close();
      setSessionName("");
      setSessionObservacao("");
      setSelectedSessionId(response.data.id);
      setItemsPage(1);
      setStatusFilter("DIVERGENT");
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
    mutationFn: ({ sessionId, items }) =>
      api.inventoryUpdateSessionItems(sessionId, { items }),
    onSuccess: () => {
      notifySuccess("Contagens salvas");
      setEdits({});
      queryClient.invalidateQueries({
        queryKey: ["inventory-session-items", selectedSessionId],
      });
      queryClient.invalidateQueries({
        queryKey: ["inventory-session-summary", selectedSessionId],
      });
      queryClient.invalidateQueries({ queryKey: ["inventory-sessions"] });
    },
    onError: (error) => notifyError(error),
  });

  const applyMutation = useMutation({
    mutationFn: (sessionId: number) => api.inventoryApplySession(sessionId),
    onSuccess: (response) => {
      notifySuccess(
        `Ajustes aplicados: ${response.data.applied_items} item(ns)`,
      );
      setEdits({});
      queryClient.invalidateQueries({
        queryKey: ["inventory-session-items", selectedSessionId],
      });
      queryClient.invalidateQueries({
        queryKey: ["inventory-session-summary", selectedSessionId],
      });
      queryClient.invalidateQueries({ queryKey: ["inventory-sessions"] });
    },
    onError: (error) => notifyError(error),
  });

  const closeSessionMutation = useMutation<
    SuccessResponse<InventorySessionOut>,
    Error,
    number
  >({
    mutationFn: (sessionId) => api.inventoryCloseSession(sessionId),
    onSuccess: (response) => {
      notifySuccess(`Sessão #${response.data.id} fechada`);
      if (selectedSessionId === response.data.id) {
        setCollectorModeActive(false);
        setCollectorSessionId(null);
        setCollectorInput("");
      }
      queryClient.invalidateQueries({ queryKey: ["inventory-sessions"] });
      queryClient.invalidateQueries({
        queryKey: ["inventory-session-items", response.data.id],
      });
      queryClient.invalidateQueries({
        queryKey: ["inventory-session-summary", response.data.id],
      });
    },
    onError: (error) => notifyError(error),
  });

  const deleteSessionMutation = useMutation<
    SuccessResponse<InventorySessionDeleteOut>,
    Error,
    number
  >({
    mutationFn: (sessionId) => api.inventoryDeleteSession(sessionId),
    onSuccess: (response) => {
      notifySuccess(response.data.message);
      if (selectedSessionId === response.data.session_id) {
        setSelectedSessionId(null);
        setItemsPage(1);
        setEdits({});
        setCollectorInput("");
        setCollectorLog([]);
        setCollectorModeActive(false);
        setCollectorSessionId(null);
      }
      queryClient.invalidateQueries({ queryKey: ["inventory-sessions"] });
      queryClient.removeQueries({
        queryKey: ["inventory-session-items", response.data.session_id],
      });
      queryClient.removeQueries({
        queryKey: ["inventory-session-summary", response.data.session_id],
      });
    },
    onError: (error) => notifyError(error),
  });

  const appendCollectorLog = (entry: Omit<CollectorLogItem, "id" | "at">) => {
    setCollectorLog((current) =>
      [
        {
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          at: dayjs().format("HH:mm:ss"),
          ...entry,
        },
        ...current,
      ].slice(0, 12),
    );
  };

  const resolveCollectorItem = async (
    sessionId: number,
    parsedInput: CollectorResolvedInput,
  ): Promise<InventoryCountOut> => {
    const query =
      parsedInput.kind === "product_id"
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
        throw new Error(
          `Item ${parsedInput.value} não encontrado nesta sessão.`,
        );
      }
      return exact;
    }

    const normalizedCode = normalizeText(parsedInput.value);
    const byCodeInName = rows.filter((item) =>
      normalizeText(item.produto_nome).includes(normalizedCode),
    );
    if (byCodeInName.length === 1) {
      return byCodeInName[0];
    }
    if (byCodeInName.length > 1) {
      const sample = byCodeInName
        .slice(0, 3)
        .map((item) => `${item.produto_nome} (#${item.produto_id})`)
        .join(" | ");
      throw new Error(
        `Esse código serve para mais de um produto (${sample}). Bipe a etiqueta CI- do item.`,
      );
    }

    throw new Error(`Código ${parsedInput.value} não encontrado nesta sessão.`);
  };

  // Last used location while it is still active, otherwise the first active one
  // (same default as the movement modal), so the field never starts empty.
  const effectiveSessionLocationId =
    sessionLocationId !== null &&
    activeLocations.some((loc) => loc.id === sessionLocationId)
      ? sessionLocationId
      : (activeLocations[0]?.id ?? null);

  const onCreateSession = () => {
    if (effectiveSessionLocationId === null) {
      notifyError(new Error("Selecione um local para a sessão."));
      return;
    }
    createSessionMutation.mutate({
      nome: sessionName.trim(),
      location_id: effectiveSessionLocationId,
      observacao: sessionObservacao.trim() || undefined,
    });
  };

  const onInitializeCollector = async () => {
    if (!selectedSessionId) return;
    setCollectorInitializing(true);
    try {
      const allItems = await listAllSessionItems(selectedSessionId);
      if (allItems.length === 0) {
        throw new Error("Sessão sem itens para iniciar coletor.");
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
      notifySuccess("Modo bip iniciado. Agora é só bipar os itens.");
      void queryClient.invalidateQueries({
        queryKey: ["inventory-session-items", selectedSessionId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["inventory-session-summary", selectedSessionId],
      });
      void queryClient.invalidateQueries({ queryKey: ["inventory-sessions"] });
      window.setTimeout(() => collectorInputRef.current?.focus(), 0);
    } catch (error) {
      notifyError(error, "Falha ao iniciar modo bip.");
    } finally {
      setCollectorInitializing(false);
    }
  };

  const {
    confirmCloseSession,
    confirmDeleteSession,
    confirmApply,
    confirmInitializeCollectorMode,
  } = useInventoryModals({
    closeSessionMutation,
    deleteSessionMutation,
    applyMutation,
    onInitializeCollector,
  });

  const setItemEdit = (
    produtoId: number,
    patch: Partial<SessionItemEdit>,
    fallback: InventoryCountOut,
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

  const savePageCounts = useCallback(() => {
    if (!selectedSessionId) return;
    const payload = Object.entries(edits).map(([produtoId, item]) => ({
      produto_id: Number(produtoId),
      qtd_fisico: Number(item.qtd_fisico ?? 0),
      motivo_ajuste: item.motivo_ajuste ?? undefined,
      observacao: (item.observacao || "").trim() || undefined,
    }));
    if (payload.length === 0) {
      notifyError(new Error("Nenhuma alteração pendente para salvar."));
      return;
    }
    updateItemsMutation.mutate({
      sessionId: selectedSessionId,
      items: payload,
    });
  }, [edits, selectedSessionId, updateItemsMutation]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "b") {
        if (!collectorModeActive) return;
        event.preventDefault();
        collectorInputRef.current?.focus();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        if (!selectedSessionId || selectedSession?.status !== "ABERTO") return;
        event.preventDefault();
        savePageCounts();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    collectorModeActive,
    savePageCounts,
    selectedSession?.status,
    selectedSessionId,
  ]);

  const listAllSessionItems = async (
    sessionId: number,
  ): Promise<InventoryCountOut[]> => {
    const pageSize = 200;
    let page = 1;
    let totalPages = 1;
    const collected: InventoryCountOut[] = [];

    while (page <= totalPages) {
      const response = await api.inventoryListSessionItems(sessionId, {
        page,
        page_size: pageSize,
        status_filter: "ALL",
      });
      collected.push(...(response.data || []));
      totalPages = Math.max(response.meta?.total_pages ?? 1, 1);
      page += 1;
    }

    return collected;
  };

  const initializeCollectorMode = () => {
    if (!selectedSessionId) {
      notifyError(new Error("Abra uma sessão antes de iniciar o modo bip."));
      return;
    }
    if (selectedSession?.status !== "ABERTO") {
      notifyError(new Error("Somente sessões abertas podem iniciar modo bip."));
      return;
    }
    confirmInitializeCollectorMode();
  };

  const stopCollectorMode = () => {
    setCollectorModeActive(false);
    appendCollectorLog({
      input: "stop",
      status: "OK",
      message: "Modo bip encerrado.",
    });
  };

  const runCollector = async (overrideInput?: string) => {
    if (!selectedSessionId) {
      notifyError(new Error("Abra uma sessão antes de usar o coletor."));
      return;
    }
    if (selectedSession?.status !== "ABERTO") {
      notifyError(new Error("Coletor disponível apenas para sessões abertas."));
      return;
    }
    if (!collectorModeActive || collectorSessionId !== selectedSessionId) {
      notifyError(new Error("Inicie primeiro o modo bip para esta sessão."));
      return;
    }

    const rawInput = (overrideInput ?? collectorInput).trim();
    if (!rawInput) {
      notifyError(new Error("Leia ou digite uma etiqueta primeiro."));
      return;
    }
    const parsedInput = parseCollectorInput(rawInput);
    if (!parsedInput) {
      appendCollectorLog({
        input: rawInput,
        status: "ERRO",
        message: "Formato inválido. Use CI-<id> ou código numérico da peça.",
      });
      notifyError(
        new Error("Formato inválido. Use CI-<id> ou código numérico da peça."),
      );
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
      void queryClient.invalidateQueries({
        queryKey: ["inventory-session-items", selectedSessionId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["inventory-session-summary", selectedSessionId],
      });
      void queryClient.invalidateQueries({ queryKey: ["inventory-sessions"] });
      window.setTimeout(() => collectorInputRef.current?.focus(), 0);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Falha no coletor.";
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

  const handleApplyAdjustments = () => {
    if (!selectedSessionId) return;
    confirmApply(selectedSessionId);
  };

  const sessions = sessionsQuery.data?.data ?? [];
  const sessionsPages = Math.max(sessionsQuery.data?.meta?.total_pages ?? 1, 1);
  const items = itemsQuery.data?.data ?? [];
  const itemPages = Math.max(itemsQuery.data?.meta?.total_pages ?? 1, 1);
  const sessionSummary = summaryQuery.data?.data;
  const activeFilterCount =
    (statusFilter !== "DIVERGENT" ? 1 : 0) + (search.trim() ? 1 : 0);

  const resetCurrentView = () => {
    setStatusFilter(DEFAULT_INVENTORY_TAB_STATE.statusFilter);
    setSearch("");
    setItemsPage(1);
  };

  const resetInventoryPage = () => {
    setSessionName(DEFAULT_INVENTORY_TAB_STATE.sessionName);
    setSessionLocationId(DEFAULT_INVENTORY_TAB_STATE.sessionLocationId);
    setSessionObservacao(DEFAULT_INVENTORY_TAB_STATE.sessionObservacao);
    setSessionPage(DEFAULT_INVENTORY_TAB_STATE.sessionPage);
    setSelectedSessionId(DEFAULT_INVENTORY_TAB_STATE.selectedSessionId);
    setItemsPage(DEFAULT_INVENTORY_TAB_STATE.itemsPage);
    setStatusFilter(DEFAULT_INVENTORY_TAB_STATE.statusFilter);
    setSearch(DEFAULT_INVENTORY_TAB_STATE.search);
    setCollectorStep(DEFAULT_INVENTORY_TAB_STATE.collectorStep);
    setCollectorInput("");
    setCollectorLog([]);
    setCollectorModeActive(false);
    setCollectorSessionId(null);
    setEdits({});
    clearTabState(INVENTORY_TAB_ID);
    window.scrollTo({ top: 0, behavior: "auto" });
  };

  const printTemplate = () => {
    if (typeof window === "undefined" || typeof document === "undefined")
      return;
    const html = buildInventorySheetHtml({
      sessionName:
        selectedSession?.nome || sessionName.trim() || "Sessão manual",
      local:
        selectedSession?.local_label ||
        locations.find((l) => l.id === effectiveSessionLocationId)?.name ||
        "N/A",
      totalRows: 56,
    });

    printHtml(html, (message) => notifyError(new Error(message)));
  };

  return (
    <Stack gap="lg">
      <PageHeader
        title="Inventário"
        subtitle="Sessões de contagem, divergências e ajustes em lote."
        actions={
          <>
            <Menu position="bottom-end" width={220}>
              <Menu.Target>
                <ActionIcon size="lg" variant="default" aria-label="Mais opções">
                  <IconDots size={18} stroke={1.5} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item
                  leftSection={<IconPrinter size={16} stroke={1.5} />}
                  onClick={printTemplate}
                >
                  Imprimir folha modelo
                </Menu.Item>
                <Menu.Item
                  leftSection={<IconRestore size={16} stroke={1.5} />}
                  onClick={resetInventoryPage}
                >
                  Restaurar visão padrão
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
            <Button leftSection={<IconPlus size={16} />} onClick={createModal.open}>
              Nova sessão
            </Button>
          </>
        }
      />

      <InventoryCreateSessionModal
        opened={createModalOpened}
        onClose={createModal.close}
        sessionName={sessionName}
        onSessionNameChange={setSessionName}
        sessionLocationId={effectiveSessionLocationId}
        onSessionLocationIdChange={setSessionLocationId}
        sessionObservacao={sessionObservacao}
        onSessionObservacaoChange={setSessionObservacao}
        activeLocations={activeLocations}
        onCreateSession={onCreateSession}
        isLoading={createSessionMutation.isPending}
      />

      <Panel flush title="Sessões" subtitle="Clique em uma sessão para abrir a contagem.">
        <InventorySessionsTable
          sessions={sessions}
          selectedSessionId={selectedSessionId}
          totalItems={sessionsQuery.data?.meta?.total_items ?? 0}
          page={sessionPage}
          totalPages={sessionsPages}
          closePending={closeSessionMutation.isPending}
          deletePending={deleteSessionMutation.isPending}
          onSelectSession={(session) => {
            setSelectedSessionId(session.id);
            setItemsPage(1);
            setEdits({});
            setCollectorInput("");
            setCollectorLog([]);
          }}
          onConfirmClose={confirmCloseSession}
          onConfirmDelete={confirmDeleteSession}
          onPageChange={setSessionPage}
        />
      </Panel>

      {selectedSession && (
        <InventorySessionDetailSection
          session={selectedSession}
          onSaveCounts={savePageCounts}
          saveCountsLoading={updateItemsMutation.isPending}
          onApplyAdjustments={handleApplyAdjustments}
          applyLoading={applyMutation.isPending}
          summary={sessionSummary}
          onSelectSummaryFilter={(nextFilter) => {
            setStatusFilter(nextFilter);
            setItemsPage(1);
          }}
          collectorModeActive={collectorModeActive}
          collectorInitializing={collectorInitializing}
          collectorLoading={collectorLoading}
          collectorInput={collectorInput}
          onCollectorInputChange={setCollectorInput}
          onCollectorInputKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void runCollector();
            }
          }}
          collectorInputRef={collectorInputRef}
          collectorStep={collectorStep}
          onCollectorStepChange={setCollectorStep}
          onInitializeCollectorMode={initializeCollectorMode}
          onStopCollectorMode={stopCollectorMode}
          onRunCollector={() => void runCollector()}
          collectorLog={collectorLog}
          onClearCollectorLog={() => setCollectorLog([])}
          statusFilter={statusFilter}
          statusFilterOptions={INVENTORY_STATUS_FILTER_OPTIONS}
          onStatusFilterChange={(value) => {
            setStatusFilter(value);
            setItemsPage(1);
          }}
          search={search}
          onSearchChange={(value) => {
            setSearch(value);
            setItemsPage(1);
          }}
          searchInputRef={searchInputRef}
          activeFilterCount={activeFilterCount}
          onClearFilters={resetCurrentView}
          itemsLoading={itemsQuery.isLoading}
          itemsErrorMessage={
            itemsQuery.error instanceof Error ? itemsQuery.error.message : null
          }
          items={items}
          edits={edits}
          onSetItemEdit={setItemEdit}
          adjustmentReasonOptions={ADJUSTMENT_REASON_OPTIONS}
          itemsTotal={itemsQuery.data?.meta?.total_items ?? 0}
          itemsPage={itemsPage}
          itemsTotalPages={itemPages}
          onItemsPageChange={setItemsPage}
        />
      )}
    </Stack>
  );
}
