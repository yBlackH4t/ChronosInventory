import {
  ActionIcon,
  Badge,
  Button,
  ColorInput,
  Grid,
  Group,
  Popover,
  SegmentedControl,
  Stack,
  Table,
  Text,
  Tooltip as MantineTooltip,
} from "@mantine/core";
import dayjs from "dayjs";
import { IconPalette } from "@tabler/icons-react";

import EmptyState from "../ui/EmptyState";
import Panel from "../ui/Panel";
import type {
  ExternalTransferItem,
  MovementNatureTotal,
  RecentStockoutItem,
  StockDistribution,
  StockItemOverview,
  StockoutRiskItem,
  TopSaidaItem,
} from "../../lib/api";
import { useLocations } from "../../hooks/useLocations";
import { useChartTheme, useLocationColor } from "../../lib/chartTheme";
import type { BalancePoint, BrandVersionRow, DayFlow } from "../../lib/dashboardMath";
import {
  ActivityHeatmap,
  BalanceChart,
  BrandVersionPanel,
  CHART_HEIGHT,
  NaturePanel,
  PanelSkeleton,
  StockHealthPanel,
} from "./DashboardInsights";

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
  balance: BalancePoint[];
  balanceLoading: boolean;
  natureItems: MovementNatureTotal[];
  natureLoading: boolean;
  natureTipo: "SAIDA" | "ENTRADA";
  onNatureTipoChange: (tipo: "SAIDA" | "ENTRADA") => void;
  stockItems: StockItemOverview[];
  stockItemsLoading: boolean;
  brandRows: BrandVersionRow[];
  heatDays: DayFlow[];
  heatLoading: boolean;
  today: string;
  /** Na semana, as telas vazias oferecem ver o mês inteiro. */
  onShowMonth?: () => void;
  onOpenProduct: (produtoId: number, nome: string) => void;
  onBrandClick: (brand: string) => void;
  externalTransfers: ExternalTransferItem[];
  externalTransfersLoading: boolean;
  externalTransferType: ExternalTransferType;
  onExternalTransferTypeChange: (value: ExternalTransferType) => void;
  showAllExternalTransfers: boolean;
  onToggleAllExternalTransfers: () => void;
  recentStockouts: RecentStockoutItem[];
  recentStockoutsLoading: boolean;
  stockoutRisk: StockoutRiskItem[];
  stockoutRiskLoading: boolean;
  multiLocation: boolean;
};

const PERIOD_LABELS: Record<PeriodMode, string> = {
  week: "Semana",
  month: "Mês",
};

function coverageLabel(days: number): string {
  if (days < 1) return "zera hoje";
  if (days === 1) return "~1 dia";
  return `~${days} dias`;
}

function PanelLoader() {
  return <PanelSkeleton height={CHART_HEIGHT * 0.7} />;
}

function RankBar({ value, max, color }: { value: number; max: number; color: string }) {
  const width = max > 0 ? Math.max((value / max) * 100, 2) : 0;
  return (
    <div className="inline-bar">
      <span style={{ width: `${width}%`, background: color }} />
    </div>
  );
}

