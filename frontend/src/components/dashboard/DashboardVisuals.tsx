import {
  ActionIcon,
  Badge,
  Button,
  Card,
  ColorInput,
  Grid,
  Group,
  Loader,
  Popover,
  SegmentedControl,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import type { CSSProperties } from "react";
import dayjs from "dayjs";
import { motion, type Variants } from "framer-motion";
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
import {
  IconChartPie,
  IconPalette,
} from "@tabler/icons-react";

import EmptyState from "../ui/EmptyState";
import type {
  ExternalTransferItem,
  FlowPoint,
  RecentStockoutItem,
  StockDistribution,
  StockEvolutionPoint,
  TopSaidaItem,
} from "../../lib/api";

import { useLocations } from "../../hooks/useLocations";
import { useLocalStorage } from "@mantine/hooks";

type Scope = number | null;
type PeriodMode = "week" | "month";
type ExternalTransferType = "ENTRADA" | "SAIDA";

type DashboardVisualsProps = {
  scope: Scope;
  periodMode: PeriodMode;
  dateFrom: string;
  dateTo: string;
  distribution?: StockDistribution;
  distributionLoading: boolean;
  topSaidas: TopSaidaItem[];
  topSaidasLoading: boolean;
  flow: FlowPoint[];
  flowLoading: boolean;
  evolution: StockEvolutionPoint[];
  evolutionLoading: boolean;
  externalTransfers: ExternalTransferItem[];
  externalTransfersLoading: boolean;
  externalTransferType: ExternalTransferType;
  onExternalTransferTypeChange: (value: ExternalTransferType) => void;
  showAllExternalTransfers: boolean;
  onToggleAllExternalTransfers: () => void;
  recentStockouts: RecentStockoutItem[];
  recentStockoutsLoading: boolean;
};

const COLORS = {
  total: "#2ecc71",
  zerado: "#e03131",
  locs: ["#1f77b4", "#f39c12", "#9b59b6", "#e67e22", "#34495e"],
};

const PERIOD_LABELS: Record<PeriodMode, string> = {
  week: "Semana",
  month: "Mes",
};

const CHART_TOOLTIP_CONTENT_STYLE: CSSProperties = {
  backgroundColor: "var(--surface-muted)",
  border: "1px solid var(--line)",
  borderRadius: 10,
  color: "var(--text)",
  boxShadow: "0 14px 32px rgba(15, 23, 42, 0.22)",
};

const CHART_TOOLTIP_LABEL_STYLE: CSSProperties = {
  color: "var(--text)",
  fontWeight: 600,
  marginBottom: 6,
};

const CHART_TOOLTIP_ITEM_STYLE: CSSProperties = {
  color: "var(--text)",
};

const BAR_TOOLTIP_CURSOR = { fill: "rgba(148, 163, 184, 0.16)" };
const LINE_TOOLTIP_CURSOR = {
  stroke: "var(--line)",
  strokeWidth: 1,
  strokeDasharray: "4 4",
};

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 15 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } },
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

