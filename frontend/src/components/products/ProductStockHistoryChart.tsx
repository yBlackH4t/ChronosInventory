import { Skeleton, Stack, Text } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { api } from "../../lib/apiClient";
import { useChartTheme } from "../../lib/chartTheme";
import type { ProductStockHistoryPoint } from "../../lib/api";

type DotProps = { cx?: number; cy?: number; payload?: ProductStockHistoryPoint };

// Saldo do produto nos últimos 6 meses, em degraus: verde onde entrou, laranja onde saiu.
export default function ProductStockHistoryChart({ productId }: { productId: number }) {
  const chart = useChartTheme();
  const query = useQuery({
    queryKey: ["produto-saldo-historico", productId],
    queryFn: ({ signal }) => api.getProductStockHistory(productId, { days: 180 }, { signal }),
    staleTime: 60_000,
  });
  const points = query.data?.data ?? [];
  const moved = points.some((p) => p.entradas > 0 || p.saidas > 0);

  if (query.isLoading) return <Skeleton h={110} radius="md" />;
  if (!moved) {
    return (
      <Text size="xs" c="dimmed">
        Sem entradas nem saídas nos últimos 6 meses.
      </Text>
    );
  }

  const data = points.map((p) => ({ ...p, ts: dayjs(p.date).valueOf() }));
  const renderDot = ({ cx, cy, payload }: DotProps) => {
    if (cx === undefined || cy === undefined || !payload) return <g key={`${cx}-${cy}`} />;
    if (!payload.entradas && !payload.saidas) return <g key={payload.date} />;
    const color = payload.entradas >= payload.saidas ? chart.semantic.inflow : chart.semantic.outflow;
    return <circle key={payload.date} cx={cx} cy={cy} r={3.5} fill={color} stroke="var(--surface)" strokeWidth={1.5} />;
  };

  return (
    <Stack gap={4}>
      <Text size="xs" c="dimmed">
        Saldo nos últimos 6 meses
      </Text>
      <div style={{ width: "100%", height: 110 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={chart.grid} />
            <XAxis
              dataKey="ts"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(value: number) => dayjs(value).format("MMM")}
              tick={chart.tick}
              axisLine={false}
              tickLine={false}
              minTickGap={24}
            />
            <YAxis
              allowDecimals={false}
              width="auto"
              tick={chart.tick}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              {...chart.tooltip}
              labelFormatter={(value) => dayjs(Number(value)).format("DD/MM/YYYY")}
              formatter={(value, _name, item) => {
                const p = (item as { payload?: ProductStockHistoryPoint } | undefined)?.payload;
                const moves = p ? [p.entradas ? `+${p.entradas}` : "", p.saidas ? `−${p.saidas}` : ""].filter(Boolean).join(" ") : "";
                return [`${value}${moves ? ` (${moves})` : ""}`, "Saldo"];
              }}
            />
            <Line
              type="stepAfter"
              dataKey="saldo"
              stroke={chart.accent}
              strokeWidth={2}
              dot={renderDot}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Stack>
  );
}