export default function DashboardVisuals({
  scope,
  periodMode,
  dateTo,
  distribution,
  distributionLoading,
  topSaidas,
  topSaidasLoading,
  balance,
  balanceLoading,
  natureItems,
  natureLoading,
  natureTipo,
  onNatureTipoChange,
  stockItems,
  stockItemsLoading,
  brandRows,
  heatDays,
  heatLoading,
  today,
  onShowMonth,
  onOpenProduct,
  onBrandClick,
  externalTransfers,
  externalTransfersLoading,
  externalTransferType,
  onExternalTransferTypeChange,
  showAllExternalTransfers,
  onToggleAllExternalTransfers,
  recentStockouts,
  recentStockoutsLoading,
  stockoutRisk,
  stockoutRiskLoading,
  multiLocation,
}: DashboardVisualsProps) {
  const { locations } = useLocations();
  const chart = useChartTheme();
  const { colorFor, setColor, palette } = useLocationColor();

  const scopeLabel =
    scope !== null
      ? (locations.find((l) => l.id === scope)?.name ?? `Local #${scope}`)
      : multiLocation
        ? "Todas as filiais"
        : (locations.find((l) => l.ativo)?.name ?? "Estoque");
  const periodContext = `${PERIOD_LABELS[periodMode]} · ${scopeLabel}`;

  const rankedSaidas = topSaidas.filter((item) => item.total_saida > 0);
  const maxSaida = Math.max(...rankedSaidas.map((item) => item.total_saida), 0);

  const externalVisibleRows = showAllExternalTransfers
    ? externalTransfers
    : externalTransfers.slice(0, 8);
  const maxExternal = Math.max(
    ...externalTransfers.map((item) => item.total_quantidade),
    0,
  );
  const externalColor =
    externalTransferType === "ENTRADA" ? chart.inflow : chart.outflow;

  const distributionItems = distribution?.items ?? [];
  const distributionTotal = distribution?.total ?? 0;

  const showMonthAction = onShowMonth
    ? { label: "Ver o mês inteiro", onClick: onShowMonth }
    : undefined;
  const hasBalance = balance.some((p) => p.entradas > 0 || p.saidas > 0 || p.saldo !== null);

  const riskPanel = (
    <Panel
      title="Perto de zerar"
      subtitle={`Pelo ritmo de saída dos últimos 30 dias · ${scopeLabel}`}
    >
      {stockoutRiskLoading ? (
        <PanelLoader />
      ) : stockoutRisk.length === 0 ? (
        <EmptyState message="Nenhum item perto de zerar" />
      ) : (
        <Stack gap="sm" pt={4}>
          {stockoutRisk.map((item) => (
            <Group key={item.produto_id} justify="space-between" wrap="nowrap" gap="sm">
              <Stack gap={0} miw={0}>
                <MantineTooltip label={item.nome} openDelay={500}>
                  <Text size="sm" truncate="end">
                    {item.nome}
                  </Text>
                </MantineTooltip>
                <Text size="xs" c="dimmed" className="num">
                  {item.estoque_atual} em estoque · {item.total_saida} saíram em 30 dias
                </Text>
              </Stack>
              <Badge
                variant="light"
                color={item.dias_cobertura <= 7 ? "danger" : "warning"}
                tt="none"
                className="num"
                style={{ flexShrink: 0 }}
              >
                {coverageLabel(item.dias_cobertura)}
              </Badge>
            </Group>
          ))}
        </Stack>
      )}
    </Panel>
  );

  return (
    <Stack gap="md">
      <Grid gutter="md">
        {/* Movimento e saldo num gráfico só */}
        <Grid.Col span={{ base: 12, lg: 7 }}>
          <Panel title="Movimento e saldo" subtitle={periodContext}>
            {balanceLoading ? (
              <PanelLoader />
            ) : !hasBalance ? (
              <EmptyState
                message="Sem movimentações no período"
                actionLabel={showMonthAction?.label}
                onAction={showMonthAction?.onClick}
              />
            ) : (
              <BalanceChart data={balance} />
            )}
          </Panel>
        </Grid.Col>

        {/* Distribuição por filial (só faz sentido com mais de um local) */}
        {multiLocation ? (
          <Grid.Col span={{ base: 12, lg: 5 }}>
            <Panel
              title={scope === null ? "Distribuição por filial" : `Estoque em ${scopeLabel}`}
              subtitle={`${distributionTotal.toLocaleString("pt-BR")} unidades em estoque`}
              actions={
                distributionItems.length > 0 ? (
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
                        {distributionItems.map((item) => (
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
              {distributionLoading ? (
                <PanelLoader />
              ) : distributionItems.length === 0 ? (
                <EmptyState message="Sem estoque distribuído no momento" />
              ) : (
                <Stack gap="lg" pt={4}>
                  <div className="share-bar" role="img" aria-label="Participação por filial">
                    {distributionItems.map((item) => (
                      <span
                        key={item.local}
                        title={`${item.local}: ${item.quantidade}`}
                        style={{
                          width: `${distributionTotal > 0 ? (item.quantidade / distributionTotal) * 100 : 0}%`,
                          background: colorFor(item.local),
                        }}
                      />
                    ))}
                  </div>
                  <Stack gap={10}>
                    {distributionItems.map((item) => {
                      const share =
                        distributionTotal > 0 ? (item.quantidade / distributionTotal) * 100 : 0;
                      return (
                        <Group key={item.local} justify="space-between" wrap="nowrap">
                          <Group gap={8} wrap="nowrap" miw={0}>
                            <span
                              className="legend-swatch"
                              style={{ background: colorFor(item.local) }}
                            />
                            <Text size="sm" truncate>
                              {item.local}
                            </Text>
                          </Group>
                          <Group gap="md" wrap="nowrap">
                            <Text size="sm" fw={600} className="num">
                              {item.quantidade.toLocaleString("pt-BR")}
                            </Text>
                            <Text size="xs" c="dimmed" w={44} ta="right" className="num">
                              {share.toFixed(1)}%
                            </Text>
                          </Group>
                        </Group>
                      );
                    })}
                  </Stack>
                </Stack>
              )}
            </Panel>
          </Grid.Col>
        ) : (
          <Grid.Col span={{ base: 12, lg: 5 }}>{riskPanel}</Grid.Col>
        )}

        {/* Para onde foi o estoque */}
        <Grid.Col span={{ base: 12, md: 6, lg: 4 }}>
          <NaturePanel
            items={natureItems}
            loading={natureLoading}
            tipo={natureTipo}
            onTipoChange={onNatureTipoChange}
            subtitle={periodContext}
            emptyAction={showMonthAction}
          />
        </Grid.Col>

        {/* O que tem na prateleira */}
        <Grid.Col span={{ base: 12, md: 6, lg: 4 }}>
          <BrandVersionPanel
            rows={brandRows}
            loading={stockItemsLoading}
            subtitle={`Hoje · ${scopeLabel}`}
            onBrandClick={onBrandClick}
          />
        </Grid.Col>

        {/* Mais vendidos */}
        <Grid.Col span={{ base: 12, lg: 4 }}>
          <Panel title="Mais saídas no período" subtitle={periodContext}>
            {topSaidasLoading ? (
              <PanelLoader />
            ) : rankedSaidas.length === 0 ? (
              <EmptyState
                message="Sem saídas no período"
                actionLabel={showMonthAction?.label}
                onAction={showMonthAction?.onClick}
              />
            ) : (
              <Stack gap="md" pt={4}>
                {rankedSaidas.map((item, index) => (
                  <Stack key={item.produto_id} gap={6}>
                    <Group justify="space-between" wrap="nowrap" gap="sm">
                      <Group gap={10} wrap="nowrap" miw={0}>
                        <Text size="xs" c="dimmed" w={14} className="num">
                          {index + 1}
                        </Text>
                        <MantineTooltip label={item.nome} openDelay={500}>
                          <Text
                            size="sm"
                            truncate="end"
                            className="link-text"
                            onClick={() => onOpenProduct(item.produto_id, item.nome)}
                          >
                            {item.nome}
                          </Text>
                        </MantineTooltip>
                      </Group>
                      <Text size="sm" fw={600} className="num">
                        {item.total_saida}
                      </Text>
                    </Group>
                    <div style={{ paddingLeft: 24 }}>
                      <RankBar value={item.total_saida} max={maxSaida} color={chart.outflow} />
                    </div>
                  </Stack>
                ))}
              </Stack>
            )}
          </Panel>
        </Grid.Col>

        {/* Saúde do estoque e calendário */}
        <Grid.Col span={{ base: 12, lg: 8 }}>
          <StockHealthPanel
            items={stockItems}
            loading={stockItemsLoading}
            subtitle={scopeLabel}
            onOpenProduct={(item) => onOpenProduct(item.produto_id, item.nome)}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 4 }}>
          <ActivityHeatmap days={heatDays} loading={heatLoading} end={today} subtitle={scopeLabel} />
        </Grid.Col>

        {multiLocation ? <Grid.Col span={12}>{riskPanel}</Grid.Col> : null}
      </Grid>

      {/* Transferências externas */}
      <Panel
        flush
        title="Transferências externas"
        subtitle={periodContext}
        actions={
          <SegmentedControl
            size="xs"
            value={externalTransferType}
            onChange={(value) =>
              onExternalTransferTypeChange(value as ExternalTransferType)
            }
            data={[
              { value: "SAIDA", label: "Saídas" },
              { value: "ENTRADA", label: "Entradas" },
            ]}
          />
        }
      >
        {externalTransfersLoading ? (
          <PanelLoader />
        ) : externalTransfers.length === 0 ? (
          <EmptyState message="Sem transferências externas no período" />
        ) : (
          <>
            <Table.ScrollContainer minWidth={720}>
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Produto</Table.Th>
                    <Table.Th w={240}>Quantidade</Table.Th>
                    <Table.Th w={130} ta="right">
                      Movimentações
                    </Table.Th>
                    <Table.Th w={170}>Última</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {externalVisibleRows.map((item) => (
                    <Table.Tr key={`${externalTransferType}-${item.produto_id}`}>
                      <Table.Td>
                        <Text size="sm" fw={500} lineClamp={1}>
                          {item.nome}
                        </Text>
                        <Text size="xs" c="dimmed" className="mono">
                          #{item.produto_id}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Group gap="sm" wrap="nowrap">
                          <Text size="sm" fw={600} w={36} className="num">
                            {item.total_quantidade}
                          </Text>
                          <div style={{ flex: 1 }}>
                            <RankBar
                              value={item.total_quantidade}
                              max={maxExternal}
                              color={externalColor}
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
            {externalTransfers.length > 8 ? (
              <Group justify="space-between" px="lg" py="sm">
                <Text size="xs" c="dimmed">
                  Mostrando {externalVisibleRows.length} de {externalTransfers.length}
                </Text>
                <Button variant="subtle" color="gray" size="xs" onClick={onToggleAllExternalTransfers}>
                  {showAllExternalTransfers ? "Ver menos" : "Ver todos"}
                </Button>
              </Group>
            ) : null}
          </>
        )}
      </Panel>

      {/* Zerados com venda recente */}
      <Panel
        flush
        title="Zerados com venda recente"
        subtitle={`Itens sem estoque que tiveram saída nos últimos 30 dias · até ${dayjs(dateTo).format("DD/MM/YYYY")} · ${scopeLabel}`}
      >
        {recentStockoutsLoading ? (
          <PanelLoader />
        ) : recentStockouts.length === 0 ? (
          <EmptyState message="Nenhum item zerado com venda recente" />
        ) : (
          <Table.ScrollContainer minWidth={640}>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Produto</Table.Th>
                  <Table.Th w={160} ta="right">
                    Vendido em 30 dias
                  </Table.Th>
                  <Table.Th w={170}>Última venda</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {recentStockouts.map((item) => (
                  <Table.Tr key={item.produto_id}>
                    <Table.Td>
                      <Text size="sm" fw={500} lineClamp={1}>
                        {item.nome}
                      </Text>
                      <Text size="xs" c="dimmed" className="mono">
                        #{item.produto_id}
                      </Text>
                    </Table.Td>
                    <Table.Td ta="right" fw={600} className="num">
                      {item.total_saida_recente}
                    </Table.Td>
                    <Table.Td c="dimmed" className="num">
                      {item.last_sale
                        ? dayjs(item.last_sale).format("DD/MM/YYYY HH:mm")
                        : "—"}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Panel>
    </Stack>
  );
}
