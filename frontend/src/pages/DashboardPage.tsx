import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Card,
  Group,
  Loader,
  Stack,
  Text,
  SegmentedControl,
} from "@mantine/core";
import { IconCalendar, IconPackageOff } from "@tabler/icons-react";
import { useNavigate } from "react-router-dom";
import { DatePickerInput } from "@mantine/dates";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import { api } from "../lib/apiClient";
import { loadTabState, saveTabState } from "../state/tabStateCache";
import { useProfileScope } from "../state/profileScope";
import { useLocations } from "../hooks/useLocations";
import PageHeader from "../components/ui/PageHeader";
import StatTile, { type StatDelta } from "../components/ui/StatTile";
import { useChartTheme, useLocationColor } from "../lib/chartTheme";
import {
  buildBalanceSeries,
  fillDays,
  groupByBrandVersion,
  percentChange,
  stockBackward,
  sum,
} from "../lib/dashboardMath";
import type {
  FlowPoint,
  MovementNatureTotal,
  StockItemOverview,
  StockDistribution,
  StockSummary,
  StockEvolutionPoint,
  SuccessResponse,
  TopSaidaItem,
  RecentStockoutItem,
  StockoutRiskItem,
  ExternalTransferItem,
} from "../lib/api";
import { notifyError } from "../lib/notify";

const DashboardVisuals = lazy(
  () => import("../components/dashboard/DashboardVisuals"),
);

type Scope = number | null;
type PeriodMode = "week" | "month";
type ExternalTransferType = "ENTRADA" | "SAIDA";
type DashboardTabState = {
  scope: Scope;
  periodMode: PeriodMode;
  selectedDate: string | null;
  externalTransferType: ExternalTransferType;
  scrollY: number;
};

const DASHBOARD_TAB_ID = "dashboard";
const DEFAULT_DASHBOARD_TAB_STATE: DashboardTabState = {
  scope: null,
  periodMode: "week",
  selectedDate: dayjs().format("YYYY-MM-DD"),
  externalTransferType: "SAIDA",
  scrollY: 0,
};

type SummaryCard = {
  label: string;
  value: number;
  accent?: string;
  hint?: string;
  icon?: React.ReactNode;
  trend?: number[];
  trendColor?: string;
  delta?: StatDelta | null;
  footer?: React.ReactNode;
};

function getQueryErrorMessage(error: unknown): string | null {
  if (!error) return null;
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Falha ao carregar dados do dashboard.";
}

