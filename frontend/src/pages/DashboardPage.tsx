import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Card,
  Grid,
  Group,
  Loader,
  Skeleton,
  Stack,
  Text,
  SegmentedControl,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";

import { api } from "../lib/apiClient";
import { loadTabState, saveTabState } from "../state/tabStateCache";
import { useProfileScope } from "../state/profileScope";
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

const DashboardVisuals = lazy(() => import("../components/dashboard/DashboardVisuals"));

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

const DASHBOARD_TAB_ID = "dashboard";
const DEFAULT_DASHBOARD_TAB_STATE: DashboardTabState = {
  scope: "AMBOS",
  periodMode: "week",
  selectedDate: dayjs().format("YYYY-MM-DD"),
  externalTransferType: "SAIDA",
  scrollY: 0,
};

type SummaryCard = {
  label: string;
  value: number;
  color: string;
};

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

      <Suspense
        fallback={
          <Card withBorder>
            <Group gap="sm">
              <Loader size="sm" />
              <Text size="sm" c="dimmed">
                Carregando blocos visuais do dashboard...
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
          flow={flow}
          flowLoading={flowQuery.isLoading}
          evolution={evolution}
          evolutionLoading={evolutionQuery.isLoading}
          externalTransfers={externalTransfers}
          externalTransfersLoading={externalTransfersQuery.isLoading}
          externalTransferType={externalTransferType}
          onExternalTransferTypeChange={setExternalTransferType}
          showAllExternalTransfers={showAllExternalTransfers}
          onToggleAllExternalTransfers={() => setShowAllExternalTransfers((current) => !current)}
          recentStockouts={recentStockouts}
          recentStockoutsLoading={recentStockoutsQuery.isLoading}
        />
      </Suspense>
    </Stack>
  );
}
