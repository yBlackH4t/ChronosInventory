import { useMemo, useState } from "react";
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
import dayjs from "dayjs";

import { api } from "../lib/apiClient";
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

  return (
    <Stack gap="lg">
      <PageHeader
        title="Inventario"
        subtitle="Crie sessoes de contagem, identifique divergencias e aplique ajustes em lote."
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
                        <Table.Td colSpan={8}>
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
