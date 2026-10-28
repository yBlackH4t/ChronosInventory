import { Skeleton } from "@mantine/core";
import { m } from "motion/react";
import dayjs from "dayjs";
import AnimatedNumber from "../../ui/AnimatedNumber";
import CommandPanel from "./CommandPanel";
import { useChartTheme } from "../../../lib/chartTheme";
import { useMotionLevel } from "../../../lib/motionContext";
import { revealFor } from "../../../lib/dashboardMotion";
import { healthRings, type HealthRing } from "../../../lib/commandCenter";
import type { HealthBucket } from "../../../lib/dashboardMath";

const META: Record<HealthBucket, { label: string; hint: string }> = {
  GIRANDO: { label: "Girando", hint: "saiu nos últimos 30 dias" },
  LENTO: { label: "Lento", hint: "última saída de 31 a 90 dias" },
  PARADO: { label: "Parado", hint: "sem saída há mais de 90 dias" },
};

const RADIUS = [132, 108, 84];
const SIZE = 320;
const MID = SIZE / 2;

export type CoreKpi = { label: string; value: number; suffix?: string; signed?: boolean; tone?: "ok" | "warn" };

type HealthCoreProps = {
  counts: Record<HealthBucket, number>;
  total: number;
  totalLabel: string;
  kpis: CoreKpi[];
  /** Saídas por dia, do mais antigo para hoje. */
  saidas: number[];
  loading: boolean;
};

function Ticks() {
  const lines = [];
  for (let angle = 0; angle < 360; angle += 6) {
    const rad = (angle * Math.PI) / 180;
    const inner = 148;
    const outer = inner + (angle % 30 === 0 ? 8 : 4);
    lines.push(
      <line
        key={angle}
        x1={MID + inner * Math.cos(rad)}
        y1={MID + inner * Math.sin(rad)}
        x2={MID + outer * Math.cos(rad)}
        y2={MID + outer * Math.sin(rad)}
        stroke="var(--text-subtle)"
        strokeWidth={1}
        opacity={0.45}
      />,
    );
  }
  return <g aria-hidden>{lines}</g>;
}

// Miolo: três anéis (girando, lento, parado) em volta do total, os números do mês e as
// saídas dia a dia.
export default function HealthCore({ counts, total, totalLabel, kpis, saidas, loading }: HealthCoreProps) {
  const chart = useChartTheme();
  const level = useMotionLevel();
  const rings = healthRings(counts);
  const colors: Record<HealthRing["key"], string> = {
    GIRANDO: chart.semantic.ok,
    LENTO: chart.semantic.warn,
    PARADO: chart.semantic.crit,
  };
  const percent = Math.round((rings[0]?.fraction ?? 0) * 100);
  const withStock = counts.GIRANDO + counts.LENTO + counts.PARADO;
  const maxSaida = Math.max(1, ...saidas);

  return (
    <CommandPanel area="core" title={`Saúde do estoque · ${withStock.toLocaleString("pt-BR")} produtos com saldo`}>
      <div className="cc-core">
        {loading ? (
          <Skeleton h={SIZE} w={SIZE} circle />
        ) : (
          <svg
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            width={SIZE}
            height={SIZE}
            role="img"
            aria-label={`${total} ${totalLabel}; ${percent}% dos produtos com saldo estão girando`}
          >
            <Ticks />
            {rings.map((ring, index) => {
              const reveal = revealFor(level, "draw", index, 0.15);
              return (
                <g key={ring.key} transform={`rotate(-90 ${MID} ${MID})`}>
                  <circle cx={MID} cy={MID} r={RADIUS[index]} fill="none" stroke="var(--surface-2)" strokeWidth={12} />
                  {ring.fraction > 0 ? (
                    <m.circle
                      cx={MID}
                      cy={MID}
                      r={RADIUS[index]}
                      fill="none"
                      stroke={colors[ring.key]}
                      strokeWidth={12}
                      strokeLinecap="round"
                      initial={reveal.initial === false ? false : { ...reveal.initial, pathLength: level === "completo" ? 0 : ring.fraction }}
                      animate={{ pathLength: ring.fraction, opacity: 1 }}
                      transition={reveal.transition}
                    />
                  ) : null}
                </g>
              );
            })}
            <foreignObject x={MID - 80} y={MID - 52} width={160} height={104}>
              <div className="cc-core-center">
                <span className="cc-core-total cc-mono">
                  <AnimatedNumber value={total} />
                </span>
                <span className="cc-core-label">{totalLabel}</span>
                <span className="cc-mono" style={{ color: colors.GIRANDO, fontSize: 12 }}>
                  {percent}% girando
                </span>
              </div>
            </foreignObject>
          </svg>
        )}

        <div className="cc-legend">
          {rings.map((ring) => (
            <span key={ring.key} title={META[ring.key].hint}>
              <i style={{ background: colors[ring.key] }} />
              {META[ring.key].label} <b className="cc-mono">{ring.value.toLocaleString("pt-BR")}</b>
            </span>
          ))}
        </div>

        <div className="cc-kpis">
          {kpis.map((kpi) => (
            <div key={kpi.label}>
              <b
                className="cc-mono"
                style={kpi.tone ? { color: kpi.tone === "ok" ? chart.semantic.ok : chart.semantic.warn } : undefined}
              >
                {loading ? "–" : `${kpi.signed && kpi.value > 0 ? "+" : ""}${kpi.value.toLocaleString("pt-BR")}${kpi.suffix ?? ""}`}
              </b>
              {kpi.label}
            </div>
          ))}
        </div>

        <div className="cc-daybars">
          <div className="cc-daybars-head">
            <span>Saídas por dia · {saidas.length} dias</span>
            <span className="cc-mono">máx {maxSaida}</span>
          </div>
          <div className="cc-daybars-row" role="img" aria-label={`Saídas por dia nos últimos ${saidas.length} dias`}>
            {saidas.map((value, index) => {
              const reveal = revealFor(level, "grow-y", index, 0.3);
              const date = dayjs().subtract(saidas.length - 1 - index, "day").format("DD/MM");
              return (
                <m.span
                  key={index}
                  className="cc-daybar"
                  data-empty={value === 0 || undefined}
                  title={`${date}: ${value} ${value === 1 ? "saída" : "saídas"}`}
                  style={{ height: `${value === 0 ? 4 : Math.max(10, (value / maxSaida) * 100)}%`, transformOrigin: "bottom" }}
                  initial={reveal.initial}
                  animate={{ scaleY: 1, opacity: 1 }}
                  transition={reveal.transition}
                />
              );
            })}
          </div>
        </div>
      </div>
    </CommandPanel>
  );
}
