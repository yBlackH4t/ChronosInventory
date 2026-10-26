import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SegmentedControl, Stack, Text } from "@mantine/core";
import { IconCalendar } from "@tabler/icons-react";
import { useNavigate } from "react-router-dom";
import { DatePickerInput } from "@mantine/dates";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import { api } from "../lib/apiClient";
import { loadTabState, saveTabState } from "../state/tabStateCache";
import { useProfileScope } from "../state/profileScope";
import { useLocations } from "../hooks/useLocations";
import PageHeader from "../components/ui/PageHeader";
import { useChartTheme } from "../lib/chartTheme";
import {
  buildBalanceSeries,
  fillDays,
  percentChange,
  stockBackward,
  sum,
  summarizeHealth,
} from "../lib/dashboardMath";
import { actionSummary, buildActionList } from "../lib/dashboardActions";
import { rollingSum } from "../lib/dashboardBento";
import { getAssistantPanel, getStockCountHistory } from "../lib/dashboardApi";
import type {
  FlowPoint,
  MovementOut,
  RecentStockoutItem,
  StockEvolutionPoint,
  StockItemOverview,
  StockSummary,
  StockoutRiskItem,
  SuccessResponse,
  TopSaidaItem,
} from "../lib/api";
import { notifyError } from "../lib/notify";
import KpiTile from "../components/dashboard/bento/KpiTile";
import ActionListBlock from "../components/dashboard/bento/ActionListBlock";
import MovementBlock from "../components/dashboard/bento/MovementBlock";
import HealthBlock from "../components/dashboard/bento/HealthBlock";
import TopSaidasBlock from "../components/dashboard/bento/TopSaidasBlock";
import AssistantBlock from "../components/dashboard/bento/AssistantBlock";
import ActivityBlock from "../components/dashboard/bento/ActivityBlock";
import "../components/dashboard/bento/bento.css";

type Scope = number | null;
type PeriodMode = "week" | "month";
type DashboardTabState = {
  scope: Scope;
  periodMode: PeriodMode;
  selectedDate: string | null;
  scrollY: number;
};

const DASHBOARD_TAB_ID = "dashboard";
const DEFAULT_DASHBOARD_TAB_STATE: DashboardTabState = {
  scope: null,
  periodMode: "week",
  selectedDate: dayjs().format("YYYY-MM-DD"),
  scrollY: 0,
};

/** A atividade ao vivo se atualiza sozinha neste intervalo. */
const LIVE_REFRESH_MS = 20_000;

function getQueryErrorMessage(error: unknown): string | null {
  if (!error) return null;
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Falha ao carregar dados do painel.";
}

