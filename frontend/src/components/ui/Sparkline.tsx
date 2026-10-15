import { useId } from "react";

type SparklineProps = {
  values: number[];
  color: string;
  height?: number;
  /** Rótulo lido por leitores de tela; sem ele o gráfico é decorativo. */
  label?: string;
};

// Mini gráfico de linha com área: só a forma da tendência, sem eixos.
export default function Sparkline({ values, color, height = 34, label }: SparklineProps) {
  const gradientId = useId();
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

  return (
    <svg
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
          <stop offset="0%" stopColor={color} stopOpacity={0.18} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path
        d={`${line} L${width - pad} ${height} L${pad} ${height} Z`}
        fill={`url(#${gradientId})`}
        stroke="none"
      />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={lastX} cy={lastY} r={2.6} fill={color} />
    </svg>
  );
}
