import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Badge,
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
  TopSemMovItem,
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
] ;

type Scope = "AMBOS" | "CANOAS" | "PF";
type PeriodMode = "week" | "month";
type DashboardTabState = {
  scope: Scope;
  periodMode: PeriodMode;
  selectedDate: string | null;
  scrollY: number;
};

const DASHBOARD_TAB_ID = "dashboard";
const DEFAULT_DASHBOARD_TAB_STATE: DashboardTabState = {
  scope: "AMBOS",
  periodMode: "week",
  selectedDate: dayjs().format("YYYY-MM-DD"),
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

export default function DashboardPage() {
  const persistedState = useMemo(
    () => loadTabState<DashboardTabState>(DASHBOARD_TAB_ID) ?? DEFAULT_DASHBOARD_TAB_STATE,
    []
  );
  const [scope, setScope] = useState<Scope>(persistedState.scope);
  const [periodMode, setPeriodMode] = useState<PeriodMode>(persistedState.periodMode);
  const [selectedDate, setSelectedDate] = useState<string | null>(persistedState.selectedDate);
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
    queryKey: ["analytics", "stock-summary"],
    queryFn: ({ signal }) => api.getAnalyticsStockSummary({ signal }),
  });

  const distributionQuery = useQuery<SuccessResponse<StockDistribution>>({
    queryKey: ["analytics", "stock-distribution"],
    queryFn: ({ signal }) => api.getAnalyticsStockDistribution({ signal }),
  });

  const topSaidasQuery = useQuery<SuccessResponse<TopSaidaItem[]>>({
    queryKey: ["analytics", "top-saidas", dateFrom, dateTo, scope],
    queryFn: ({ signal }) =>
      api.getAnalyticsTopSaidas(
        { date_from: dateFrom, date_to: dateTo, scope, limit: 5 },
        { signal }
      ),
  });

  const flowQuery = useQuery<SuccessResponse<FlowPoint[]>>({
    queryKey: ["analytics", "flow", dateFrom, dateTo, scope, bucket],
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
    queryKey: ["analytics", "stock-evolution", dateFrom, dateTo, bucket],
    queryFn: ({ signal }) =>
      api.getAnalyticsStockEvolution(
        {
          date_from: dateFrom,
          date_to: dateTo,
          bucket,
        },
        { signal }
      ),
  });

  const inactiveQuery = useQuery<SuccessResponse<TopSemMovItem[]>>({
    queryKey: ["analytics", "inactive", dateTo],
    queryFn: ({ signal }) =>
      api.getAnalyticsInactiveProducts(
        {
          days: 30,
          date_to: dateTo,
          limit: 5,
        },
        { signal }
      ),
  });

  useEffect(() => {
    const queries = [
      summaryQuery,
      distributionQuery,
      topSaidasQuery,
      flowQuery,
      evolutionQuery,
      inactiveQuery,
    ];
    queries.forEach((query) => {
      if (query.isError) notifyError(query.error);
    });
  }, [
    summaryQuery.isError,
    summaryQuery.error,
    distributionQuery.isError,
    distributionQuery.error,
    topSaidasQuery.isError,
    topSaidasQuery.error,
    flowQuery.isError,
    flowQuery.error,
    evolutionQuery.isError,
    evolutionQuery.error,
    inactiveQuery.isError,
    inactiveQuery.error,
  ]);

  const summary = summaryQuery.data?.data;
  const topSaidas = topSaidasQuery.data?.data ?? [];
  const distribution = distributionQuery.data?.data;
  const flow = flowQuery.data?.data ?? [];
  const evolution = evolutionQuery.data?.data ?? [];
  const inactive = inactiveQuery.data?.data ?? [];
  const hasTopSaidasData = topSaidas.some((item) => item.total_saida > 0);
  const topSaidasChartData = useMemo(
    () =>
      topSaidas.map((item) => ({
        ...item,
        nome_curto: truncateLabel(item.nome),
      })),
    [topSaidas]
  );
  const periodContext = `${PERIOD_LABELS[periodMode]} | ${SCOPE_LABELS[scope]} | ${dayjs(dateFrom).format("DD/MM/YYYY")} - ${dayjs(dateTo).format("DD/MM/YYYY")}`;
  const evolutionContext = `${PERIOD_LABELS[periodMode]} | ${dayjs(dateFrom).format("DD/MM/YYYY")} - ${dayjs(dateTo).format("DD/MM/YYYY")}`;

  const persistState = useCallback(
    (nextScrollY = scrollY) => {
      saveTabState<DashboardTabState>(DASHBOARD_TAB_ID, {
        scope,
        periodMode,
        selectedDate,
        scrollY: nextScrollY,
      });
    },
    [periodMode, scope, scrollY, selectedDate]
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
            <DatePickerInput
              value={selectedDate}
              onChange={setSelectedDate}
              label="Data base"
              w={180}
            />
          </Group>
          <SegmentedControl
            value={scope}
            onChange={(value) => setScope(value as Scope)}
            data={SCOPE_OPTIONS}
          />
        </Group>
      </FilterToolbar>

      <Grid>
        <Grid.Col span={{ base: 12, md: 3 }}>
          <Card className="kpi-card">
            <Text size="sm" c="dimmed">Total Canoas</Text>
            {summaryQuery.isLoading ? <Skeleton h={30} mt={8} /> : <Text fw={700} size="xl" c={COLORS.canoas}>{summary?.total_canoas ?? 0}</Text>}
          </Card>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 3 }}>
          <Card className="kpi-card">
            <Text size="sm" c="dimmed">Total PF</Text>
            {summaryQuery.isLoading ? <Skeleton h={30} mt={8} /> : <Text fw={700} size="xl" c={COLORS.pf}>{summary?.total_pf ?? 0}</Text>}
          </Card>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 3 }}>
          <Card className="kpi-card">
            <Text size="sm" c="dimmed">Total Geral</Text>
            {summaryQuery.isLoading ? <Skeleton h={30} mt={8} /> : <Text fw={700} size="xl" c={COLORS.total}>{summary?.total_geral ?? 0}</Text>}
          </Card>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 3 }}>
          <Card className="kpi-card">
            <Text size="sm" c="dimmed">Itens zerados</Text>
            {summaryQuery.isLoading ? <Skeleton h={30} mt={8} /> : <Text fw={700} size="xl" c={COLORS.zerado}>{summary?.zerados ?? 0}</Text>}
          </Card>
        </Grid.Col>
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
            <Title order={4} mb="sm">Distribuicao atual de estoque</Title>
            <Text size="xs" c="dimmed" mb="sm">
              Base atual por filial | Total: {distribution?.total ?? 0} itens
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
                        <Cell
                          key={entry.local}
                          fill={entry.local === "CANOAS" ? COLORS.canoas : COLORS.pf}
                        />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number | string | undefined, name: string | undefined) => [`${numericValue(value)} itens`, name ?? "Local"]} />
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
                    <Tooltip formatter={(value: number | string | undefined, name: string | undefined) => [numericValue(value), name === "entradas" ? "Entradas" : "Saidas"]} />
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
                    <Line type="monotone" dataKey="total_stock" name="Total em estoque" stroke={COLORS.canoas} strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
        </Grid.Col>

        <Grid.Col span={12}>
          <Card withBorder>
            <Title order={4} mb="sm">Itens sem movimentacao (ultimos 30 dias)</Title>
            <Text size="xs" c="dimmed" mb="sm">
              Referencia: ate {dayjs(dateTo).format("DD/MM/YYYY")} | Janela: 30 dias
            </Text>
            {inactiveQuery.isLoading ? (
              <Loader size="sm" />
            ) : inactive.length === 0 ? (
              <EmptyState message="Nenhum item sem movimentacao no recorte atual." />
            ) : (
              <Table.ScrollContainer minWidth={720}>
                <Table striped highlightOnHover withTableBorder>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>ID</Table.Th>
                      <Table.Th>Produto</Table.Th>
                      <Table.Th>Ultima movimentacao</Table.Th>
                      <Table.Th>Dias sem mov.</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {inactive.map((item) => (
                      <Table.Tr key={item.produto_id}>
                        <Table.Td>{item.produto_id}</Table.Td>
                        <Table.Td>{item.nome}</Table.Td>
                        <Table.Td>{item.last_movement ? dayjs(item.last_movement).format("DD/MM/YYYY HH:mm") : "Sem historico"}</Table.Td>
                        <Table.Td>{item.dias_sem_mov}</Table.Td>
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

