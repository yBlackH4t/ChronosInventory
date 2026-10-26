import type { ReactNode } from "react";
import { Badge, Skeleton } from "@mantine/core";
import AnimatedNumber from "../../ui/AnimatedNumber";
import dayjs from "dayjs";
import { trackCursorGlow } from "../../../lib/cursorGlow";
import DrawnSparkline from "./DrawnSparkline";

export type KpiDelta = {
  percent: number;
  label: string;
  /** Subir é bom? Define verde ou laranja (zerados: subir é ruim). */
  upIsGood: boolean;
};

type KpiTileProps = {
  label: string;
  value: number;
  hint?: ReactNode;
  trend?: number[];
  trendColor: string;
  trendLabel?: string;
  delta?: KpiDelta | null;
  loading?: boolean;
  index: number;
};

function DeltaBadge({ delta }: { delta: KpiDelta }) {
  const flat = delta.percent === 0;
  const up = delta.percent > 0;
  const good = up === delta.upIsGood;
  return (
    <Badge
      size="sm"
      variant="light"
      color={flat ? "gray" : good ? "success" : "warning"}
      tt="none"
      className="num"
      style={{ flexShrink: 0 }}
    >
      {flat ? "=" : up ? "▲" : "▼"} {Math.abs(delta.percent)}% {delta.label}
    </Badge>
  );
}

// Número do topo do Painel: rola até o valor e a linha dos últimos 30 dias se desenha.
export default function KpiTile({
  label,
  value,
  hint,
  trend,
  trendColor,
  trendLabel,
  delta,
  loading = false,
  index,
}: KpiTileProps) {
  return (
    <div className="stat-tile bento-kpi mi-glow" onPointerMove={trackCursorGlow}>
      <span className="bento-kpi-label">{label}</span>
      {loading ? (
        <Skeleton h={34} w="55%" mt={4} radius="sm" />
      ) : (
        <span className="bento-kpi-value">
          <AnimatedNumber value={value} />
        </span>
      )}
      {delta && !loading ? (
        <div>
          <DeltaBadge delta={delta} />
        </div>
      ) : null}
      {hint && !loading ? <span className="bento-kpi-hint">{hint}</span> : null}
      <div className="bento-kpi-trend">
        {trend && trend.length > 1 && !loading ? (
          <DrawnSparkline
            values={trend}
            color={trendColor}
            label={trendLabel}
            delay={0.1 + index * 0.08}
            pointLabel={(point, pointValue) =>
              `${dayjs()
                .subtract(trend.length - 1 - point, "day")
                .format("DD/MM")}: ${pointValue.toLocaleString("pt-BR")}`
            }
          />
        ) : (
          <div style={{ height: 36 }} />
        )}
      </div>
    </div>
  );
}