export default function DashboardPage() {
  const { profileScopeKey } = useProfileScope();
  const { activeLocations: locations } = useLocations();
  const { colorFor } = useLocationColor();
  const chart = useChartTheme();
  const navigate = useNavigate();
  const [natureTipo, setNatureTipo] = useState<"SAIDA" | "ENTRADA">("SAIDA");
  const lastErrorToastRef = useRef<string | null>(null);
  const persistedState = useMemo(
    () =>
      loadTabState<DashboardTabState>(DASHBOARD_TAB_ID) ??
      DEFAULT_DASHBOARD_TAB_STATE,
    [],
  );
  const [selectedScope, setScope] = useState<Scope>(persistedState.scope);
  // Com um local só, o filtro e a divisão por filial não dizem nada: tudo vira "todas".
  const multiLocation = locations.length > 1;
  const scope: Scope = multiLocation ? selectedScope : null;
  const [periodMode, setPeriodMode] = useState<PeriodMode>(
    persistedState.periodMode,
  );
  const [selectedDate, setSelectedDate] = useState<string | null>(
    persistedState.selectedDate,
  );
  const [externalTransferType, setExternalTransferType] =
    useState<ExternalTransferType>(
      persistedState.externalTransferType ?? "SAIDA",
    );
  const [showAllExternalTransfers, setShowAllExternalTransfers] =
    useState(false);
  const [scrollY, setScrollY] = useState(persistedState.scrollY);

  const selected = dayjs(selectedDate ?? new Date());
  const dateFrom = useMemo(
    () =>
      selected
        .startOf(periodMode === "week" ? "week" : "month")
        .format("YYYY-MM-DD"),
    [selected, periodMode],
  );
  const dateTo = useMemo(
    () =>
      selected
        .endOf(periodMode === "week" ? "week" : "month")
        .format("YYYY-MM-DD"),
    [selected, periodMode],
  );

  const bucket = periodMode === "week" ? "day" : "week";

  const summaryQuery = useQuery<SuccessResponse<StockSummary>>({
    queryKey: ["analytics", profileScopeKey, "stock-summary", scope],
    queryFn: ({ signal }) =>
      api.getAnalyticsStockSummary({ scope }, { signal }),
  });

  const distributionQuery = useQuery<SuccessResponse<StockDistribution>>({
    queryKey: ["analytics", profileScopeKey, "stock-distribution", scope],
    queryFn: ({ signal }) =>
      api.getAnalyticsStockDistribution({ scope }, { signal }),
  });

  const topSaidasQuery = useQuery<SuccessResponse<TopSaidaItem[]>>({
    queryKey: [
      "analytics",
      profileScopeKey,
      "top-saidas",
      dateFrom,
      dateTo,
      scope,
    ],
    queryFn: ({ signal }) =>
      api.getAnalyticsTopSaidas(
        { date_from: dateFrom, date_to: dateTo, scope, limit: 5 },
        { signal },
      ),
  });

  const flowQuery = useQuery<SuccessResponse<FlowPoint[]>>({
    queryKey: [
      "analytics",
      profileScopeKey,
      "flow",
      dateFrom,
      dateTo,
      scope,
      bucket,
    ],
    queryFn: ({ signal }) =>
      api.getAnalyticsFlow(
        {
          date_from: dateFrom,
          date_to: dateTo,
          scope,
          bucket,
        },
        { signal },
      ),
  });

  const evolutionQuery = useQuery<SuccessResponse<StockEvolutionPoint[]>>({
    queryKey: [
      "analytics",
      profileScopeKey,
      "stock-evolution",
      dateFrom,
      dateTo,
      scope,
      bucket,
    ],
    queryFn: ({ signal }) =>
      api.getAnalyticsStockEvolution(
        {
          date_from: dateFrom,
          date_to: dateTo,
          scope,
          bucket,
        },
        { signal },
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
        { signal },
      ),
  });
  const stockoutRiskQuery = useQuery<SuccessResponse<StockoutRiskItem[]>>({
    queryKey: ["analytics", profileScopeKey, "stockout-risk", scope],
    queryFn: ({ signal }) =>
      api.getAnalyticsStockoutRisk(
        { days: 30, max_dias: 15, scope, limit: 5 },
        { signal },
      ),
  });
  const externalTransfersQuery = useQuery<
    SuccessResponse<ExternalTransferItem[]>
  >({
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
        { signal },
      ),
  });

  // Últimos 60 dias, dia a dia: cartões (30 dias vs 30 anteriores) e calendário (12 semanas).
  const today = dayjs().format("YYYY-MM-DD");
  const trendFrom = dayjs().subtract(83, "day").format("YYYY-MM-DD");
  const trendQuery = useQuery<SuccessResponse<FlowPoint[]>>({
    queryKey: ["analytics", profileScopeKey, "flow-trend", trendFrom, today, scope],
    queryFn: ({ signal }) =>
      api.getAnalyticsFlow(
        { date_from: trendFrom, date_to: today, scope, bucket: "day" },
        { signal },
      ),
  });

  const stockItemsQuery = useQuery<SuccessResponse<StockItemOverview[]>>({
    queryKey: ["analytics", profileScopeKey, "stock-items", scope],
    queryFn: ({ signal }) => api.getAnalyticsStockItems({ days: 90, scope }, { signal }),
  });

  const natureQuery = useQuery<SuccessResponse<MovementNatureTotal[]>>({
    queryKey: ["analytics", profileScopeKey, "by-nature", dateFrom, dateTo, scope, natureTipo],
    queryFn: ({ signal }) =>
      api.getAnalyticsMovementsByNature(
        { date_from: dateFrom, date_to: dateTo, tipo: natureTipo, scope },
        { signal },
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
        stockoutRiskQuery.error,
        externalTransfersQuery.error,
        trendQuery.error,
        stockItemsQuery.error,
        natureQuery.error,
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
      stockoutRiskQuery.error,
      externalTransfersQuery.error,
      trendQuery.error,
      stockItemsQuery.error,
      natureQuery.error,
    ],
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
  const flow = useMemo(() => flowQuery.data?.data ?? [], [flowQuery.data]);
  const evolution = useMemo(() => evolutionQuery.data?.data ?? [], [evolutionQuery.data]);
  const recentStockouts = recentStockoutsQuery.data?.data ?? [];
  const stockoutRisk = stockoutRiskQuery.data?.data ?? [];
  const externalTransfers = externalTransfersQuery.data?.data ?? [];
  const stockItems = useMemo(() => stockItemsQuery.data?.data ?? [], [stockItemsQuery.data]);
  const natureItems = natureQuery.data?.data ?? [];

  const trendDays = useMemo(
    () => fillDays(trendQuery.data?.data ?? [], trendFrom, today),
    [trendQuery.data, trendFrom, today],
  );
  const brandRows = useMemo(() => groupByBrandVersion(stockItems), [stockItems]);
  const balance = useMemo(
    () =>
      buildBalanceSeries(
        flow,
        evolution,
        periodMode,
        dateFrom,
        dateTo,
        today,
        summary?.total_geral ?? null,
      ),
    [flow, evolution, periodMode, dateFrom, dateTo, today, summary?.total_geral],
  );

  // Cartões com tendência: últimos 30 dias contra os 30 anteriores.
  const kpis = useMemo(() => {
    const last30 = trendDays.slice(-30);
    const prev30 = trendDays.slice(-60, -30);
    const cumulative = (values: number[]) => {
      let acc = 0;
      return values.map((value) => (acc += value));
    };
    const currentTotal =
      scope !== null
        ? (summary?.locations.find((l) => l.location_id === scope)?.total ?? 0)
        : (summary?.total_geral ?? 0);
    const stockLine = stockBackward(currentTotal, trendDays).slice(-30);
    const saidas = sum(last30.map((d) => d.saidas));
    const entradas = sum(last30.map((d) => d.entradas));
    return {
      stockLine,
      stockDelta: percentChange(currentTotal, stockLine[0] ?? 0),
      saidas,
      saidasLine: cumulative(last30.map((d) => d.saidas)),
      saidasDelta: percentChange(saidas, sum(prev30.map((d) => d.saidas))),
      entradas,
      entradasLine: cumulative(last30.map((d) => d.entradas)),
      entradasDelta: percentChange(entradas, sum(prev30.map((d) => d.entradas))),
    };
  }, [trendDays, summary, scope]);

  const summaryCards = useMemo<SummaryCard[]>(() => {
    if (!summary || !summary.locations) return [];

    const zeroCard: SummaryCard = {
      label: "Itens sem estoque",
      value: summary.zerados ?? 0,
      hint: "Produtos com saldo zero",
      icon: <IconPackageOff size={16} stroke={1.5} />,
    };
    const withStock = stockItems.length;
    const catalogTotal = withStock + (summary.zerados ?? 0);
    const share = catalogTotal > 0 ? (withStock / catalogTotal) * 100 : 0;
    const productsCard: SummaryCard = {
      label: "Produtos com saldo",
      value: withStock,
      hint: `de ${catalogTotal.toLocaleString("pt-BR")} cadastrados · ${share.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% com peça na prateleira`,
      footer: (
        <div className="inline-bar" role="img" aria-label={`${share.toFixed(1)}% do cadastro com saldo`}>
          <span style={{ width: `${Math.max(share, 1)}%`, background: chart.accent }} />
        </div>
      ),
    };
    const activityCards: SummaryCard[] = [
      productsCard,
      {
        label: "Saídas em 30 dias",
        value: kpis.saidas,
        trend: kpis.saidasLine,
        trendColor: chart.semantic.outflow,
        delta:
          kpis.saidasDelta === null
            ? null
            : { percent: kpis.saidasDelta, label: "vs 30 dias antes" },
      },
      {
        label: "Entradas em 30 dias",
        value: kpis.entradas,
        trend: kpis.entradasLine,
        trendColor: chart.semantic.inflow,
        delta:
          kpis.entradasDelta === null
            ? null
            : { percent: kpis.entradasDelta, label: "vs 30 dias antes" },
      },
    ];

    if (scope !== null) {
      const location = summary.locations.find((l) => l.location_id === scope);
      return [
        {
          label: `Estoque em ${location ? location.location_name : "local"}`,
          value: location ? location.total : summary.total_geral,
          accent: location ? colorFor(location.location_name) : undefined,
          hint: "Unidades disponíveis",
          trend: kpis.stockLine,
          trendColor: location ? colorFor(location.location_name) : chart.accent,
        },
        ...activityCards,
        zeroCard,
      ];
    }

    if (!multiLocation) {
      return [
        {
          label: "Unidades em estoque",
          value: summary.total_geral,
          trend: kpis.stockLine,
          trendColor: chart.accent,
          delta: kpis.stockDelta === null ? null : { percent: kpis.stockDelta, label: "em 30 dias" },
        },
        ...activityCards,
      ];
    }

    const cards: SummaryCard[] = summary.locations.map((loc) => ({
      label: loc.location_name,
      value: loc.total,
      accent: colorFor(loc.location_name),
      hint: "Unidades em estoque",
    }));

    cards.push(
      {
        label: "Total geral",
        value: summary.total_geral,
        hint: "Todas as filiais",
        trend: kpis.stockLine,
        trendColor: chart.accent,
        delta: kpis.stockDelta === null ? null : { percent: kpis.stockDelta, label: "em 30 dias" },
      },
      ...activityCards,
      zeroCard,
    );

    return cards;
  }, [chart, colorFor, kpis, multiLocation, scope, stockItems.length, summary]);

  const persistState = useCallback(
    (nextScrollY = scrollY) => {
      saveTabState<DashboardTabState>(DASHBOARD_TAB_ID, {
        scope: selectedScope,
        periodMode,
        selectedDate,
        externalTransferType,
        scrollY: nextScrollY,
      });
    },
    [externalTransferType, periodMode, scrollY, selectedDate, selectedScope],
  );

  useEffect(() => {
    persistState();
  }, [persistState]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
        subtitle="Visão consolidada do estoque e das movimentações no período."
      />

      <div className="toolbar-row">
        {multiLocation ? (
          <SegmentedControl
            value={scope === null ? "AMBOS" : String(scope)}
            onChange={(value) =>
              setScope(value === "AMBOS" ? null : Number(value))
            }
            data={[
              { value: "AMBOS", label: "Todas as filiais" },
              ...locations.map((loc) => ({
                value: String(loc.id),
                label: loc.label || loc.name,
              })),
            ]}
          />
        ) : null}
        <div className="toolbar-spacer" />
        <Text size="xs" c="dimmed" className="num">
          {dayjs(dateFrom).format("DD/MM")} – {dayjs(dateTo).format("DD/MM/YYYY")}
        </Text>
        <SegmentedControl
          value={periodMode}
          onChange={(value) => setPeriodMode(value as PeriodMode)}
          data={[
            { value: "week", label: "Semana" },
            { value: "month", label: "Mês" },
          ]}
        />
        <DatePickerInput
          value={selectedDate}
          onChange={setSelectedDate}
          aria-label="Data base"
          valueFormat="DD/MM/YYYY"
          leftSection={<IconCalendar size={16} stroke={1.5} />}
          w={160}
        />
      </div>

      <div className="stat-grid">
        {summaryQuery.isLoading
          ? Array.from(
              { length: 4 },
              (_, index) => <StatTile key={index} label="Carregando" value="" loading />,
            )
          : summaryCards.map((card) => (
              <StatTile
                key={card.label}
                label={card.label}
                value={card.value}
                hint={card.hint}
                accent={card.accent}
                icon={card.icon}
                trend={card.trend}
                trendColor={card.trendColor}
                delta={card.delta}
                footer={card.footer}
              />
            ))}
      </div>

      <Suspense
        fallback={
          <Card>
            <Group gap="sm">
              <Loader size="sm" />
              <Text size="sm" c="dimmed">
                Carregando gráficos…
              </Text>
            </Group>
          </Card>
        }
      >
        <DashboardVisuals
          scope={scope}
          periodMode={periodMode}
          dateFrom={dateFrom}
          dateTo={dateTo}
          distribution={distribution}
          distributionLoading={distributionQuery.isLoading}
          topSaidas={topSaidas}
          topSaidasLoading={topSaidasQuery.isLoading}
          balance={balance}
          balanceLoading={flowQuery.isLoading || evolutionQuery.isLoading}
          natureItems={natureItems}
          natureLoading={natureQuery.isLoading}
          natureTipo={natureTipo}
          onNatureTipoChange={setNatureTipo}
          stockItems={stockItems}
          stockItemsLoading={stockItemsQuery.isLoading}
          brandRows={brandRows}
          heatDays={trendDays}
          heatLoading={trendQuery.isLoading}
          today={today}
          onShowMonth={periodMode === "week" ? () => setPeriodMode("month") : undefined}
          onOpenProduct={(produtoId, nome) =>
            navigate(`/produtos?search=${encodeURIComponent(nome)}&openId=${produtoId}`)
          }
          onBrandClick={(brand) =>
            navigate(`/produtos?search=${encodeURIComponent(brand === "Outras" ? "" : brand)}`)
          }
          externalTransfers={externalTransfers}
          externalTransfersLoading={externalTransfersQuery.isLoading}
          externalTransferType={externalTransferType}
          onExternalTransferTypeChange={setExternalTransferType}
          showAllExternalTransfers={showAllExternalTransfers}
          onToggleAllExternalTransfers={() =>
            setShowAllExternalTransfers((current) => !current)
          }
          recentStockouts={recentStockouts}
          recentStockoutsLoading={recentStockoutsQuery.isLoading}
          stockoutRisk={stockoutRisk}
          stockoutRiskLoading={stockoutRiskQuery.isLoading}
          multiLocation={multiLocation}
        />
      </Suspense>
    </Stack>
  );
}
