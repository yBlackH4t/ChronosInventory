import type { ReactNode } from "react";

type ProgressRingProps = {
  /** De 0 a 100. */
  value: number;
  size?: number;
  thickness?: number;
  label?: ReactNode;
  caption?: ReactNode;
};

// Anel de progresso do Vidro suave: trilho discreto e arco no gradiente da cor principal.
// O arco cresce com transição de CSS (no nível "Nenhum" a regra global tira a transição).
export default function ProgressRing({ value, size = 92, thickness = 9, label, caption }: ProgressRingProps) {
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, value));
  const gradientId = `ring-${size}-${thickness}`;

  return (
    <div className="vt-ring" style={{ width: size, height: size }} role="img" aria-label={`${clamped}% concluído`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--accent)" />
            <stop offset="100%" stopColor="var(--vt-ring-end)" />
          </linearGradient>
        </defs>
        <circle className="vt-ring-track" cx={size / 2} cy={size / 2} r={radius} strokeWidth={thickness} />
        <circle
          className="vt-ring-arc"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={thickness}
          stroke={`url(#${gradientId})`}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped / 100)}
        />
      </svg>
      <div className="vt-ring-center">
        <span className="vt-ring-value num">{label ?? `${clamped}%`}</span>
        {caption ? <span className="vt-ring-caption">{caption}</span> : null}
      </div>
    </div>
  );
}