export default function DashboardVisuals({
  scope,
  periodMode,
  dateFrom,
  dateTo,
  distribution,
  distributionLoading,
  topSaidas,
  topSaidasLoading,
  flow,
  flowLoading,
  evolution,
  evolutionLoading,
  externalTransfers,
  externalTransfersLoading,
  externalTransferType,
  onExternalTransferTypeChange,
  showAllExternalTransfers,
  onToggleAllExternalTransfers,
  recentStockouts,
  recentStockoutsLoading,
}: DashboardVisualsProps) {
  const { locations } = useLocations();
  const [locationColors, setLocationColors] = useLocalStorage<Record<string, string>>({
    key: "chronos.dashboard.location_colors",
    defaultValue: {},
  });
  const getScopeLabel = (s: Scope) => {
    if (s === null) return "Todos os locais";
    return locations.find((l) => l.id === s)?.name ?? `Local #${s}`;
  };

  const hasTopSaidasData = topSaidas.some((item) => item.total_saida > 0);
  const topSaidasChartData = topSaidas.map((item) => ({
    ...item,
    nome_curto: truncateLabel(item.nome),
  }));
  const externalTransfersChartData = externalTransfers
    .slice(0, 8)
    .map((item) => ({
      ...item,
      nome_curto: truncateLabel(item.nome, 26),
    }));
  const externalTransfersVisibleRows = showAllExternalTransfers
    ? externalTransfers
    : externalTransfers.slice(0, 8);
  const externalTransfersChartHeight = Math.max(
    280,
    externalTransfersChartData.length * 34,
  );
  const periodContext = `${PERIOD_LABELS[periodMode]} | ${getScopeLabel(scope)} | ${dayjs(dateFrom).format("DD/MM/YYYY")} - ${dayjs(dateTo).format("DD/MM/YYYY")}`;
  const evolutionContext = `${PERIOD_LABELS[periodMode]} | ${getScopeLabel(scope)} | ${dayjs(dateFrom).format("DD/MM/YYYY")} - ${dayjs(dateTo).format("DD/MM/YYYY")}`;
  const externalTransfersContext = `${PERIOD_LABELS[periodMode]} | ${getScopeLabel(scope)} | ${dayjs(dateFrom).format("DD/MM/YYYY")} - ${dayjs(dateTo).format("DD/MM/YYYY")}`;

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show">
      <Grid>
        <Grid.Col span={{ base: 12, lg: 6 }}>
          <motion.div variants={itemVariants}>
            <Card withBorder>
          <Group justify="space-between" mb="sm">
            <Title order={4}>Top 5 saidas no periodo</Title>
            <Badge variant="light">{scope}</Badge>
          </Group>
          <Text size="xs" c="dimmed" mb="sm">
            {periodContext}
          </Text>
          {topSaidasLoading ? (
            <Loader size="sm" />
          ) : topSaidas.length === 0 || !hasTopSaidasData ? (
            <EmptyState message="Sem dados para os filtros selecionados. Ajuste data ou escopo." />
          ) : (
            <div style={{ width: "100%", height: 280 }}>
              <ResponsiveContainer>
                <BarChart
                  data={topSaidasChartData}
                  margin={{ top: 22, right: 8, left: 0, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="nome_curto"
                    interval={0}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis allowDecimals={false} />
                  <Tooltip
                    contentStyle={CHART_TOOLTIP_CONTENT_STYLE}
                    labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                    itemStyle={CHART_TOOLTIP_ITEM_STYLE}
                    cursor={BAR_TOOLTIP_CURSOR}
                    formatter={(value: number | string | undefined) => [
                      numericValue(value),
                      "Saidas",
                    ]}
                    labelFormatter={(_, payload) =>
                      payload?.[0]?.payload?.nome ?? "-"
                    }
                  />
                  <Bar
                    dataKey="total_saida"
                    name="Saidas"
                    fill={COLORS.zerado}
                    radius={[4, 4, 0, 0]}
                  >
                    <LabelList
                      dataKey="total_saida"
                      position="top"
                      fontSize={11}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
            </Card>
          </motion.div>
        </Grid.Col>

      <Grid.Col span={{ base: 12, lg: 6 }}>
        <motion.div variants={itemVariants}>
        <Card withBorder>
          <Group justify="space-between" mb="sm">
            <Group gap="xs">
              <IconChartPie size={20} style={{ color: "var(--text)" }} />
              <Title order={4}>
                {scope === null
                  ? "Distribuicao atual de estoque"
                  : `Estoque atual em ${getScopeLabel(scope)}`}
              </Title>
            </Group>
            <Popover width={260} position="bottom-end" withArrow shadow="md">
              <Popover.Target>
                <ActionIcon variant="subtle" color="gray" size="sm">
                  <IconPalette size={16} />
                </ActionIcon>
              </Popover.Target>
              <Popover.Dropdown>
                <Text size="sm" fw={500} mb="xs">Cores por Local</Text>
                <Stack gap="xs">
                  {distribution?.items.map((item, idx) => (
                    <Group key={item.local} justify="space-between" wrap="nowrap">
                      <Text size="xs" truncate style={{ maxWidth: 100 }}>{item.local}</Text>
                      <ColorInput
                        size="xs"
                        format="hex"
                        swatches={['#1f77b4', '#f39c12', '#9b59b6', '#e67e22', '#34495e', '#fa5252', '#be4bdb', '#4c6ef5', '#12b886', '#82c91e']}
                        value={locationColors[item.local] || COLORS.locs[idx % COLORS.locs.length]}
                        onChange={(val) => setLocationColors((prev) => ({ ...prev, [item.local]: val }))}
                        style={{ width: 120 }}
                      />
                    </Group>
                  ))}
                </Stack>
              </Popover.Dropdown>
            </Popover>
          </Group>
          <Text size="xs" c="dimmed" mb="sm">
            {scope === null
              ? `Base atual por filial | Total: ${distribution?.total ?? 0} itens`
              : `Base atual no escopo | Total: ${distribution?.total ?? 0} itens`}
          </Text>
          {distributionLoading ? (
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
                    outerRadius={75}
                    label={(entry: {
                      name?: string;
                      value?: number | string;
                      percent?: number;
                    }) =>
                      `${entry.name ?? "-"}: ${numericValue(entry.value)} (${((entry.percent ?? 0) * 100).toFixed(1)}%)`
                    }
                  >
                    {distribution.items.map((entry, idx) => {
                      return (
                        <Cell
                          key={entry.local}
                          fill={
                            locationColors[entry.local] ||
                            COLORS.locs?.[idx % COLORS.locs?.length] ||
                            COLORS.total
                          }
                        />
                      );
                    })}
                  </Pie>
                  <Tooltip
                    contentStyle={CHART_TOOLTIP_CONTENT_STYLE}
                    labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                    itemStyle={CHART_TOOLTIP_ITEM_STYLE}
                    formatter={(
                      value: number | string | undefined,
                      name: string | undefined,
                    ) => [`${numericValue(value)} itens`, name ?? "Local"]}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
        </motion.div>
      </Grid.Col>

      <Grid.Col span={{ base: 12, lg: 6 }}>
        <motion.div variants={itemVariants}>
        <Card withBorder>
          <Title order={4} mb="sm">
            Fluxo de entradas e saidas
          </Title>
          <Text size="xs" c="dimmed" mb="sm">
            {periodContext}
          </Text>
          {flowLoading ? (
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
                    contentStyle={CHART_TOOLTIP_CONTENT_STYLE}
                    labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                    itemStyle={CHART_TOOLTIP_ITEM_STYLE}
                    cursor={LINE_TOOLTIP_CURSOR}
                    formatter={(
                      value: number | string | undefined,
                      name: string | undefined,
                    ) => [numericValue(value), flowSeriesLabel(name)]}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="entradas"
                    name="Entradas"
                    stroke={COLORS.total}
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="saidas"
                    name="Saidas"
                    stroke={COLORS.zerado}
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
        </motion.div>
      </Grid.Col>

      <Grid.Col span={{ base: 12, lg: 6 }}>
        <motion.div variants={itemVariants}>
        <Card withBorder>
          <Title order={4} mb="sm">
            Evolucao do estoque no periodo
          </Title>
          <Text size="xs" c="dimmed" mb="sm">
            {evolutionContext}
          </Text>
          {evolutionLoading ? (
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
                  <Tooltip
                    contentStyle={CHART_TOOLTIP_CONTENT_STYLE}
                    labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                    itemStyle={CHART_TOOLTIP_ITEM_STYLE}
                    cursor={LINE_TOOLTIP_CURSOR}
                    formatter={(value: number | string | undefined) => [
                      numericValue(value),
                      "Total em estoque",
                    ]}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="total_stock"
                    name="Total em estoque"
                    stroke={COLORS.locs?.[0] || COLORS.locs[0]}
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
        </motion.div>
      </Grid.Col>

      <Grid.Col span={12}>
        <motion.div variants={itemVariants}>
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
              onChange={(value) =>
                onExternalTransferTypeChange(value as ExternalTransferType)
              }
              data={[
                { value: "SAIDA", label: "Saidas externas" },
                { value: "ENTRADA", label: "Entradas externas" },
              ]}
            />
          </Group>
          {externalTransfersLoading ? (
            <Loader size="sm" />
          ) : externalTransfers.length === 0 ? (
            <EmptyState message="Sem transferencias externas no recorte atual." />
          ) : (
            <Stack gap="md">
              <div
                style={{ width: "100%", height: externalTransfersChartHeight }}
              >
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
                      contentStyle={CHART_TOOLTIP_CONTENT_STYLE}
                      labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                      itemStyle={CHART_TOOLTIP_ITEM_STYLE}
                      cursor={BAR_TOOLTIP_CURSOR}
                      formatter={(value: number | string | undefined) => [
                        numericValue(value),
                        externalTransferType === "ENTRADA"
                          ? "Qtd entrada"
                          : "Qtd saida",
                      ]}
                      labelFormatter={(_, payload) =>
                        payload?.[0]?.payload?.nome ?? "-"
                      }
                    />
                    <Bar
                      dataKey="total_quantidade"
                      fill={
                        externalTransferType === "ENTRADA"
                          ? COLORS.total
                          : COLORS.zerado
                      }
                      radius={[0, 4, 4, 0]}
                    >
                      <LabelList
                        dataKey="total_quantidade"
                        position="right"
                        fontSize={11}
                      />
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
                      <Table.Tr
                        key={`${externalTransferType}-${item.produto_id}`}
                      >
                        <Table.Td>{item.produto_id}</Table.Td>
                        <Table.Td>{item.nome}</Table.Td>
                        <Table.Td>{item.total_quantidade}</Table.Td>
                        <Table.Td>{item.total_movimentacoes}</Table.Td>
                        <Table.Td>
                          {item.ultima_transferencia
                            ? dayjs(item.ultima_transferencia).format(
                                "DD/MM/YYYY HH:mm",
                              )
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
                    Mostrando {externalTransfersVisibleRows.length} de{" "}
                    {externalTransfers.length} itens.
                  </Text>
                  <Button
                    variant="subtle"
                    size="xs"
                    onClick={onToggleAllExternalTransfers}
                  >
                    {showAllExternalTransfers ? "Ver menos" : "Ver mais"}
                  </Button>
                </Group>
              ) : null}
            </Stack>
          )}
        </Card>
        </motion.div>
      </Grid.Col>

      <Grid.Col span={12}>
        <motion.div variants={itemVariants}>
        <Card withBorder>
          <Title order={4} mb="sm">
            Zerados com venda recente
          </Title>
          <Text size="xs" c="dimmed" mb="sm">
            Referencia: ate {dayjs(dateTo).format("DD/MM/YYYY")} | Escopo:{" "}
            {getScopeLabel(scope)} | Janela: 30 dias
          </Text>
          {recentStockoutsLoading ? (
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
                      <Table.Td>
                        {item.last_sale
                          ? dayjs(item.last_sale).format("DD/MM/YYYY HH:mm")
                          : "Sem historico"}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          )}
        </Card>
        </motion.div>
      </Grid.Col>
    </Grid>
    </motion.div>
  );
}
