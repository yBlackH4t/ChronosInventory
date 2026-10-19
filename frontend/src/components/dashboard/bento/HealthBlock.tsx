import { useId } from "react";
import { Skeleton } from "@mantine/core";
import { m } from "motion/react";
import EmptyState from "../../ui/EmptyState";
import AnimatedNumber from "../../ui/AnimatedNumber";
import BentoCard from "./BentoCard";
import { useChartTheme } from "../../../lib/chartTheme";
import { useMotionLevel } from "../../../lib/motionContext";
import { revealFor } from "../../../lib/dashboardMotion";
import { share } from "../../../lib/dashboardBento";
import type { HealthBucket } from "../../../lib/dashboardMath";

const META: Record<HealthBucket, { label: string; hint: string }> = {
  GIRANDO: { label: "Girando", hint: "saiu nos últimos 30 dias" },
  LENTO: { label: "Lento", hint: "última saída de 31 a 90 dias" },
  PARADO: { label: "Parado", hint: "sem saída há mais de 90 dias" },
};

const BUCKETS: HealthBucket[] = ["GIRANDO", "LENTO", "PARADO"];

type HealthBlockProps = {
  counts: Record<HealthBucket, number>;
  loading: boolean;
  subtitle: string;
};

// Quanto do estoque está girando: medidor circular que enche ao abrir.
export default function HealthBlock({ counts, loading, subtitle }: HealthBlockProps) {
  const chart = useChartTheme();
  const level = useMotionLevel();
  const gradientId = useId();
  const total = counts.GIRANDO + counts.LENTO + counts.PARADO;
  const fraction = share(counts.GIRANDO, total);
  const percent = Math.round(fraction * 100);
  const reveal = revealFor(level, "draw", 0, 0.25);
  const colors: Record<HealthBucket, string> = {
    GIRANDO: chart.semantic.ok,
    LENTO: chart.semantic.warn,
    PARADO: chart.semantic.crit,
  };

  return (
    <BentoCard area="saude" title="Saúde do estoque" subtitle={subtitle}>
      {loading ? (
        <Skeleton h={130} radius="md" />
      ) : total === 0 ? (
        <EmptyState message="Nenhum produto com saldo" />
      ) : (
        <div className="bento-health">
          <svg
            viewBox="0 0 120 120"
            width={128}
            height={128}
            role="img"
            aria-label={`${percent}% dos produtos com saldo estão girando`}
            style={{ flexShrink: 0 }}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor={chart.accent} />
                <stop offset="1" stopColor={chart.semantic.ok} />
              </linearGradient>
            </defs>
            <circle cx={60} cy={60} r={46} fill="none" stroke="var(--surface-2)" strokeWidth={12} />
            {fraction > 0 ? (
              <m.circle
                cx={60}
                cy={60}
                r={46}
                fill="none"
                stroke={`url(#${gradientId})`}
                strokeWidth={12}
                strokeLinecap="round"
                transform="rotate(-90 60 60)"
                initial={reveal.initial === false ? false : { ...reveal.initial, pathLength: level === "completo" ? 0 : fraction }}
                animate={{ pathLength: fraction, opacity: 1 }}
                transition={reveal.transition}
              />
            ) : null}
            <text
              x={60}
              y={62}
              textAnchor="middle"
              fontSize={24}
              fontWeight={600}
              fill="var(--text)"
              className="num"
            >
              {percent}%
            </text>
            <text x={60} y={80} textAnchor="middle" fontSize={11} fill="var(--text-subtle)">
              girando
            </text>
          </svg>
          <div className="bento-health-legend">
            {BUCKETS.map((bucket) => (
              <div key={bucket} className="bento-health-row" title={META[bucket].hint}>
                <span className="bento-swatch" style={{ background: colors[bucket], borderRadius: "50%" }} />
                <span>
                  {META[bucket].label}
                  <span style={{ display: "block", fontSize: "0.7rem" }}>{META[bucket].hint}</span>
                </span>
                <b className="num">
                  <AnimatedNumber value={counts[bucket]} />
                </b>
              </div>
            ))}
          </div>
        </div>
      )}
    </BentoCard>
  );
}
