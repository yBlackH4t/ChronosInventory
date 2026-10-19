import {
  Badge,
  Group,
  SegmentedControl,
  Skeleton,
  Stack,
  Table,
  Text,
  Tooltip as MantineTooltip,
  UnstyledButton,
} from "@mantine/core";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import dayjs from "dayjs";

import EmptyState from "../ui/EmptyState";
import Panel from "../ui/Panel";
import type { MovementNatureTotal, StockItemOverview } from "../../lib/api";
import { useChartTheme } from "../../lib/chartTheme";
import {
  type BalancePoint,
  type BrandVersionRow,
  type DayFlow,
  type HealthBucket,
  heatmapWeeks,
  summarizeHealth,
} from "../../lib/dashboardMath";
import { movementNatureLabel } from "../../lib/movements";
import { detectCondition } from "../../lib/brands";
import { VERSION_COLORS, type VersionLabel } from "../../lib/semantic";
import { clickableRowProps } from "../../lib/clickableRow";

export const CHART_HEIGHT = 260;

export function PanelSkeleton({ height = CHART_HEIGHT }: { height?: number }) {
  return (
    <Stack gap="xs" h={height} justify="flex-end" aria-label="Carregando">
      <Skeleton h={height * 0.18} w="35%" radius="sm" />
      <Skeleton h={height * 0.62} radius="sm" />
    </Stack>
  );
}

const formatAxisNumber = (value: number) => value.toLocaleString("pt-BR");