export default function DashboardPage() {
  const { profileScopeKey } = useProfileScope();
  const { activeLocations: locations } = useLocations();
  const chart = useChartTheme();
  const navigate = useNavigate();
  const lastErrorToastRef = useRef<string | null>(null);
  const persistedState = useMemo(
    () =>
      loadTabState<DashboardTabState>(DASHBOARD_TAB_ID) ??
      DEFAULT_DASHBOARD_TAB_STATE,
    [],
  );
  const [selectedScope, setScope] = useState<Scope>(persistedState.scope);
  // Com um local só, o filtro de filial não diz nada: tudo vira "todas".
  const multiLocation = locations.length > 1;
  const scope: Scope = multiLocation ? selectedScope : null;
  const [periodMode, setPeriodMode] = useState<PeriodMode>(persistedState.periodMode);
  const [selectedDate, setSelectedDate] = useState<string | null>(persistedState.selectedDate);
  const [scrollY, setScrollY] = useState(persistedState.scrollY);

  const selected = dayjs(selectedDate ?? new Date());
  const unit = periodMode === "week" ? "week" : "month";
  const dateFrom = selected.startOf(unit).format("YYYY-MM-DD");
  const dateTo = selected.endOf(unit).format("YYYY-MM-DD");
  const bucket = periodMode === "week" ? "day" : "week";
  const today = dayjs().format("YYYY-MM-DD");
  // 60 dias, dia a dia: os números do topo comparam 30 dias com os 30 anteriores.
  const trendFrom = dayjs().subtract(59, "day").format("YYYY-MM-DD");

  const scopeLabel =
    scope !== null
      ? (locations.find((l) => l.id === scope)?.label || locations.find((l) => l.id === scope)?.name || "Filial")
      : multiLocation
        ? "Todas as filiais"
        : (locations[0]?.label || locations[0]?.name || "Estoque");
  const periodLabel = periodMode === "week" ? "Semana" : "Mês";
  const periodContext = `${periodLabel} de ${dayjs(dateFrom).format("DD/MM")} a ${dayjs(dateTo).format("DD/MM")} · ${scopeLabel}`;

  const base = ["analytics", profileScopeKey] as const;

  const summaryQuery = useQuery<SuccessResponse<StockSummary>>({
    queryKey: [...base, "stock-summary", scope],
    queryFn: ({ signal }) => api.getAnalyticsStockSummary({ scope }, { signal }),
  });
  const trendQuery = useQuery<SuccessResponse<FlowPoint[]>>({
    queryKey: [...base, "flow-trend", trendFrom, today, scope],
    queryFn: ({ signal }) =>
      api.getAnalyticsFlow({ date_from: trendFrom, date_to: today, scope, bucket: "day" }, { signal }),
  });
  const countsQuery = useQuery({
    queryKey: [...base, "stock-count-history", scope],
    queryFn: ({ signal }) => getStockCountHistory({ days: 30, scope }, signal),
    retry: false,
  });
  const stockItemsQuery = useQuery<SuccessResponse<StockItemOverview[]>>({
    queryKey: [...base, "stock-items", scope],
    queryFn: ({ signal }) => api.getAnalyticsStockItems({ days: 90, scope }, { signal }),
  });
  const recentStockoutsQuery = useQuery<SuccessResponse<RecentStockoutItem[]>>({
    queryKey: [...base, "recent-stockouts", today, scope, 8],
    queryFn: ({ signal }) =>
      api.getAnalyticsRecentStockouts({ days: 30, date_to: today, scope, limit: 8 }, { signal }),
  });
  const stockoutRiskQuery = useQuery<SuccessResponse<StockoutRiskItem[]>>({
    queryKey: [...base, "stockout-risk", scope, 8],
    queryFn: ({ signal }) =>
      api.getAnalyticsStockoutRisk({ days: 30, max_dias: 15, scope, limit: 8 }, { signal }),
  });
  const flowQuery = useQuery<SuccessResponse<FlowPoint[]>>({
    queryKey: [...base, "flow", dateFrom, dateTo, scope, bucket],
    queryFn: ({ signal }) =>
      api.getAnalyticsFlow({ date_from: dateFrom, date_to: dateTo, scope, bucket }, { signal }),
  });
  const evolutionQuery = useQuery<SuccessResponse<StockEvolutionPoint[]>>({
    queryKey: [...base, "stock-evolution", dateFrom, dateTo, scope, bucket],
    queryFn: ({ signal }) =>
      api.getAnalyticsStockEvolution({ date_from: dateFrom, date_to: dateTo, scope, bucket }, { signal }),
  });
  const topSaidasQuery = useQuery<SuccessResponse<TopSaidaItem[]>>({
    queryKey: [...base, "top-saidas", dateFrom, dateTo, scope],
    queryFn: ({ signal }) =>
      api.getAnalyticsTopSaidas({ date_from: dateFrom, date_to: dateTo, scope, limit: 5 }, { signal }),
  });
  // Com filial escolhida, busca mais e filtra aqui (a rota filtra origem OU destino, não os dois).
  const liveQuery = useQuery<SuccessResponse<MovementOut[]>>({
    queryKey: ["movements", "dashboard-live", profileScopeKey, scope],
    queryFn: ({ signal }) =>
      api.listMovements({ page: 1, page_size: scope === null ? 6 : 40, sort: "-data" }, { signal }),
    refetchInterval: LIVE_REFRESH_MS,
  });
  // Sem a rota (backend antigo) ou com erro: o bloco do assistente some, sem aviso.
  const assistantQuery = useQuery({
    queryKey: ["assistant-panel", profileScopeKey],
    queryFn: ({ signal }) => getAssistantPanel(signal),
    retry: false,
    refetchInterval: 60_000,
  });

  const dashboardErrors = [
    summaryQuery.error,
    trendQuery.error,
    stockItemsQuery.error,
    recentStockoutsQuery.error,
    stockoutRiskQuery.error,
    flowQuery.error,
    evolutionQuery.error,
    topSaidasQuery.error,
    liveQuery.error,
  ]
    .map(getQueryErrorMessage)
    .filter((item): item is string => Boolean(item));
  const errorKey = dashboardErrors.join("|");

  useEffect(() => {
    if (!errorKey) {
      lastErrorToastRef.current = null;
      return;
    }
    const errors = errorKey.split("|");
    const combinedMessage =
      errors.length === 1
        ? errors[0]
        : `Falha ao carregar parte do painel (${errors.length} blocos). Primeiro erro: ${errors[0]}`;
    if (lastErrorToastRef.current === combinedMessage) return;
    lastErrorToastRef.current = combinedMessage;
    notifyError(new Error(combinedMessage));
  }, [errorKey]);

  const summary = summaryQuery.data?.data;
  const stockItems = useMemo(() => stockItemsQuery.data?.data ?? [], [stockItemsQuery.data]);
  const health = useMemo(() => summarizeHealth(stockItems), [stockItems]);
  const counts = countsQuery.data;

  const trendDays = useMemo(
    () => fillDays(trendQuery.data?.data ?? [], trendFrom, today),
    [trendQuery.data, trendFrom, today],
  );

  const currentTotal =
    scope !== null
      ? (summary?.locations.find((l) => l.location_id === scope)?.total ?? 0)
      : (summary?.total_geral ?? 0);

  const kpis = useMemo(() => {
    const last30 = trendDays.slice(-30);
    const prev30 = trendDays.slice(-60, -30);
    const stockLine = stockBackward(currentTotal, trendDays).slice(-30);
    const saidas = sum(last30.map((d) => d.saidas));
    const pace = rollingSum(trendDays.map((d) => d.saidas), 7).slice(-30);
    return {
      stockLine,
      stockDelta: percentChange(currentTotal, stockLine[0] ?? 0),
      saidas,
      saidasLine: pace,
      saidasDelta: percentChange(saidas, sum(prev30.map((d) => d.saidas))),
    };
  }, [trendDays, currentTotal]);

  const actionItems = useMemo(
    () =>
      buildActionList({
        stockouts: recentStockoutsQuery.data?.data ?? [],
        risk: stockoutRiskQuery.data?.data ?? [],
        parados: health.parados,
        limit: 8,
      }),
    [recentStockoutsQuery.data, stockoutRiskQuery.data, health.parados],
  );
  const actionsLoading =
    recentStockoutsQuery.isLoading || stockoutRiskQuery.isLoading || stockItemsQuery.isLoading;

  const balance = useMemo(
    () =>
      buildBalanceSeries(
        flowQuery.data?.data ?? [],
        evolutionQuery.data?.data ?? [],
        periodMode,
        dateFrom,
        dateTo,
        today,
        currentTotal,
      ),
    [flowQuery.data, evolutionQuery.data, periodMode, dateFrom, dateTo, today, currentTotal],
  );

  const liveRows = useMemo(() => {
    const rows = liveQuery.data?.data ?? [];
    if (scope === null) return rows.slice(0, 6);
    return rows
      .filter((row) => row.origem_location_id === scope || row.destino_location_id === scope)
      .slice(0, 6);
  }, [liveQuery.data, scope]);

  const locationName = useCallback(
    (id: number | null | undefined) => {
      if (id === null || id === undefined || !multiLocation) return null;
      const loc = locations.find((l) => l.id === id);
      return loc ? loc.label || loc.name : null;
    },
    [locations, multiLocation],
  );

  const openProduct = useCallback(
    (produtoId: number, nome: string) =>
      navigate(`/produtos?search=${encodeURIComponent(nome)}&openId=${produtoId}`),
    [navigate],
  );
  const showMonth = periodMode === "week" ? () => setPeriodMode("month") : undefined;

  const persistState = useCallback(
    (nextScrollY = scrollY) => {
      saveTabState<DashboardTabState>(DASHBOARD_TAB_ID, {
        scope: selectedScope,
        periodMode,
        selectedDate,
        scrollY: nextScrollY,
      });
    },
    [periodMode, scrollY, selectedDate, selectedScope],
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

  const catalogTotal = counts?.length
    ? counts[counts.length - 1].com_saldo + counts[counts.length - 1].zerados
    : stockItems.length + (summary?.zerados ?? 0);
  const withStock = stockItems.length;
  const zerados = summary?.zerados ?? 0;
  const soldOut = recentStockoutsQuery.data?.data.length ?? 0;
  const assistant = assistantQuery.data;

  return (
    <Stack gap="lg" className="bento">
      <PageHeader
        title="Painel"
        subtitle={
          actionsLoading
            ? "Visão do estoque e do que pede ação hoje."
            : `${actionSummary(actionItems.length)} · ${scopeLabel}`
        }
      />

      <div className="toolbar-row">
        {multiLocation ? (
          <SegmentedControl
            value={scope === null ? "AMBOS" : String(scope)}
            onChange={(value) => setScope(value === "AMBOS" ? null : Number(value))}
            data={[
              { value: "AMBOS", label: "Todas as filiais" },
              ...locations.map((loc) => ({ value: String(loc.id), label: loc.label || loc.name })),
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

      <div className="bento-kpis">
        <KpiTile
          index={0}
          label={scope !== null ? `Unidades em ${scopeLabel}` : "Unidades em estoque"}
          value={currentTotal}
          loading={summaryQuery.isLoading}
          trend={trendQuery.isLoading ? undefined : kpis.stockLine}
          trendColor={chart.accent}
          trendLabel="Saldo dos últimos 30 dias"
          delta={
            kpis.stockDelta === null ? null : { percent: kpis.stockDelta, label: "em 30 dias", upIsGood: true }
          }
        />
        <KpiTile
          index={1}
          label="Saídas em 30 dias"
          value={kpis.saidas}
          loading={trendQuery.isLoading}
          trend={kpis.saidasLine}
          trendColor={chart.semantic.outflow}
          trendLabel="Ritmo de saídas (soma de 7 dias) nos últimos 30 dias"
          delta={
            kpis.saidasDelta === null
              ? null
              : { percent: kpis.saidasDelta, label: "vs 30 dias antes", upIsGood: true }
          }
        />
        <KpiTile
          index={2}
          label="Produtos com estoque"
          value={withStock}
          loading={stockItemsQuery.isLoading}
          hint={`de ${catalogTotal.toLocaleString("pt-BR")} produtos ativos`}
          trend={counts?.map((p) => p.com_saldo)}
          trendColor={chart.semantic.ok}
          trendLabel="Produtos com estoque nos últimos 30 dias"
        />
        <KpiTile
          index={3}
          label="Zerados"
          value={zerados}
          loading={summaryQuery.isLoading}
          hint={
            recentStockoutsQuery.isLoading
              ? undefined
              : soldOut === 0
                ? "nenhum vendeu nos últimos 30 dias"
                : `${soldOut >= 8 ? "8 ou mais" : soldOut} ${soldOut === 1 ? "vendeu" : "venderam"} nos últimos 30 dias`
          }
          trend={counts?.map((p) => p.zerados)}
          trendColor={chart.semantic.crit}
          trendLabel="Produtos zerados nos últimos 30 dias"
        />
      </div>

      <div className="bento-grid" data-assistant={assistant ? "on" : "off"}>
        <ActionListBlock
          items={actionItems}
          loading={actionsLoading}
          subtitle={`Zerados que venderam, perto de zerar e parados que mais ocupam · ${scopeLabel}`}
          onOpenProduct={openProduct}
        />
        <HealthBlock
          counts={health.counts}
          loading={stockItemsQuery.isLoading}
          subtitle={`${withStock.toLocaleString("pt-BR")} produtos com estoque, pela última saída · ${scopeLabel}`}
        />
        {assistant ? <AssistantBlock data={assistant} onOpenAssistant={() => navigate("/assistente")} /> : null}
        <MovementBlock
          data={balance}
          loading={flowQuery.isLoading || evolutionQuery.isLoading}
          periodMode={periodMode}
          subtitle={periodContext}
          onShowMonth={showMonth}
        />
        <TopSaidasBlock
          items={topSaidasQuery.data?.data ?? []}
          loading={topSaidasQuery.isLoading}
          subtitle={periodContext}
          onShowMonth={showMonth}
          onOpenProduct={openProduct}
        />
        <ActivityBlock
          rows={liveRows}
          loading={liveQuery.isLoading}
          locationName={locationName}
          onOpenProduct={openProduct}
        />
      </div>
    </Stack>
  );
}
