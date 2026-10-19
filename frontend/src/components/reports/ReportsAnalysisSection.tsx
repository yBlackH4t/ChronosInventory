import { useMemo, useState } from "react";
import { SegmentedControl, SimpleGrid, Stack, Text } from "@mantine/core";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";

import { api } from "../../lib/apiClient";
import { useLocations } from "../../hooks/useLocations";
import { useProfileScope } from "../../state/profileScope";
import { fillDays, groupByBrandVersion } from "../../lib/dashboardMath";
import {
  ActivityHeatmap,
  BrandVersionPanel,
  DistributionPanel,
  ExternalTransfersPanel,
  NaturePanel,
} from "./AnalysisPanels";

type Days = "30" | "90";

// Relatórios > Análises: os gráficos que saíram do Painel na 2.6.1 (o Painel ficou só com
// o que pede ação). Tem o próprio filtro de filial e de período.
export default function ReportsAnalysisSection() {
  const { profileScopeKey } = useProfileScope();
  const { activeLocations: locations } = useLocations();
  const navigate = useNavigate();
  const multiLocation = locations.length > 1;
  const [selectedScope, setScope] = useState<number | null>(null);
  const scope = multiLocation ? selectedScope : null;
  const [days, setDays] = useState<Days>("30");
  const [natureTipo, setNatureTipo] = useState<"SAIDA" | "ENTRADA">("SAIDA");
  const [transferTipo, setTransferTipo] = useState<"SAIDA" | "ENTRADA">("SAIDA");

  const today = dayjs().format("YYYY-MM-DD");
  const dateFrom = dayjs().subtract(Number(days) - 1, "day").format("YYYY-MM-DD");
  const heatFrom = dayjs().subtract(83, "day").format("YYYY-MM-DD");
  const scopeLabel =
    scope !== null
      ? (locations.find((l) => l.id === scope)?.label || locations.find((l) => l.id === scope)?.name || "Filial")
      : multiLocation
        ? "Todas as filiais"
        : (locations[0]?.label || locations[0]?.name || "Estoque");
  const periodContext = `Últimos ${days} dias · ${scopeLabel}`;
  const base = ["analytics", profileScopeKey] as const;

  const distributionQuery = useQuery({
    queryKey: [...base, "stock-distribution", null],
    queryFn: ({ signal }) => api.getAnalyticsStockDistribution({ scope: null }, { signal }),
    enabled: multiLocation,
  });
  const natureQuery = useQuery({
    queryKey: [...base, "by-nature", dateFrom, today, scope, natureTipo],
    queryFn: ({ signal }) =>
      api.getAnalyticsMovementsByNature({ date_from: dateFrom, date_to: today, tipo: natureTipo, scope }, { signal }),
  });
  const stockItemsQuery = useQuery({
    queryKey: [...base, "stock-items", scope],
    queryFn: ({ signal }) => api.getAnalyticsStockItems({ days: 90, scope }, { signal }),
  });
  const heatQuery = useQuery({
    queryKey: [...base, "flow-trend", heatFrom, today, scope],
    queryFn: ({ signal }) =>
      api.getAnalyticsFlow({ date_from: heatFrom, date_to: today, scope, bucket: "day" }, { signal }),
  });
  const transfersQuery = useQuery({
    queryKey: [...base, "external-transfers", dateFrom, today, scope, transferTipo],
    queryFn: ({ signal }) =>
      api.getAnalyticsExternalTransfers(
        { date_from: dateFrom, date_to: today, scope, tipo: transferTipo, limit: 15 },
        { signal },
      ),
  });

  const brandRows = useMemo(() => groupByBrandVersion(stockItemsQuery.data?.data ?? []), [stockItemsQuery.data]);
  const heatDays = useMemo(() => fillDays(heatQuery.data?.data ?? [], heatFrom, today), [heatQuery.data, heatFrom, today]);

  return (
    <Stack gap="md">
      <div className="toolbar-row">
        <Text size="sm" c="dimmed">
          Gráficos do estoque e das movimentações (saíram do Painel para ele mostrar só o que pede ação).
        </Text>
        <div className="toolbar-spacer" />
        {multiLocation ? (
          <SegmentedControl
            size="xs"
            value={scope === null ? "AMBOS" : String(scope)}
            onChange={(value) => setScope(value === "AMBOS" ? null : Number(value))}
            data={[
              { value: "AMBOS", label: "Todas as filiais" },
              ...locations.map((loc) => ({ value: String(loc.id), label: loc.label || loc.name })),
            ]}
          />
        ) : null}
        <SegmentedControl
          size="xs"
          value={days}
          onChange={(value) => setDays(value as Days)}
          data={[
            { value: "30", label: "30 dias" },
            { value: "90", label: "90 dias" },
          ]}
        />
      </div>

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md">
        <NaturePanel
          items={natureQuery.data?.data ?? []}
          loading={natureQuery.isLoading}
          tipo={natureTipo}
          onTipoChange={setNatureTipo}
          subtitle={periodContext}
        />
        <BrandVersionPanel
          rows={brandRows}
          loading={stockItemsQuery.isLoading}
          subtitle={`Hoje · ${scopeLabel}`}
          onBrandClick={(brand) =>
            navigate(`/produtos?search=${encodeURIComponent(brand === "Outras" ? "" : brand)}`)
          }
        />
        <ActivityHeatmap days={heatDays} loading={heatQuery.isLoading} end={today} subtitle={scopeLabel} />
        {multiLocation ? (
          <DistributionPanel distribution={distributionQuery.data?.data} loading={distributionQuery.isLoading} />
        ) : null}
      </SimpleGrid>

      <ExternalTransfersPanel
        items={transfersQuery.data?.data ?? []}
        loading={transfersQuery.isLoading}
        tipo={transferTipo}
        onTipoChange={setTransferTipo}
        subtitle={periodContext}
      />
    </Stack>
  );
}