// ---------------------------------------------------------------------------
// Movimento e saldo (ideia 3): barras de entrada e saída + linha do saldo.
// ---------------------------------------------------------------------------
export function BalanceChart({ data }: { data: BalancePoint[] }) {
  const chart = useChartTheme();
  const axisProps = { tick: chart.tick, axisLine: false, tickLine: false } as const;

  return (
    <div style={{ width: "100%", height: CHART_HEIGHT }}>
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barGap={2}>
          <CartesianGrid vertical={false} stroke={chart.grid} />
          <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={12} />
          <YAxis
            yAxisId="mov"
            allowDecimals={false}
            width="auto"
            tickFormatter={formatAxisNumber}
            {...axisProps}
          />
          <YAxis
            yAxisId="saldo"
            orientation="right"
            allowDecimals={false}
            width="auto"
            domain={["auto", "auto"]}
            tickFormatter={formatAxisNumber}
            {...axisProps}
            tick={{ ...chart.tick, fill: chart.accent }}
          />
          <Tooltip
            {...chart.tooltip}
            cursor={{ fill: chart.cursorFill }}
            formatter={(value, name) => [
              Number(value ?? 0).toLocaleString("pt-BR"),
              String(name ?? ""),
            ]}
          />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: chart.tick.fill }} />
          <Bar
            yAxisId="mov"
            dataKey="entradas"
            name="Entradas"
            fill={chart.semantic.inflow}
            radius={[3, 3, 0, 0]}
            maxBarSize={18}
          />
          <Bar
            yAxisId="mov"
            dataKey="saidas"
            name="Saídas"
            fill={chart.semantic.outflow}
            radius={[3, 3, 0, 0]}
            maxBarSize={18}
          />
          <Line
            yAxisId="saldo"
            type="monotone"
            dataKey="saldo"
            name="Saldo"
            stroke={chart.accent}
            strokeWidth={2.2}
            dot={false}
            activeDot={{ r: 4 }}
            connectNulls={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Para onde foi o estoque (ideia 4, esquerda): totais por natureza.
// ---------------------------------------------------------------------------
type NatureProps = {
  items: MovementNatureTotal[];
  loading: boolean;
  tipo: "SAIDA" | "ENTRADA";
  onTipoChange: (tipo: "SAIDA" | "ENTRADA") => void;
  subtitle: string;
  emptyAction?: { label: string; onClick: () => void };
};

export function NaturePanel({ items, loading, tipo, onTipoChange, subtitle, emptyAction }: NatureProps) {
  const chart = useChartTheme();
  const total = items.reduce((acc, item) => acc + item.quantidade, 0);
  const max = Math.max(0, ...items.map((item) => item.quantidade));
  const colorFor = (natureza: string) => {
    if (natureza === "TRANSFERENCIA_EXTERNA") return chart.semantic.transfer;
    if (natureza === "AJUSTE" || natureza === "ESTORNO") return chart.semantic.adjust;
    if (natureza === "DEVOLUCAO") return chart.semantic.reman;
    return tipo === "SAIDA" ? chart.semantic.outflow : chart.semantic.inflow;
  };

  return (
    <Panel
      title={tipo === "SAIDA" ? "Para onde foram as saídas" : "De onde vieram as entradas"}
      subtitle={`${subtitle} · ${total.toLocaleString("pt-BR")} unidades`}
      actions={
        <SegmentedControl
          size="xs"
          value={tipo}
          onChange={(value) => onTipoChange(value as "SAIDA" | "ENTRADA")}
          data={[
            { value: "SAIDA", label: "Saídas" },
            { value: "ENTRADA", label: "Entradas" },
          ]}
        />
      }
    >
      {loading ? (
        <PanelSkeleton height={180} />
      ) : items.length === 0 ? (
        <EmptyState
          message={tipo === "SAIDA" ? "Sem saídas no período" : "Sem entradas no período"}
          actionLabel={emptyAction?.label}
          onAction={emptyAction?.onClick}
        />
      ) : (
        <Stack gap="sm" pt={4}>
          {items.map((item) => (
            <Stack key={item.natureza} gap={4}>
              <Group justify="space-between" wrap="nowrap" gap="xs">
                <Text size="sm" truncate="end">
                  {item.natureza === "OPERACAO_NORMAL"
                    ? tipo === "SAIDA"
                      ? "Venda / operação normal"
                      : "Compra / operação normal"
                    : movementNatureLabel(item.natureza as never)}
                </Text>
                <Group gap={6} wrap="nowrap">
                  <Text size="sm" fw={650} className="num">
                    {item.quantidade.toLocaleString("pt-BR")}
                  </Text>
                  <Text size="xs" c="dimmed" w={34} ta="right" className="num">
                    {total > 0 ? Math.round((item.quantidade / total) * 100) : 0}%
                  </Text>
                </Group>
              </Group>
              <div className="inline-bar">
                <span
                  style={{
                    width: `${max > 0 ? Math.max((item.quantidade / max) * 100, 2) : 0}%`,
                    background: colorFor(item.natureza),
                  }}
                />
              </div>
            </Stack>
          ))}
        </Stack>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Estoque por marca e versão (ideia 4, direita).
// ---------------------------------------------------------------------------
const VERSIONS: VersionLabel[] = ["NOVA", "REMAN", "MONTADA"];

export function BrandVersionPanel({
  rows,
  loading,
  subtitle,
  onBrandClick,
}: {
  rows: BrandVersionRow[];
  loading: boolean;
  subtitle: string;
  onBrandClick: (brand: string) => void;
}) {
  const chart = useChartTheme();
  const hex: Record<VersionLabel, string> = {
    NOVA: chart.semantic.nova,
    REMAN: chart.semantic.reman,
    MONTADA: chart.semantic.montada,
  };
  const max = Math.max(0, ...rows.map((r) => r.total));
  const total = rows.reduce((acc, r) => acc + r.total, 0);

  return (
    <Panel
      title="Estoque por marca e versão"
      subtitle={`${subtitle} · ${total.toLocaleString("pt-BR")} unidades`}
    >
      {loading ? (
        <PanelSkeleton height={180} />
      ) : rows.length === 0 ? (
        <EmptyState message="Nenhum produto com saldo" />
      ) : (
        <Stack gap={10} pt={4}>
          <Group gap="sm">
            {VERSIONS.map((version) => (
              <Group key={version} gap={5} wrap="nowrap">
                <span className="legend-swatch" style={{ background: hex[version] }} />
                <Text size="xs" c="dimmed">
                  {version === "NOVA" ? "Nova" : version === "REMAN" ? "Reman" : "Montada"}
                </Text>
              </Group>
            ))}
          </Group>
          {rows.map((row) => (
            <UnstyledButton
              key={row.brand}
              className="brand-row"
              onClick={() => onBrandClick(row.brand)}
              aria-label={`Ver produtos ${row.brand}`}
            >
              <Text size="sm" truncate="end">
                {row.brand === "Outras" ? "Outras" : row.brand.charAt(0) + row.brand.slice(1).toLowerCase()}
              </Text>
              <MantineTooltip
                label={VERSIONS.filter((v) => row.versions[v] > 0)
                  .map((v) => `${v}: ${row.versions[v]}`)
                  .join(" · ")}
                openDelay={150}
              >
                <div
                  className="stack-bar"
                  style={{ width: `${max > 0 ? Math.max((row.total / max) * 100, 3) : 0}%` }}
                >
                  {VERSIONS.map((version) =>
                    row.versions[version] > 0 ? (
                      <span
                        key={version}
                        style={{ flex: row.versions[version], background: hex[version] }}
                      />
                    ) : null,
                  )}
                </div>
              </MantineTooltip>
              <Text size="sm" fw={650} ta="right" className="num">
                {row.total.toLocaleString("pt-BR")}
              </Text>
            </UnstyledButton>
          ))}
        </Stack>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Saúde do estoque (ideia 5).
// ---------------------------------------------------------------------------
const HEALTH_META: Record<HealthBucket, { label: string; hint: string; color: string }> = {
  GIRANDO: { label: "Girando", hint: "saiu nos últimos 30 dias", color: "success" },
  LENTO: { label: "Lento", hint: "última saída de 31 a 90 dias", color: "warning" },
  PARADO: { label: "Parado", hint: "sem saída há mais de 90 dias", color: "danger" },
};

export function StockHealthPanel({
  items,
  loading,
  subtitle,
  onOpenProduct,
}: {
  items: StockItemOverview[];
  loading: boolean;
  subtitle: string;
  onOpenProduct: (item: StockItemOverview) => void;
}) {
  const chart = useChartTheme();
  const { counts, parados } = summarizeHealth(items);
  const total = items.length;
  const hex: Record<HealthBucket, string> = {
    GIRANDO: chart.semantic.ok,
    LENTO: chart.semantic.warn,
    PARADO: chart.semantic.crit,
  };
  const buckets: HealthBucket[] = ["GIRANDO", "LENTO", "PARADO"];

  return (
    <Panel
      title="Saúde do estoque"
      subtitle={`${total.toLocaleString("pt-BR")} produtos com saldo · última saída de cada um · ${subtitle}`}
    >
      {loading ? (
        <PanelSkeleton height={200} />
      ) : total === 0 ? (
        <EmptyState message="Nenhum produto com saldo" />
      ) : (
        <Stack gap="md" pt={4}>
          <div className="share-bar" style={{ height: 14 }} role="img" aria-label="Divisão do estoque por giro">
            {buckets.map((bucket) =>
              counts[bucket] > 0 ? (
                <span
                  key={bucket}
                  title={`${HEALTH_META[bucket].label}: ${counts[bucket]}`}
                  style={{ width: `${(counts[bucket] / total) * 100}%`, background: hex[bucket] }}
                />
              ) : null,
            )}
          </div>
          <Group grow align="flex-start" gap="md" wrap="wrap">
            {buckets.map((bucket) => (
              <Stack key={bucket} gap={2} miw={130}>
                <Badge color={HEALTH_META[bucket].color} variant="light" w="fit-content">
                  {HEALTH_META[bucket].label}
                </Badge>
                <Text fz={22} fw={650} className="num">
                  {counts[bucket].toLocaleString("pt-BR")}
                </Text>
                <Text size="xs" c="dimmed">
                  {HEALTH_META[bucket].hint}
                </Text>
              </Stack>
            ))}
          </Group>
          {parados.length > 0 ? (
            <Table.ScrollContainer minWidth={460}>
              <Table verticalSpacing={6}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Parados que mais ocupam</Table.Th>
                    <Table.Th w={110}>Versão</Table.Th>
                    <Table.Th w={60} ta="right">
                      Saldo
                    </Table.Th>
                    <Table.Th w={110} ta="right">
                      Parado há
                    </Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {parados.slice(0, 5).map((item) => {
                    const condition = detectCondition(item.nome);
                    return (
                      <Table.Tr
                        key={item.produto_id}
                        {...clickableRowProps(() => onOpenProduct(item))}
                      >
                        <Table.Td>
                          <Text size="sm" truncate="end" maw={420}>
                            {item.nome}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Badge size="xs" variant="outline" color={VERSION_COLORS[condition.label]}>
                            {condition.label}
                          </Badge>
                        </Table.Td>
                        <Table.Td ta="right" fw={650} className="num">
                          {item.estoque}
                        </Table.Td>
                        <Table.Td ta="right" c="dimmed" className="num">
                          {item.dias_sem_saida === null ? "nunca saiu" : `${item.dias_sem_saida} dias`}
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          ) : null}
        </Stack>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Calendário de movimento (ideia 6): 12 semanas, mais escuro = mais movimento.
// ---------------------------------------------------------------------------
const WEEKDAY_LABELS = ["Seg", "", "Qua", "", "Sex", "", ""];

export function ActivityHeatmap({
  days,
  loading,
  end,
  subtitle,
}: {
  days: DayFlow[];
  loading: boolean;
  end: string;
  subtitle: string;
}) {
  const chart = useChartTheme();
  const grid = heatmapWeeks(days, end, 12);
  const cell = 14;
  const gap = 3;
  const left = 28;
  const top = 16;
  const width = left + grid.length * (cell + gap);
  const height = top + 7 * (cell + gap) + 22;
  const fills = [0.08, 0.3, 0.5, 0.72, 1];
  const totalMoves = days.reduce((acc, d) => acc + d.entradas + d.saidas, 0);

  return (
    <Panel title="Dias com mais movimento" subtitle={`Últimas 12 semanas · entradas + saídas · ${subtitle}`}>
      {loading ? (
        <PanelSkeleton height={150} />
      ) : (
        <Stack gap={6} pt={4}>
          <svg
            viewBox={`0 0 ${width} ${height}`}
            width="100%"
            style={{ maxWidth: 360, display: "block" }}
            role="img"
            aria-label={`Calendário de movimento: ${totalMoves} unidades em 12 semanas`}
          >
            {WEEKDAY_LABELS.map((label, index) =>
              label ? (
                <text
                  key={label}
                  x={left - 6}
                  y={top + index * (cell + gap) + cell - 3}
                  textAnchor="end"
                  fontSize={9}
                  fill={chart.tick.fill}
                >
                  {label}
                </text>
              ) : null,
            )}
            {grid.map((column, w) => {
              const first = dayjs(column[0].date);
              const showMonth = w === 0 || first.date() <= 7;
              return (
                <g key={column[0].date}>
                  {showMonth ? (
                    <text x={left + w * (cell + gap)} y={10} fontSize={9} fill={chart.tick.fill}>
                      {first.format("MMM")}
                    </text>
                  ) : null}
                  {column.map((c, d) => (
                    <rect
                      key={c.date}
                      x={left + w * (cell + gap)}
                      y={top + d * (cell + gap)}
                      width={cell}
                      height={cell}
                      rx={3}
                      fill={c.level === 0 ? chart.grid : chart.accent}
                      fillOpacity={c.future ? 0 : c.level === 0 ? 1 : fills[c.level]}
                      stroke={c.future ? chart.grid : "none"}
                    >
                      <title>
                        {dayjs(c.date).format("ddd DD/MM")}: {c.total} {c.total === 1 ? "unidade" : "unidades"}
                      </title>
                    </rect>
                  ))}
                </g>
              );
            })}
            <text x={left} y={height - 6} fontSize={9} fill={chart.tick.fill}>
              Menos
            </text>
            {fills.map((opacity, index) => (
              <rect
                key={opacity}
                x={left + 32 + index * (cell - 2 + 2)}
                y={height - 16}
                width={cell - 3}
                height={cell - 3}
                rx={2}
                fill={index === 0 ? chart.grid : chart.accent}
                fillOpacity={index === 0 ? 1 : opacity}
              />
            ))}
            <text x={left + 32 + fills.length * cell + 4} y={height - 6} fontSize={9} fill={chart.tick.fill}>
              Mais
            </text>
          </svg>
        </Stack>
      )}
    </Panel>
  );
}
