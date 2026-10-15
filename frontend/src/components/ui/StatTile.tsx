import type { ReactNode } from "react";
import { Badge, Group, Skeleton, Text, UnstyledButton } from "@mantine/core";
import AnimatedNumber from "./AnimatedNumber";
import Sparkline from "./Sparkline";

export type StatDelta = {
  /** Variação em %, já arredondada. */
  percent: number;
  /** Texto curto depois do número, ex.: "vs 30 dias antes". */
  label: string;
  /** Subir é bom (entradas) ou só informativo? Define verde/laranja. */
  upIsGood?: boolean;
};

type StatTileProps = {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  /** Small colored mark that ties the tile to a chart series or status. */
  accent?: string;
  loading?: boolean;
  active?: boolean;
  onClick?: () => void;
  /** Valores dos últimos dias para o mini gráfico. */
  trend?: number[];
  trendColor?: string;
  delta?: StatDelta | null;
  /** Conteúdo extra embaixo (ex.: barra de proporção). */
  footer?: ReactNode;
};

function DeltaBadge({ delta }: { delta: StatDelta }) {
  const up = delta.percent > 0;
  const flat = delta.percent === 0;
  const good = flat ? null : up === (delta.upIsGood ?? true);
  return (
    <Badge
      size="sm"
      variant="light"
      color={flat ? "gray" : good ? "success" : "orange"}
      tt="none"
      className="num"
      style={{ flexShrink: 0 }}
    >
      {flat ? "=" : up ? "▲" : "▼"} {Math.abs(delta.percent)}% {delta.label}
    </Badge>
  );
}

// KPI tile: label, large neutral number, optional muted hint.
// Values stay in text ink; color only appears as the small accent mark.
export default function StatTile({
  label,
  value,
  hint,
  icon,
  accent,
  loading = false,
  active = false,
  onClick,
  trend,
  trendColor,
  delta,
  footer,
}: StatTileProps) {
  const body = (
    <>
      <Group justify="space-between" wrap="nowrap" gap="xs">
        <Group gap={8} wrap="nowrap" miw={0}>
          {accent && (
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 2,
                background: accent,
                flexShrink: 0,
              }}
            />
          )}
          <Text size="xs" c="dimmed" fw={500} truncate="end">
            {label}
          </Text>
        </Group>
        {icon && (
          <span style={{ color: "var(--text-subtle)", display: "flex" }}>
            {icon}
          </span>
        )}
      </Group>
      {loading ? (
        <Skeleton h={30} w="60%" mt={8} radius="sm" />
      ) : (
        <Text fz={28} fw={650} lh={1.2} mt={6} truncate="end" lts="-0.02em">
          {typeof value === "number" ? <AnimatedNumber value={value} /> : value}
        </Text>
      )}
      {delta && !loading ? (
        <div style={{ marginTop: 4 }}>
          <DeltaBadge delta={delta} />
        </div>
      ) : null}
      {hint && (
        <Text size="xs" c="dimmed" mt={2} truncate="end">
          {hint}
        </Text>
      )}
      {trend && trend.length > 1 && !loading ? (
        <div style={{ marginTop: 8 }}>
          <Sparkline values={trend} color={trendColor ?? "var(--accent)"} />
        </div>
      ) : null}
      {footer && !loading ? <div style={{ marginTop: 8 }}>{footer}</div> : null}
    </>
  );

  if (onClick) {
    return (
      <UnstyledButton
        onClick={onClick}
        className="stat-tile"
        data-active={active || undefined}
        data-clickable
      >
        {body}
      </UnstyledButton>
    );
  }

  return <div className="stat-tile">{body}</div>;
}
