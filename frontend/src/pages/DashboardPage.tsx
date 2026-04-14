import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Badge,
  Button,
  Card,
  Grid,
  Group,
  Loader,
  SegmentedControl,
  Skeleton,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { api } from "../lib/apiClient";
import { loadTabState, saveTabState } from "../state/tabStateCache";
import { useProfileScope } from "../state/profileScope";
import EmptyState from "../components/ui/EmptyState";
import FilterToolbar from "../components/ui/FilterToolbar";
import PageHeader from "../components/ui/PageHeader";
import type {
  FlowPoint,
  StockDistribution,
  StockSummary,
  StockEvolutionPoint,
  SuccessResponse,
  TopSaidaItem,
  RecentStockoutItem,
  ExternalTransferItem,
} from "../lib/api";
import { notifyError } from "../lib/notify";

const COLORS = {
  canoas: "#1f77b4",
  pf: "#f39c12",
  total: "#2ecc71",
  zerado: "#e03131",
};

const SCOPE_OPTIONS = [
  { value: "AMBOS", label: "Ambos" },
  { value: "CANOAS", label: "Canoas" },
  { value: "PF", label: "Passo Fundo" },
];

type Scope = "AMBOS" | "CANOAS" | "PF";
type PeriodMode = "week" | "month";
type ExternalTransferType = "ENTRADA" | "SAIDA";
type DashboardTabState = {
  scope: Scope;
  periodMode: PeriodMode;
  selectedDate: string | null;
  externalTransferType: ExternalTransferType;
  scrollY: number;
};

type SummaryCard = {
  label: string;
  value: number;
  color: string;
};

const DASHBOARD_TAB_ID = "dashboard";
const DEFAULT_DASHBOARD_TAB_STATE: DashboardTabState = {
  scope: "AMBOS",
  periodMode: "week",
  selectedDate: dayjs().format("YYYY-MM-DD"),
  externalTransferType: "SAIDA",
  scrollY: 0,
};

const SCOPE_LABELS: Record<Scope, string> = {
  AMBOS: "Ambos",
  CANOAS: "Canoas",
  PF: "Passo Fundo",
};

const PERIOD_LABELS: Record<PeriodMode, string> = {
  week: "Semana",
  month: "Mes",
};

