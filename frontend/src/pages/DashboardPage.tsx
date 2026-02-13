import { useEffect, useMemo, useState } from "react";
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

export default function DashboardPage() {
  const [scope, setScope] = useState<Scope>("AMBOS");
  const [periodMode, setPeriodMode] = useState<PeriodMode>("week");
  const [selectedDate, setSelectedDate] = useState<string | null>(dayjs().format("YYYY-MM-DD"));

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

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="center">
        <Title order={2}>Dashboard</Title>
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
          <SegmentedControl
            value={scope}
            onChange={(value) => setScope(value as Scope)}
            data={SCOPE_OPTIONS}
          />
        </Group>
      </Group>

      <Grid>
        <Grid.Col span={{ base: 12, md: 3 }}>
          <Card withBorder>
            <Text size="sm" c="dimmed">Total Canoas</Text>
            {summaryQuery.isLoading ? <Skeleton h={30} mt={8} /> : <Text fw={700} size="xl" c={COLORS.canoas}>{summary?.total_canoas ?? 0}</Text>}
          </Card>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 3 }}>
          <Card withBorder>
            <Text size="sm" c="dimmed">Total PF</Text>
            {summaryQuery.isLoading ? <Skeleton h={30} mt={8} /> : <Text fw={700} size="xl" c={COLORS.pf}>{summary?.total_pf ?? 0}</Text>}
          </Card>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 3 }}>
          <Card withBorder>
            <Text size="sm" c="dimmed">Total Geral</Text>
            {summaryQuery.isLoading ? <Skeleton h={30} mt={8} /> : <Text fw={700} size="xl" c={COLORS.total}>{summary?.total_geral ?? 0}</Text>}
          </Card>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 3 }}>
          <Card withBorder>
            <Text size="sm" c="dimmed">Itens zerados</Text>
            {summaryQuery.isLoading ? <Skeleton h={30} mt={8} /> : <Text fw={700} size="xl" c={COLORS.zerado}>{summary?.zerados ?? 0}</Text>}
          </Card>
        </Grid.Col>
      </Grid>

      <Grid>
        <Grid.Col span={{ base: 12, lg: 6 }}>
          <Card withBorder>
            <Group justify="space-between" mb="sm">
              <Title order={4}>Top 5 saidas ({periodMode === "week" ? "semana" : "mes"})</Title>
              <Badge variant="light">{scope}</Badge>
            </Group>
            {topSaidasQuery.isLoading ? (
              <Loader size="sm" />
            ) : topSaidas.length === 0 ? (
              <Text c="dimmed">Sem dados no periodo.</Text>
            ) : (
              <div style={{ width: "100%", height: 280 }}>
                <ResponsiveContainer>
                  <BarChart data={topSaidas}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="nome" hide />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="total_saida" fill={scope === "PF" ? COLORS.pf : COLORS.canoas} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
        </Grid.Col>

        <Grid.Col span={{ base: 12, lg: 6 }}>
          <Card withBorder>
            <Title order={4} mb="sm">Distribuicao de estoque</Title>
            {distributionQuery.isLoading ? (
              <Loader size="sm" />
            ) : !(distribution && distribution.items.length) ? (
              <Text c="dimmed">Sem dados.</Text>
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
                      label={(entry) => `${entry.name}: ${((entry.percent ?? 0) * 100).toFixed(1)}%`}
                    >
                      {distribution.items.map((entry: { local: "CANOAS" | "PF"; quantidade: number; percentual: number }) => (
                        <Cell
                          key={entry.local}
                          fill={entry.local === "CANOAS" ? COLORS.canoas : COLORS.pf}
                        />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
        </Grid.Col>

        <Grid.Col span={{ base: 12, lg: 6 }}>
          <Card withBorder>
            <Title order={4} mb="sm">Entradas vs Saidas</Title>
            {flowQuery.isLoading ? (
              <Loader size="sm" />
            ) : flow.length === 0 ? (
              <Text c="dimmed">Sem dados no periodo.</Text>
            ) : (
              <div style={{ width: "100%", height: 280 }}>
                <ResponsiveContainer>
                  <LineChart data={flow}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="period" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="entradas" stroke={COLORS.total} strokeWidth={2} />
                    <Line type="monotone" dataKey="saidas" stroke={COLORS.zerado} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
        </Grid.Col>

        <Grid.Col span={{ base: 12, lg: 6 }}>
          <Card withBorder>
            <Title order={4} mb="sm">Evolucao do estoque</Title>
            {evolutionQuery.isLoading ? (
              <Loader size="sm" />
            ) : evolution.length === 0 ? (
              <Text c="dimmed">Sem dados no periodo.</Text>
            ) : (
              <div style={{ width: "100%", height: 280 }}>
                <ResponsiveContainer>
                  <LineChart data={evolution}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="period" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="total_stock" name="Total" stroke={COLORS.total} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
        </Grid.Col>

        <Grid.Col span={12}>
          <Card withBorder>
            <Title order={4} mb="sm">Top 5 itens sem movimentacao (30 dias)</Title>
            {inactiveQuery.isLoading ? (
              <Loader size="sm" />
            ) : inactive.length === 0 ? (
              <Text c="dimmed">Nenhum item sem movimentacao no periodo.</Text>
            ) : (
              <Table striped highlightOnHover>
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
            )}
          </Card>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}
