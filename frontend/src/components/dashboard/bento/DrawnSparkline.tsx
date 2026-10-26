import { useId, useState } from "react";
import { m } from "motion/react";
import { useMotionLevel } from "../../../lib/motionContext";
import { revealFor } from "../../../lib/dashboardMotion";

type DrawnSparklineProps = {
  values: number[];
  color: string;
  height?: number;
  /** Lido por leitores de tela; sem ele o gráfico é decorativo. */
  label?: string;
  delay?: number;
  /** Texto do ponto sob o mouse (ex.: "12/10: 318 un"). Sem ele, só o valor. */
  pointLabel?: (index: number, value: number) => string;
};

// Mini linha de tendência que se desenha ao abrir (Completo), só esmaece (Suave) ou já
// aparece pronta (Nenhum). Sem "non-scaling-stroke": com ele o pathLength do motion corta
// a linha no meio.
export default function DrawnSparkline({
  values,
  color,
  height = 36,
  label,
  delay = 0,
  pointLabel,
}: DrawnSparklineProps) {
  const gradientId = useId();
  const level = useMotionLevel();
  const [hover, setHover] = useState<number | null>(null);
  if (values.length < 2) return <div style={{ height }} />;

  const width = 160;
  const pad = 3;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const points = values.map((value, index) => [
    pad + (index * (width - pad * 2)) / (values.length - 1),
    height - pad - ((value - min) / range) * (height - pad * 2),
  ]);
  const line = points
    .map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(" ");
  const [lastX, lastY] = points[points.length - 1];
  const draw = revealFor(level, "draw", 0, delay);
  const fade = revealFor(level, "fade", 0, delay + (level === "completo" ? 0.5 : 0));

  const hovered = hover !== null ? points[hover] : null;
  const onMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    setHover(Math.round(ratio * (values.length - 1)));
  };

  return (
    <div className="mi-spark" onPointerLeave={() => setHover(null)}>
    {hovered && hover !== null ? (
      <span
        className="mi-spark-tip num"
        style={{ left: `${(hovered[0] / width) * 100}%` }}
        role="status"
      >
        {pointLabel ? pointLabel(hover, values[hover]) : values[hover].toLocaleString("pt-BR")}
      </span>
    ) : null}
    <svg
      onPointerMove={onMove}
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      style={{ display: "block", overflow: "visible" }}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.2} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <m.path
        d={`${line} L${width - pad} ${height} L${pad} ${height} Z`}
        fill={`url(#${gradientId})`}
        stroke="none"
        initial={level === "nenhum" ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={fade.transition}
      />
      <m.path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
        strokeLinecap="round"
        initial={draw.initial}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={draw.transition}
      />
      <m.circle
        cx={lastX}
        cy={lastY}
        r={2.6}
        fill={color}
        initial={level === "nenhum" ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={fade.transition}
      />
      {hovered ? (
        <g className="mi-spark-hover" aria-hidden>
          <line x1={hovered[0]} x2={hovered[0]} y1={0} y2={height} stroke={color} strokeOpacity={0.35} strokeDasharray="2 2" />
          <circle cx={hovered[0]} cy={hovered[1]} r={3.4} fill="var(--surface-solid)" stroke={color} strokeWidth={2} />
        </g>
      ) : null}
    </svg>
    </div>
  );
}