function truncateLabel(value: string, max = 15): string {
  const normalized = (value ?? "").trim();
  if (!normalized) return "-";
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 3)}...`;
}

function numericValue(value: number | string | undefined | null): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function flowSeriesLabel(name: string | undefined): string {
  const normalized = (name ?? "").trim().toLowerCase();
  if (normalized === "entradas" || normalized === "entrada") return "Entradas";
  if (normalized === "saidas" || normalized === "saida") return "Saidas";
  return name ?? "Valor";
}

function getQueryErrorMessage(error: unknown): string | null {
  if (!error) return null;
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Falha ao carregar dados do dashboard.";
}

export default function DashboardPage() {
  const { profileScopeKey } = useProfileScope();
  const lastErrorToastRef = useRef<string | null>(null);
  const persistedState = useMemo(
    () => loadTabState<DashboardTabState>(DASHBOARD_TAB_ID) ?? DEFAULT_DASHBOARD_TAB_STATE,
    []
  );
  const [scope, setScope] = useState<Scope>(persistedState.scope);
  const [periodMode, setPeriodMode] = useState<PeriodMode>(persistedState.periodMode);
  const [selectedDate, setSelectedDate] = useState<string | null>(persistedState.selectedDate);
  const [externalTransferType, setExternalTransferType] = useState<ExternalTransferType>(
    persistedState.externalTransferType ?? "SAIDA"
  );
  const [showAllExternalTransfers, setShowAllExternalTransfers] = useState(false);
  const [scrollY, setScrollY] = useState(persistedState.scrollY);

  const selected = dayjs(selectedDate ?? new Date());
  const dateFrom = useMemo(
    () => selected.startOf(periodMode === "week" ? "week" : "month").format("YYYY-MM-DD"),
    [selected, periodMode]
  );
  const dateTo = useMemo(
    () => selected.endOf(periodMode === "week" ? "week" : "month").format("YYYY-MM-DD"),
    [selected, periodMode]
  );

  const bucket = periodMode === "week" ? "day" : "week";

  const summaryQuery = useQuery<SuccessResponse<StockSummary>>({
    queryKey: ["analytics", profileScopeKey, "stock-summary", scope],
    queryFn: ({ signal }) => api.getAnalyticsStockSummary({ scope }, { signal }),
  });

  const distributionQuery = useQuery<SuccessResponse<StockDistribution>>({
    queryKey: ["analytics", profileScopeKey, "stock-distribution", scope],
    queryFn: ({ signal }) => api.getAnalyticsStockDistribution({ scope }, { signal }),
  });

  const topSaidasQuery = useQuery<SuccessResponse<TopSaidaItem[]>>({
    queryKey: ["analytics", profileScopeKey, "top-saidas", dateFrom, dateTo, scope],
    queryFn: ({ signal }) =>
      api.getAnalyticsTopSaidas(
        { date_from: dateFrom, date_to: dateTo, scope, limit: 5 },
        { signal }
      ),
  });

  const flowQuery = useQuery<SuccessResponse<FlowPoint[]>>({
    queryKey: ["analytics", profileScopeKey, "flow", dateFrom, dateTo, scope, bucket],
    queryFn: ({ signal }) =>
      api.getAnalyticsFlow(
        {
          date_from: dateFrom,
          date_to: dateTo,
          scope,
          bucket,
        },
        { signal }
      ),
  });

  const evolutionQuery = useQuery<SuccessResponse<StockEvolutionPoint[]>>({
    queryKey: ["analytics", profileScopeKey, "stock-evolution", dateFrom, dateTo, scope, bucket],
    queryFn: ({ signal }) =>
      api.getAnalyticsStockEvolution(
        {
          date_from: dateFrom,
          date_to: dateTo,
          scope,
          bucket,
        },
        { signal }
      ),
  });
  const recentStockoutsQuery = useQuery<SuccessResponse<RecentStockoutItem[]>>({
    queryKey: ["analytics", profileScopeKey, "recent-stockouts", dateTo, scope],
    queryFn: ({ signal }) =>
      api.getAnalyticsRecentStockouts(
        {
          days: 30,
          date_to: dateTo,
          scope,
          limit: 5,
        },
        { signal }
      ),
  });
  const externalTransfersQuery = useQuery<SuccessResponse<ExternalTransferItem[]>>({
    queryKey: [
      "analytics",
      profileScopeKey,
      "external-transfers",
      dateFrom,
      dateTo,
      scope,
      externalTransferType,
    ],
    queryFn: ({ signal }) =>
      api.getAnalyticsExternalTransfers(
        {
          date_from: dateFrom,
          date_to: dateTo,
          scope,
          tipo: externalTransferType,
          limit: 15,
        },
        { signal }
      ),
  });


  const dashboardErrors = useMemo(
    () =>
      [
      summaryQuery.error,
      distributionQuery.error,
      topSaidasQuery.error,
      flowQuery.error,
      evolutionQuery.error,
      recentStockoutsQuery.error,
      externalTransfersQuery.error,
    ]
        .map(getQueryErrorMessage)
        .filter((item): item is string => Boolean(item)),
    [
      summaryQuery.error,
      distributionQuery.error,
      topSaidasQuery.error,
      flowQuery.error,
      evolutionQuery.error,
      recentStockoutsQuery.error,
      externalTransfersQuery.error,
    ]
  );

  useEffect(() => {
    if (dashboardErrors.length === 0) {
      lastErrorToastRef.current = null;
      return;
    }
    const combinedMessage =
      dashboardErrors.length === 1
        ? dashboardErrors[0]
        : `Falha ao carregar parte do dashboard (${dashboardErrors.length} blocos). Primeiro erro: ${dashboardErrors[0]}`;
    if (lastErrorToastRef.current === combinedMessage) return;
    lastErrorToastRef.current = combinedMessage;
    notifyError(new Error(combinedMessage));
  }, [dashboardErrors]);

  const summary = summaryQuery.data?.data;
  const topSaidas = topSaidasQuery.data?.data ?? [];
  const distribution = distributionQuery.data?.data;
  const flow = flowQuery.data?.data ?? [];
  const evolution = evolutionQuery.data?.data ?? [];
  const recentStockouts = recentStockoutsQuery.data?.data ?? [];
  const externalTransfers = externalTransfersQuery.data?.data ?? [];
  const hasTopSaidasData = topSaidas.some((item) => item.total_saida > 0);
  const topSaidasChartData = useMemo(
    () =>
      topSaidas.map((item) => ({
        ...item,
        nome_curto: truncateLabel(item.nome),
      })),
    [topSaidas]
  );
  const externalTransfersChartData = useMemo(
    () =>
      externalTransfers.slice(0, 8).map((item) => ({
        ...item,
        nome_curto: truncateLabel(item.nome, 26),
      })),
    [externalTransfers]
  );
  const externalTransfersVisibleRows = useMemo(
    () => (showAllExternalTransfers ? externalTransfers : externalTransfers.slice(0, 8)),
    [externalTransfers, showAllExternalTransfers]
  );
  const externalTransfersChartHeight = useMemo(
    () => Math.max(280, externalTransfersChartData.length * 34),
    [externalTransfersChartData.length]
  );
  const periodContext = `${PERIOD_LABELS[periodMode]} | ${SCOPE_LABELS[scope]} | ${dayjs(dateFrom).format("DD/MM/YYYY")} - ${dayjs(dateTo).format("DD/MM/YYYY")}`;
  const evolutionContext = `${PERIOD_LABELS[periodMode]} | ${SCOPE_LABELS[scope]} | ${dayjs(dateFrom).format("DD/MM/YYYY")} - ${dayjs(dateTo).format("DD/MM/YYYY")}`;
  const externalTransfersContext = `${PERIOD_LABELS[periodMode]} | ${SCOPE_LABELS[scope]} | ${dayjs(dateFrom).format("DD/MM/YYYY")} - ${dayjs(dateTo).format("DD/MM/YYYY")}`;

  const summaryCards = useMemo<SummaryCard[]>(() => {
    if (!summary) return [];
    if (scope === "CANOAS") {
      return [
        { label: "Total em Canoas", value: summary.total_canoas, color: COLORS.canoas },
        { label: "Itens zerados em Canoas", value: summary.zerados, color: COLORS.zerado },
      ];
    }
    if (scope === "PF") {
      return [
        { label: "Total em Passo Fundo", value: summary.total_pf, color: COLORS.pf },
        { label: "Itens zerados em Passo Fundo", value: summary.zerados, color: COLORS.zerado },
      ];
    }
    return [
      { label: "Total Canoas", value: summary.total_canoas, color: COLORS.canoas },
      { label: "Total PF", value: summary.total_pf, color: COLORS.pf },
      { label: "Total Geral", value: summary.total_geral, color: COLORS.total },
      { label: "Itens zerados", value: summary.zerados, color: COLORS.zerado },
    ];
  }, [scope, summary]);

  const persistState = useCallback(
    (nextScrollY = scrollY) => {
      saveTabState<DashboardTabState>(DASHBOARD_TAB_ID, {
        scope,
        periodMode,
        selectedDate,
        externalTransferType,
        scrollY: nextScrollY,
      });
    },
    [externalTransferType, periodMode, scope, scrollY, selectedDate]
  );

  useEffect(() => {
    persistState();
  }, [persistState]);

  useEffect(() => {
    setShowAllExternalTransfers(false);
  }, [dateFrom, dateTo, scope, externalTransferType]);

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

  return (
    <Stack gap="lg">
      <PageHeader
        title="Dashboard"
        subtitle="Visao consolidada do estoque e movimentacoes por periodo."
      />

      <FilterToolbar>
        <Group justify="space-between" align="end" wrap="wrap">
          <Group>
            <SegmentedControl
              value={periodMode}
              onChange={(value) => setPeriodMode(value as PeriodMode)}
              data={[
                { value: "week", label: "Semana" },
                { value: "month", label: "Mes" },
              ]}
            />
            <DatePickerInput value={selectedDate} onChange={setSelectedDate} label="Data base" w={180} />
          </Group>
          <SegmentedControl value={scope} onChange={(value) => setScope(value as Scope)} data={SCOPE_OPTIONS} />
        </Group>
      </FilterToolbar>

      <Grid>
        {summaryQuery.isLoading
          ? Array.from({ length: scope === "AMBOS" ? 4 : 2 }, (_, index) => (
              <Grid.Col key={index} span={{ base: 12, md: scope === "AMBOS" ? 3 : 6 }}>
                <Card className="kpi-card">
                  <Skeleton h={30} mt={8} />
                </Card>
              </Grid.Col>
            ))
          : summaryCards.map((card) => (
              <Grid.Col key={card.label} span={{ base: 12, md: scope === "AMBOS" ? 3 : 6 }}>
                <Card className="kpi-card">
                  <Text size="sm" c="dimmed">{card.label}</Text>
                  <Text fw={700} size="xl" c={card.color}>{card.value}</Text>
                </Card>
              </Grid.Col>
            ))}
      </Grid>

      <Grid>
        <Grid.Col span={{ base: 12, lg: 6 }}>
          <Card withBorder>
            <Group justify="space-between" mb="sm">
              <Title order={4}>Top 5 saidas no periodo</Title>
              <Badge variant="light">{scope}</Badge>
            </Group>
            <Text size="xs" c="dimmed" mb="sm">
              {periodContext}
            </Text>
            {topSaidasQuery.isLoading ? (
              <Loader size="sm" />
            ) : topSaidas.length === 0 || !hasTopSaidasData ? (
              <EmptyState message="Sem dados para os filtros selecionados. Ajuste data ou escopo." />
            ) : (
              <div style={{ width: "100%", height: 280 }}>
                <ResponsiveContainer>
                  <BarChart data={topSaidasChartData} margin={{ top: 22, right: 8, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="nome_curto" interval={0} tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} />
                    <Tooltip
                      formatter={(value: number | string | undefined) => [numericValue(value), "Saidas"]}
                      labelFormatter={(_, payload) => payload?.[0]?.payload?.nome ?? "-"}
                    />
                    <Bar dataKey="total_saida" name="Saidas" fill={COLORS.zerado} radius={[4, 4, 0, 0]}>
                      <LabelList dataKey="total_saida" position="top" fontSize={11} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
        </Grid.Col>

        <Grid.Col span={{ base: 12, lg: 6 }}>
          <Card withBorder>
            <Title order={4} mb="sm">
              {scope === "AMBOS" ? "Distribuicao atual de estoque" : `Estoque atual em ${SCOPE_LABELS[scope]}`}
            </Title>
            <Text size="xs" c="dimmed" mb="sm">
              {scope === "AMBOS"
                ? `Base atual por filial | Total: ${distribution?.total ?? 0} itens`
                : `Base atual no escopo | Total: ${distribution?.total ?? 0} itens`}
            </Text>
            {distributionQuery.isLoading ? (
              <Loader size="sm" />
            ) : !(distribution && distribution.items.length) ? (
              <EmptyState message="Sem estoque distribuido no momento." />
            ) : (
              <div style={{ width: "100%", height: 280 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={distribution.items}
                      dataKey="quantidade"
                      nameKey="local"
                      cx="50%"
                      cy="50%"
                      outerRadius={95}
                      label={(entry: { name?: string; value?: number | string; percent?: number }) =>
                        `${entry.name ?? "-"}: ${numericValue(entry.value)} (${((entry.percent ?? 0) * 100).toFixed(1)}%)`
                      }
                    >
                      {distribution.items.map((entry: { local: "CANOAS" | "PF"; quantidade: number; percentual: number }) => (
                        <Cell key={entry.local} fill={entry.local === "CANOAS" ? COLORS.canoas : COLORS.pf} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number | string | undefined, name: string | undefined) => [
                        `${numericValue(value)} itens`,
                        name ?? "Local",
                      ]}
                    />
                    <Legend formatter={(value: string) => (value === "CANOAS" ? "Canoas" : "Passo Fundo")} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
        </Grid.Col>

        <Grid.Col span={{ base: 12, lg: 6 }}>
          <Card withBorder>
            <Title order={4} mb="sm">Fluxo de entradas e saidas</Title>
            <Text size="xs" c="dimmed" mb="sm">
              {periodContext}
            </Text>
            {flowQuery.isLoading ? (
              <Loader size="sm" />
            ) : flow.length === 0 ? (
              <EmptyState message="Sem movimentacoes para os filtros selecionados." />
            ) : (
              <div style={{ width: "100%", height: 280 }}>
                <ResponsiveContainer>
                  <LineChart data={flow}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} />
                    <Tooltip
                      formatter={(value: number | string | undefined, name: string | undefined) => [
                        numericValue(value),
                        flowSeriesLabel(name),
                      ]}
                    />
                    <Legend />
                    <Line type="monotone" dataKey="entradas" name="Entradas" stroke={COLORS.total} strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="saidas" name="Saidas" stroke={COLORS.zerado} strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
        </Grid.Col>

        <Grid.Col span={{ base: 12, lg: 6 }}>
          <Card withBorder>
            <Title order={4} mb="sm">Evolucao do estoque no periodo</Title>
            <Text size="xs" c="dimmed" mb="sm">
              {evolutionContext}
            </Text>
            {evolutionQuery.isLoading ? (
              <Loader size="sm" />
            ) : evolution.length === 0 ? (
              <EmptyState message="Sem historico de evolucao para o periodo selecionado." />
            ) : (
              <div style={{ width: "100%", height: 280 }}>
                <ResponsiveContainer>
                  <LineChart data={evolution}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} />
                    <Tooltip formatter={(value: number | string | undefined) => [numericValue(value), "Total em estoque"]} />
                    <Legend />
                    <Line type="monotone" dataKey="total_stock" name="Total em estoque" stroke={scope === "PF" ? COLORS.pf : COLORS.canoas} strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
        </Grid.Col>

        <Grid.Col span={12}>
          <Card withBorder>
            <Group justify="space-between" align="start" mb="sm" wrap="wrap">
              <div>
                <Title order={4}>Transferencias externas</Title>
                <Text size="xs" c="dimmed">
                  {externalTransfersContext}
                </Text>
              </div>
              <SegmentedControl
                value={externalTransferType}
                onChange={(value) => setExternalTransferType(value as ExternalTransferType)}
                data={[
                  { value: "SAIDA", label: "Saidas externas" },
                  { value: "ENTRADA", label: "Entradas externas" },
                ]}
              />
            </Group>
            {externalTransfersQuery.isLoading ? (
              <Loader size="sm" />
            ) : externalTransfers.length === 0 ? (
              <EmptyState message="Sem transferencias externas no recorte atual." />
            ) : (
              <Stack gap="md">
                <div style={{ width: "100%", height: externalTransfersChartHeight }}>
                  <ResponsiveContainer>
                    <BarChart
                      data={externalTransfersChartData}
                      layout="vertical"
                      margin={{ top: 8, right: 32, left: 8, bottom: 8 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" allowDecimals={false} />
                      <YAxis
                        type="category"
                        dataKey="nome_curto"
                        width={200}
                        tick={{ fontSize: 11 }}
                      />
                      <Tooltip
                        formatter={(value: number | string | undefined) => [
                          numericValue(value),
                          externalTransferType === "ENTRADA" ? "Qtd entrada" : "Qtd saida",
                        ]}
                        labelFormatter={(_, payload) => payload?.[0]?.payload?.nome ?? "-"}
                      />
                      <Bar
                        dataKey="total_quantidade"
                        fill={externalTransferType === "ENTRADA" ? COLORS.total : COLORS.zerado}
                        radius={[0, 4, 4, 0]}
                      >
                        <LabelList dataKey="total_quantidade" position="right" fontSize={11} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <Table.ScrollContainer minWidth={860}>
                  <Table striped highlightOnHover withTableBorder>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>ID</Table.Th>
                        <Table.Th>Produto</Table.Th>
                        <Table.Th>Qtd transferida</Table.Th>
                        <Table.Th>Movimentacoes</Table.Th>
                        <Table.Th>Ultima transferencia</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {externalTransfersVisibleRows.map((item) => (
                        <Table.Tr key={`${externalTransferType}-${item.produto_id}`}>
                          <Table.Td>{item.produto_id}</Table.Td>
                          <Table.Td>{item.nome}</Table.Td>
                          <Table.Td>{item.total_quantidade}</Table.Td>
                          <Table.Td>{item.total_movimentacoes}</Table.Td>
                          <Table.Td>
                            {item.ultima_transferencia
                              ? dayjs(item.ultima_transferencia).format("DD/MM/YYYY HH:mm")
                              : "Sem historico"}
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Table.ScrollContainer>

                {externalTransfers.length > 8 ? (
                  <Group justify="space-between" align="center">
                    <Text size="xs" c="dimmed">
                      Mostrando {externalTransfersVisibleRows.length} de {externalTransfers.length} itens.
                    </Text>
                    <Button
                      variant="subtle"
                      size="xs"
                      onClick={() => setShowAllExternalTransfers((current) => !current)}
                    >
                      {showAllExternalTransfers ? "Ver menos" : "Ver mais"}
                    </Button>
                  </Group>
                ) : null}
              </Stack>
            )}
          </Card>
        </Grid.Col>

        <Grid.Col span={12}>
          <Card withBorder>
            <Title order={4} mb="sm">Zerados com venda recente</Title>
            <Text size="xs" c="dimmed" mb="sm">
              Referencia: ate {dayjs(dateTo).format("DD/MM/YYYY")} | Escopo: {SCOPE_LABELS[scope]} | Janela: 30 dias
            </Text>
            {recentStockoutsQuery.isLoading ? (
              <Loader size="sm" />
            ) : recentStockouts.length === 0 ? (
              <EmptyState message="Nenhum item zerado com venda real recente no recorte atual." />
            ) : (
              <Table.ScrollContainer minWidth={720}>
                <Table striped highlightOnHover withTableBorder>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>ID</Table.Th>
                      <Table.Th>Produto</Table.Th>
                      <Table.Th>Qtd vendida (30d)</Table.Th>
                      <Table.Th>Ultima venda</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {recentStockouts.map((item) => (
                      <Table.Tr key={item.produto_id}>
                        <Table.Td>{item.produto_id}</Table.Td>
                        <Table.Td>{item.nome}</Table.Td>
                        <Table.Td>{item.total_saida_recente}</Table.Td>
                        <Table.Td>{item.last_sale ? dayjs(item.last_sale).format("DD/MM/YYYY HH:mm") : "Sem historico"}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            )}
          </Card>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}
