import { useState, type CSSProperties, type PointerEvent } from "react";
import { Skeleton } from "@mantine/core";
import { m } from "motion/react";
import dayjs from "dayjs";
import AnimatedNumber from "../../ui/AnimatedNumber";
import CommandPanel from "./CommandPanel";
import { useChartTheme } from "../../../lib/chartTheme";
import { useMotionLevel } from "../../../lib/motionContext";
import { revealFor } from "../../../lib/dashboardMotion";
import { resetTilt, tiltWithCursor } from "../../../lib/cursorGlow";
import { healthRings, type HealthRing } from "../../../lib/commandCenter";
import type { HealthBucket } from "../../../lib/dashboardMath";

const META: Record<HealthBucket, { label: string; hint: string }> = {
  GIRANDO: { label: "Girando", hint: "saiu nos últimos 30 dias" },
  LENTO: { label: "Lento", hint: "última saída de 31 a 90 dias" },
  PARADO: { label: "Parado", hint: "sem saída há mais de 90 dias" },
};

/** Dica curta que cabe no miolo quando o mouse está num anel. */
const CENTER_HINT: Record<HealthBucket, string> = {
  GIRANDO: "saiu em 30 dias",
  LENTO: "saiu de 31 a 90 dias",
  PARADO: "+90 dias sem sair",
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
        className="cc-tick-mark"
        stroke="var(--text-subtle)"
        strokeWidth={1}
        opacity={0.45}
        // O radar dá a volta em 6 s: cada tracinho acende quando a borda dele passa.
        style={{ animationDelay: `${(((angle + 45) % 360) / 360) * 6 - 6}s` }}
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
  const moving = level === "completo";
  const [hotRing, setHotRing] = useState<HealthRing["key"] | null>(null);
  const [hoverDay, setHoverDay] = useState<number | null>(null);
  const rings = healthRings(counts);
  const colors: Record<HealthRing["key"], string> = {
    GIRANDO: chart.semantic.ok,
    LENTO: chart.semantic.warn,
    PARADO: chart.semantic.crit,
  };
  const percent = Math.round((rings[0]?.fraction ?? 0) * 100);
  const withStock = counts.GIRANDO + counts.LENTO + counts.PARADO;
  const maxSaida = Math.max(1, ...saidas);
  const hot = hotRing ? rings.find((ring) => ring.key === hotRing) ?? null : null;
  const dayLabel = (index: number) => dayjs().subtract(saidas.length - 1 - index, "day").format("DD/MM");
  const onDaysMove = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const index = Math.floor(((event.clientX - rect.left) / rect.width) * saidas.length);
    setHoverDay(Math.min(saidas.length - 1, Math.max(0, index)));
  };
  /** Lupa das barras: a do mouse cresce mais, as vizinhas um pouco. */
  const magnify = (index: number): CSSProperties | undefined => {
    if (hoverDay === null || !moving) return undefined;
    const reach = Math.max(0, 1 - Math.abs(index - hoverDay) / 4);
    if (reach === 0) return undefined;
    return { transform: `scale(${1 + reach * 0.33}, ${1 + reach * 0.55})` };
  };

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
            <defs>
              <linearGradient id="cc-radar" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor="var(--accent)" stopOpacity={0} />
                <stop offset="1" stopColor="var(--accent)" stopOpacity={0.26} />
              </linearGradient>
            </defs>
            <g className="cc-radar" aria-hidden>
              <path d={`M${MID} ${MID} L${MID} ${MID - 148} A148 148 0 0 1 ${MID + 104.65} ${MID - 104.65} Z`} fill="url(#cc-radar)" />
              <line x1={MID} y1={MID} x2={MID + 104.65} y2={MID - 104.65} stroke="var(--accent)" strokeWidth={1.4} opacity={0.7} />
            </g>
            <Ticks />
            {rings.map((ring, index) => {
              const reveal = revealFor(level, "draw", index, 0.15);
              return (
                <g
                  key={ring.key}
                  transform={`rotate(-90 ${MID} ${MID})`}
                  className="cc-ring"
                  data-hot={hotRing === ring.key || undefined}
                  data-dim={(hotRing !== null && hotRing !== ring.key) || undefined}
                  style={{ color: colors[ring.key] }}
                  onPointerEnter={() => setHotRing(ring.key)}
                  onPointerLeave={() => setHotRing(null)}
                >
                  <circle cx={MID} cy={MID} r={RADIUS[index]} fill="none" stroke="var(--surface-2)" strokeWidth={12} />
                  {ring.fraction > 0 ? (
                    <m.circle
                      className="cc-ring-arc"
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
                  {ring.fraction > 0.04 ? (
                    // Cometa que corre pelo trecho pintado do anel.
                    <g
                      className="cc-ring-comet"
                      style={{ ["--arc" as string]: `${ring.fraction * 360}deg`, animationDuration: `${3.5 + index * 0.9}s` }}
                    >
                      <circle cx={MID + RADIUS[index]} cy={MID} r={4.5} fill={colors[ring.key]} />
                    </g>
                  ) : null}
                </g>
              );
            })}
            <foreignObject x={MID - 80} y={MID - 52} width={160} height={104}>
              {hot ? (
                <div className="cc-core-center">
                  <span className="cc-core-total cc-mono" style={{ color: colors[hot.key] }}>
                    <AnimatedNumber value={hot.value} />
                  </span>
                  <span className="cc-core-label">produtos {META[hot.key].label.toLowerCase()}s</span>
                  <span className="cc-mono" style={{ color: "var(--text-subtle)", fontSize: 11 }}>
                    {CENTER_HINT[hot.key]}
                  </span>
                </div>
              ) : (
                <div className="cc-core-center">
                  <span className="cc-core-total cc-core-beat cc-mono">
                    <AnimatedNumber value={total} />
                  </span>
                  <span className="cc-core-label">{totalLabel}</span>
                  <span className="cc-mono" style={{ color: colors.GIRANDO, fontSize: 12 }}>
                    {percent}% girando
                  </span>
                </div>
              )}
            </foreignObject>
          </svg>
        )}

        <div className="cc-legend">
          {rings.map((ring) => (
            <button
              type="button"
              key={ring.key}
              title={META[ring.key].hint}
              data-on={hotRing === ring.key || undefined}
              onPointerEnter={() => setHotRing(ring.key)}
              onPointerLeave={() => setHotRing(null)}
              onFocus={() => setHotRing(ring.key)}
              onBlur={() => setHotRing(null)}
            >
              <i style={{ background: colors[ring.key] }} />
              {META[ring.key].label} <b className="cc-mono">{ring.value.toLocaleString("pt-BR")}</b>
            </button>
          ))}
        </div>

        <div className="cc-kpis">
          {kpis.map((kpi) => (
            <div
              key={kpi.label}
              className="cc-kpi mi-glow"
              onPointerMove={(event) => tiltWithCursor(event, moving)}
              onPointerLeave={resetTilt}
            >
              <b
                className="cc-mono"
                style={kpi.tone ? { color: kpi.tone === "ok" ? chart.semantic.ok : chart.semantic.warn } : undefined}
              >
                {kpi.signed && kpi.value > 0 && !loading ? <span className="cc-kpi-up" aria-hidden>↑ </span> : null}
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
          <div
            className="cc-daybars-row"
            role="img"
            aria-label={`Saídas por dia nos últimos ${saidas.length} dias`}
            onPointerMove={onDaysMove}
            onPointerLeave={() => setHoverDay(null)}
          >
            <span className="cc-daybars-scan" aria-hidden />
            {saidas.map((value, index) => {
              const reveal = revealFor(level, "grow-y", index, 0.3);
              return (
                <span
                  key={index}
                  className="cc-dayslot"
                  data-hover={hoverDay === index || undefined}
                  style={{ height: `${value === 0 ? 4 : Math.max(10, (value / maxSaida) * 100)}%`, ...magnify(index) }}
                >
                  <m.span
                    className="cc-daybar"
                    data-empty={value === 0 || undefined}
                    data-today={index === saidas.length - 1 || undefined}
                    style={{ transformOrigin: "bottom", ["--i" as string]: index }}
                    initial={reveal.initial}
                    animate={{ scaleY: 1, opacity: 1 }}
                    transition={reveal.transition}
                  />
                </span>
              );
            })}
            {hoverDay !== null ? (
              <span className="cc-daybars-tip" style={{ left: `${((hoverDay + 0.5) / saidas.length) * 100}%` }} role="status">
                <b>
                  {dayLabel(hoverDay)}
                  {hoverDay === saidas.length - 1 ? " · hoje" : ""}
                </b>
                {saidas[hoverDay]} {saidas[hoverDay] === 1 ? "saída" : "saídas"}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </CommandPanel>
  );
}
