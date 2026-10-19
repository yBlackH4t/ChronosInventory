import {
  ActionIcon,
  Button,
  ColorInput,
  Group,
  Popover,
  SegmentedControl,
  Skeleton,
  Stack,
  Table,
  Text,
  Tooltip as MantineTooltip,
  UnstyledButton,
} from "@mantine/core";
import { IconPalette } from "@tabler/icons-react";
import dayjs from "dayjs";
import { useState } from "react";

import EmptyState from "../ui/EmptyState";
import Panel from "../ui/Panel";
import type { ExternalTransferItem, MovementNatureTotal, StockDistribution } from "../../lib/api";
import { useChartTheme, useLocationColor } from "../../lib/chartTheme";
import { type BrandVersionRow, type DayFlow, heatmapWeeks } from "../../lib/dashboardMath";
import { movementNatureLabel } from "../../lib/movements";
import { type VersionLabel } from "../../lib/semantic";

// Análises que saíram do Painel na 2.6.1 (Relatórios > Análises): para onde foram as
// saídas, marcas e versões, calendário de movimento, divisão por filial e transferências
// externas.

export const CHART_HEIGHT = 260;

export function PanelSkeleton({ height = CHART_HEIGHT }: { height?: number }) {
  return (
    <Stack gap="xs" h={height} justify="flex-end" aria-label="Carregando">
      <Skeleton h={height * 0.18} w="35%" radius="sm" />
      <Skeleton h={height * 0.62} radius="sm" />
    </Stack>
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

// ---------------------------------------------------------------------------
// Distribuição por filial (com as cores de cada filial).
// ---------------------------------------------------------------------------
export function DistributionPanel({
  distribution,
  loading,
}: {
  distribution?: StockDistribution;
  loading: boolean;
}) {
  const { colorFor, setColor, palette } = useLocationColor();
  const items = distribution?.items ?? [];
  const total = distribution?.total ?? 0;

  return (
    <Panel
      title="Distribuição por filial"
      subtitle={`Hoje · ${total.toLocaleString("pt-BR")} unidades em estoque`}
      actions={
        items.length > 0 ? (
          <Popover width={240} position="bottom-end">
            <Popover.Target>
              <ActionIcon color="gray" size="sm" aria-label="Cores das filiais">
                <IconPalette size={16} stroke={1.5} />
              </ActionIcon>
            </Popover.Target>
            <Popover.Dropdown>
              <Text size="xs" fw={600} c="dimmed" mb="xs">
                Cores por filial
              </Text>
              <Stack gap="xs">
                {items.map((item) => (
                  <Group key={item.local} justify="space-between" wrap="nowrap">
                    <Text size="xs" truncate maw={90}>
                      {item.local}
                    </Text>
                    <ColorInput
                      size="xs"
                      format="hex"
                      swatches={palette}
                      value={colorFor(item.local)}
                      onChange={(val) => setColor(item.local, val)}
                      w={120}
                    />
                  </Group>
                ))}
              </Stack>
            </Popover.Dropdown>
          </Popover>
        ) : undefined
      }
    >
      {loading ? (
        <PanelSkeleton height={160} />
      ) : items.length === 0 ? (
        <EmptyState message="Sem estoque distribuído no momento" />
      ) : (
        <Stack gap="lg" pt={4}>
          <div className="share-bar" role="img" aria-label="Participação por filial">
            {items.map((item) => (
              <span
                key={item.local}
                title={`${item.local}: ${item.quantidade}`}
                style={{
                  width: `${total > 0 ? (item.quantidade / total) * 100 : 0}%`,
                  background: colorFor(item.local),
                }}
              />
            ))}
          </div>
          <Stack gap={10}>
            {items.map((item) => {
              const itemShare = total > 0 ? (item.quantidade / total) * 100 : 0;
              return (
                <Group key={item.local} justify="space-between" wrap="nowrap">
                  <Group gap={8} wrap="nowrap" miw={0}>
                    <span className="legend-swatch" style={{ background: colorFor(item.local) }} />
                    <Text size="sm" truncate>
                      {item.local}
                    </Text>
                  </Group>
                  <Group gap="md" wrap="nowrap">
                    <Text size="sm" fw={600} className="num">
                      {item.quantidade.toLocaleString("pt-BR")}
                    </Text>
                    <Text size="xs" c="dimmed" w={44} ta="right" className="num">
                      {itemShare.toFixed(1)}%
                    </Text>
                  </Group>
                </Group>
              );
            })}
          </Stack>
        </Stack>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Transferências externas por produto.
// ---------------------------------------------------------------------------
export function ExternalTransfersPanel({
  items,
  loading,
  tipo,
  onTipoChange,
  subtitle,
}: {
  items: ExternalTransferItem[];
  loading: boolean;
  tipo: "ENTRADA" | "SAIDA";
  onTipoChange: (tipo: "ENTRADA" | "SAIDA") => void;
  subtitle: string;
}) {
  const chart = useChartTheme();
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? items : items.slice(0, 8);
  const max = Math.max(0, ...items.map((item) => item.total_quantidade));
  const color = tipo === "ENTRADA" ? chart.inflow : chart.outflow;

  return (
    <Panel
      flush
      title="Transferências externas"
      subtitle={subtitle}
      actions={
        <SegmentedControl
          size="xs"
          value={tipo}
          onChange={(value) => onTipoChange(value as "ENTRADA" | "SAIDA")}
          data={[
            { value: "SAIDA", label: "Saídas" },
            { value: "ENTRADA", label: "Entradas" },
          ]}
        />
      }
    >
      {loading ? (
        <div style={{ padding: 16 }}>
          <PanelSkeleton height={160} />
        </div>
      ) : items.length === 0 ? (
        <EmptyState message="Sem transferências externas no período" />
      ) : (
        <>
          <Table.ScrollContainer minWidth={640}>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Produto</Table.Th>
                  <Table.Th w={220}>Quantidade</Table.Th>
                  <Table.Th w={130} ta="right">
                    Movimentações
                  </Table.Th>
                  <Table.Th w={160}>Última</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {visible.map((item) => (
                  <Table.Tr key={`${tipo}-${item.produto_id}`}>
                    <Table.Td>
                      <Text size="sm" fw={500} lineClamp={1}>
                        {item.nome}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Group gap="sm" wrap="nowrap">
                        <Text size="sm" fw={600} w={36} className="num">
                          {item.total_quantidade}
                        </Text>
                        <div className="inline-bar" style={{ flex: 1 }}>
                          <span
                            style={{
                              width: `${max > 0 ? Math.max((item.total_quantidade / max) * 100, 2) : 0}%`,
                              background: color,
                            }}
                          />
                        </div>
                      </Group>
                    </Table.Td>
                    <Table.Td ta="right" className="num">
                      {item.total_movimentacoes}
                    </Table.Td>
                    <Table.Td c="dimmed" className="num">
                      {item.ultima_transferencia
                        ? dayjs(item.ultima_transferencia).format("DD/MM/YYYY HH:mm")
                        : "—"}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
          {items.length > 8 ? (
            <Group justify="space-between" px="lg" py="sm">
              <Text size="xs" c="dimmed">
                Mostrando {visible.length} de {items.length}
              </Text>
              <Button variant="subtle" color="gray" size="xs" onClick={() => setShowAll((v) => !v)}>
                {showAll ? "Ver menos" : "Ver todos"}
              </Button>
            </Group>
          ) : null}
        </>
      )}
    </Panel>
  );
}
