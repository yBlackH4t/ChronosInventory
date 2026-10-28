import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SegmentedControl, Stack } from "@mantine/core";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import { api } from "../lib/apiClient";
import { loadTabState, saveTabState } from "../state/tabStateCache";
import { useProfileScope } from "../state/profileScope";
import { useLocations } from "../hooks/useLocations";
import PageHeader from "../components/ui/PageHeader";
import { fillDays, percentChange, sum, summarizeHealth } from "../lib/dashboardMath";
import { actionSummary, buildActionList } from "../lib/dashboardActions";
import { robotStatus } from "../lib/dashboardBento";
import {
  backupLine,
  certificateLine,
  flowBars,
  officialBaseLine,
  type FlowRange,
  type SystemLine,
} from "../lib/commandCenter";
import { getAssistantPanel } from "../lib/dashboardApi";
import type {
  FlowPoint,
  MovementOut,
  RecentStockoutItem,
  StockItemOverview,
  StockSummary,
  StockoutRiskItem,
  SuccessResponse,
} from "../lib/api";
import { notifyError } from "../lib/notify";
import SystemsBlock from "../components/dashboard/command/SystemsBlock";
import HealthCore from "../components/dashboard/command/HealthCore";
import AlertsBlock from "../components/dashboard/command/AlertsBlock";
import LiveTicker from "../components/dashboard/command/LiveTicker";
import FlowChart from "../components/dashboard/command/FlowChart";
import LiveClock from "../components/dashboard/command/LiveClock";
import "../components/dashboard/command/command.css";

type Scope = number | null;
type DashboardTabState = {
  scope: Scope;
  flowRange: FlowRange;
  scrollY: number;
};

const DASHBOARD_TAB_ID = "dashboard";
const DEFAULT_DASHBOARD_TAB_STATE: DashboardTabState = {
  scope: null,
  flowRange: "90",
  scrollY: 0,
};

/** A faixa ao vivo se atualiza sozinha neste intervalo. */
const LIVE_REFRESH_MS = 20_000;
/** Sistemas (backup, base, certificado) mudam devagar. */
const SYSTEMS_REFRESH_MS = 120_000;

function getQueryErrorMessage(error: unknown): string | null {
  if (!error) return null;
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Falha ao carregar dados do painel.";
}

export default function DashboardPage() {
  const { profileScopeKey } = useProfileScope();
  const { activeLocations: locations } = useLocations();
  const navigate = useNavigate();
  const lastErrorToastRef = useRef<string | null>(null);
  const persistedState = useMemo(
    () => ({
      ...DEFAULT_DASHBOARD_TAB_STATE,
      ...(loadTabState<Partial<DashboardTabState>>(DASHBOARD_TAB_ID) ?? {}),
    }),
    [],
  );
  const [selectedScope, setScope] = useState<Scope>(persistedState.scope);
  // Com um local só, o filtro de filial não diz nada: tudo vira "todas".
  const multiLocation = locations.length > 1;
  const scope: Scope = multiLocation ? selectedScope : null;
  const [flowRange, setFlowRange] = useState<FlowRange>(persistedState.flowRange);
  const [scrollY, setScrollY] = useState(persistedState.scrollY);

  const today = dayjs().format("YYYY-MM-DD");
  // 90 dias, dia a dia: o gráfico de baixo e os números do mês (30 contra os 30 anteriores).
  const trendFrom = dayjs().subtract(89, "day").format("YYYY-MM-DD");
  const yearFrom = dayjs().subtract(364, "day").format("YYYY-MM-DD");

  const scopeLabel =
    scope !== null
      ? (locations.find((l) => l.id === scope)?.label || locations.find((l) => l.id === scope)?.name || "Filial")
      : multiLocation
        ? "Todas as filiais"
        : (locations[0]?.label || locations[0]?.name || "Estoque");

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
  // O ano só é buscado quando alguém escolhe "12 meses".
  const yearQuery = useQuery<SuccessResponse<FlowPoint[]>>({
    queryKey: [...base, "flow-year", yearFrom, today, scope],
    queryFn: ({ signal }) =>
      api.getAnalyticsFlow({ date_from: yearFrom, date_to: today, scope, bucket: "day" }, { signal }),
    enabled: flowRange === "365",
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
  // Com filial escolhida, busca mais e filtra aqui (a rota filtra origem OU destino, não os dois).
  const liveQuery = useQuery<SuccessResponse<MovementOut[]>>({
    queryKey: ["movements", "dashboard-live", profileScopeKey, scope],
    queryFn: ({ signal }) =>
      api.listMovements({ page: 1, page_size: scope === null ? 10 : 40, sort: "-data" }, { signal }),
    refetchInterval: LIVE_REFRESH_MS,
  });
  // Sem a rota (backend antigo) ou com erro: a linha do WhatsApp some, sem aviso.
  const assistantQuery = useQuery({
    queryKey: ["assistant-panel", profileScopeKey],
    queryFn: ({ signal }) => getAssistantPanel(signal),
    retry: false,
    refetchInterval: 60_000,
  });
  // Coluna "Sistemas": se uma rota falhar, a linha dela mostra "sem informação".
  const healthQuery = useQuery({
    queryKey: ["system", "health"],
    queryFn: ({ signal }) => api.health({ signal }),
    retry: false,
    refetchInterval: SYSTEMS_REFRESH_MS,
  });
  const backupQuery = useQuery({
    queryKey: ["system", "backup-list", profileScopeKey],
    queryFn: ({ signal }) => api.backupList({ signal }),
    retry: false,
    refetchInterval: SYSTEMS_REFRESH_MS,
  });
  const baseQuery = useQuery({
    queryKey: ["system", "official-base", profileScopeKey],
    queryFn: ({ signal }) => api.officialBaseStatus({ signal }),
    retry: false,
    refetchInterval: SYSTEMS_REFRESH_MS,
  });
  const nfeConfigQuery = useQuery({
    queryKey: ["system", "nfe-config"],
    queryFn: ({ signal }) => api.getNfeConfig({ signal }),
    retry: false,
    refetchInterval: SYSTEMS_REFRESH_MS,
  });

  const dashboardErrors = [
    summaryQuery.error,
    trendQuery.error,
    stockItemsQuery.error,
    recentStockoutsQuery.error,
    stockoutRiskQuery.error,
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

  const trendDays = useMemo(
    () => fillDays(trendQuery.data?.data ?? [], trendFrom, today),
    [trendQuery.data, trendFrom, today],
  );
  const yearDays = useMemo(
    () => fillDays(yearQuery.data?.data ?? [], yearFrom, today),
    [yearQuery.data, yearFrom, today],
  );

  const currentTotal =
    scope !== null
      ? (summary?.locations.find((l) => l.location_id === scope)?.total ?? 0)
      : (summary?.total_geral ?? 0);

  const saidas30 = sum(trendDays.slice(-30).map((d) => d.saidas));
  const saidasDelta = percentChange(saidas30, sum(trendDays.slice(-60, -30).map((d) => d.saidas)));

  const actionItems = useMemo(
    () =>
      buildActionList({
        stockouts: recentStockoutsQuery.data?.data ?? [],
        risk: stockoutRiskQuery.data?.data ?? [],
        parados: health.parados,
        limit: 9,
      }),
    [recentStockoutsQuery.data, stockoutRiskQuery.data, health.parados],
  );
  const actionsLoading =
    recentStockoutsQuery.isLoading || stockoutRiskQuery.isLoading || stockItemsQuery.isLoading;

  const bars = useMemo(
    () => flowBars(flowRange === "365" ? yearDays : trendDays, flowRange),
    [flowRange, yearDays, trendDays],
  );

  const assistant = assistantQuery.data;
  const systems = useMemo(() => {
    const lines: SystemLine[] = [
      healthQuery.data
        ? { label: "Chronos", detail: `versão ${healthQuery.data.data.version} respondendo`, tone: "ok" }
        : { label: "Chronos", detail: healthQuery.isError ? "sem resposta" : "verificando…", tone: healthQuery.isError ? "danger" : "neutral" },
    ];
    if (assistant) {
      const robot = robotStatus(assistant.whatsapp_estado, assistant.whatsapp_ativo);
      lines.push({
        label: "WhatsApp",
        detail: `${robot.label.replace("Robô do WhatsApp ", "").replace("WhatsApp ", "")} · ${assistant.perguntas_hoje} ${assistant.perguntas_hoje === 1 ? "pergunta" : "perguntas"} hoje`,
        tone: robot.tone === "success" ? "ok" : robot.tone === "warning" ? "warn" : robot.tone === "danger" ? "danger" : "neutral",
      });
      const pending = assistant.para_revisar + assistant.rascunhos;
      lines.push({
        label: "Assistente",
        detail: pending === 0 ? "nada para revisar" : `${pending} para revisar`,
        tone: pending === 0 ? "ok" : "warn",
      });
    }
    lines.push(officialBaseLine(baseQuery.data?.data));
    lines.push(certificateLine(nfeConfigQuery.data?.data));
    lines.push(backupLine(backupQuery.data?.data));
    return lines;
  }, [healthQuery.data, healthQuery.isError, assistant, baseQuery.data, nfeConfigQuery.data, backupQuery.data]);
  const systemsLoading = healthQuery.isLoading && backupQuery.isLoading;

  const liveRows = useMemo(() => {
    const rows = liveQuery.data?.data ?? [];
    if (scope === null) return rows.slice(0, 10);
    return rows
      .filter((row) => row.origem_location_id === scope || row.destino_location_id === scope)
      .slice(0, 10);
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

  const persistState = useCallback(
    (nextScrollY = scrollY) => {
      saveTabState<DashboardTabState>(DASHBOARD_TAB_ID, {
        scope: selectedScope,
        flowRange,
        scrollY: nextScrollY,
      });
    },
    [flowRange, scrollY, selectedScope],
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

  const zerados = summary?.zerados ?? 0;

  return (
    <Stack gap="lg" className="cc">
      <PageHeader
        title="Painel"
        subtitle={
          actionsLoading
            ? "Centro de comando do estoque."
            : `${actionSummary(actionItems.length)} · ${scopeLabel}`
        }
      />

      <div className="cc-toolbar">
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
        <span className="cc-clock">
          <LiveClock />
          {"  ·  ao vivo a cada 20 s"}
        </span>
      </div>

      <div className="cc-grid">
        <SystemsBlock lines={systems} loading={systemsLoading} />
        <HealthCore
          counts={health.counts}
          total={currentTotal}
          totalLabel={scope !== null ? `unidades em ${scopeLabel}` : "unidades em estoque"}
          saidas={trendDays.slice(-60).map((d) => d.saidas)}
          loading={summaryQuery.isLoading || stockItemsQuery.isLoading}
          kpis={[
            { label: "saídas em 30 dias", value: saidas30 },
            ...(saidasDelta === null
              ? []
              : [
                  {
                    label: "vs 30 dias antes",
                    value: saidasDelta,
                    suffix: "%",
                    signed: true,
                    tone: saidasDelta >= 0 ? ("ok" as const) : ("warn" as const),
                  },
                ]),
            { label: "zerados", value: zerados },
            { label: actionItems.length === 1 ? "pede ação" : "pedem ação", value: actionItems.length },
          ]}
        />
        <AlertsBlock items={actionItems} loading={actionsLoading} onOpenProduct={openProduct} />
        <LiveTicker rows={liveRows} locationName={locationName} onOpenProduct={openProduct} />
        <FlowChart
          bars={bars}
          range={flowRange}
          onRange={setFlowRange}
          saldo={currentTotal}
          loading={trendQuery.isLoading || (flowRange === "365" && yearQuery.isLoading)}
        />
      </div>
    </Stack>
  );
}
