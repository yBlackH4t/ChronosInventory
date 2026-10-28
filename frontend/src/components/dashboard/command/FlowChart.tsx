import { useState, type PointerEvent } from "react";
import { SegmentedControl, Skeleton } from "@mantine/core";
import { useElementSize } from "@mantine/hooks";
import { m } from "motion/react";
import dayjs from "dayjs";
import AnimatedNumber from "../../ui/AnimatedNumber";
import CommandPanel from "./CommandPanel";
import { useChartTheme } from "../../../lib/chartTheme";
import { useMotionLevel } from "../../../lib/motionContext";
import { revealFor } from "../../../lib/dashboardMotion";
import { monotonePath, type FlowBar, type FlowRange } from "../../../lib/commandCenter";

const HEIGHT = 300;
const MID = 168;
const UP = 140;
const DOWN = 104;
const RIGHT_GUTTER = 64;

const RANGE_LABEL: Record<FlowRange, string> = { "30": "30 dias", "90": "90 dias", "365": "12 meses" };

type FlowChartProps = {
  bars: FlowBar[];
  range: FlowRange;
  onRange: (range: FlowRange) => void;
  saldo: number;
  loading: boolean;
};

// Entradas sobem do eixo, saídas descem: o movimento do estoque num gráfico só.
// No ano, cada coluna é uma semana.
export default function FlowChart({ bars, range, onRange, saldo, loading }: FlowChartProps) {
  const chart = useChartTheme();
  const level = useMotionLevel();
  const { ref, width } = useElementSize();
  const [hover, setHover] = useState<number | null>(null);

  const weekly = range === "365";
  const entrou = bars.reduce((acc, bar) => acc + bar.entradas, 0);
  const saiu = bars.reduce((acc, bar) => acc + bar.saidas, 0);
  const maxIn = Math.max(1, ...bars.map((bar) => bar.entradas));
  const maxOut = Math.max(1, ...bars.map((bar) => bar.saidas));
  const plotW = Math.max(0, width - RIGHT_GUTTER);
  const step = bars.length > 1 ? plotW / (bars.length - 1) : plotW;
  const barW = Math.max(3, Math.min(12, step * 0.55));
  const x = (index: number) => index * step;
  const yOut = (value: number) => MID + 6 + (value / maxOut) * DOWN;

  const outLine = monotonePath(bars.map((bar, index) => [x(index), yOut(bar.saidas)]));
  const outArea = bars.length ? `${outLine} L${x(bars.length - 1).toFixed(1)} ${MID + 6} L0 ${MID + 6} Z` : "";
  const labels = bars.length > 1 ? Array.from({ length: 7 }, (_, i) => Math.round((i * (bars.length - 1)) / 6)) : [];
  const draw = revealFor(level, "draw", 0, 0.35);
  const fade = revealFor(level, "fade", 0, 0.35);

  const onMove = (event: PointerEvent<SVGRectElement>) => {
    if (!bars.length || step <= 0) return;
    const box = event.currentTarget.getBoundingClientRect();
    const index = Math.round((event.clientX - box.left) / step);
    setHover(Math.min(bars.length - 1, Math.max(0, index)));
  };

  const hovered = hover === null ? null : bars[hover];
  const hoverDate = hovered
    ? weekly
      ? `semana de ${dayjs(hovered.date).format("DD/MM")}`
      : dayjs(hovered.date).format("DD/MM")
    : "";

  return (
    <CommandPanel
      area="flow"
      title="Entradas e saídas"
      aside={
        <SegmentedControl
          size="xs"
          value={range}
          onChange={(value) => onRange(value as FlowRange)}
          data={(Object.keys(RANGE_LABEL) as FlowRange[]).map((value) => ({ value, label: RANGE_LABEL[value] }))}
        />
      }
    >
      <div className="cc-flow-head">
        <div>
          Entrou em {RANGE_LABEL[range]}
          <b className="cc-mono" style={{ color: chart.inflow }}>
            <AnimatedNumber value={entrou} />
          </b>
        </div>
        <div>
          Saiu
          <b className="cc-mono" style={{ color: chart.outflow }}>
            <AnimatedNumber value={saiu} />
          </b>
        </div>
        <div>
          Saldo hoje
          <b className="cc-mono">
            <AnimatedNumber value={saldo} />
          </b>
        </div>
      </div>

      <div ref={ref} className="cc-flow-plot">
        {loading || width === 0 ? (
          <Skeleton h={HEIGHT} radius="sm" />
        ) : (
          <svg
            width={width}
            height={HEIGHT}
            role="img"
            aria-label={`Em ${RANGE_LABEL[range]}: entraram ${entrou} e saíram ${saiu} unidades`}
          >
            {[1, 2, 3].map((line) => (
              <line key={line} x1={0} x2={plotW} y1={MID - line * 44} y2={MID - line * 44} stroke={chart.grid} />
            ))}
            <line x1={0} x2={plotW} y1={MID + 3} y2={MID + 3} stroke={chart.axis} strokeDasharray="2 4" />

            {bars.map((bar, index) => {
              if (bar.entradas <= 0) return null;
              const h = Math.max(4, (bar.entradas / maxIn) * UP);
              const reveal = revealFor(level, "grow-y", index, 0.1);
              return (
                <m.g
                  key={bar.date}
                  style={{ transformOrigin: `${x(index)}px ${MID}px` }}
                  initial={reveal.initial}
                  animate={{ scaleY: 1, opacity: 1 }}
                  transition={reveal.transition}
                >
                  <rect x={x(index) - barW / 2} y={MID - h} width={barW} height={h} rx={Math.min(3, barW / 2)} fill={chart.inflow} opacity={0.85} />
                  {!weekly ? <circle cx={x(index)} cy={MID - h - 10} r={3.5} fill={chart.inflow} /> : null}
                </m.g>
              );
            })}

            <m.path
              d={outArea}
              fill={chart.outflow}
              initial={fade.initial === false ? false : { opacity: 0 }}
              animate={{ opacity: 0.16 }}
              transition={fade.transition}
            />
            <m.path
              d={outLine}
              fill="none"
              stroke={chart.outflow}
              strokeWidth={2}
              strokeLinejoin="round"
              initial={draw.initial}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={draw.transition}
            />

            {bars.length ? (
              <g className="cc-flow-now" transform={`translate(${x(bars.length - 1)},${yOut(bars[bars.length - 1].saidas)})`}>
                <circle r={11} fill={chart.outflow} opacity={0.18} className="cc-flow-pulse" />
                <circle r={4.5} fill={chart.outflow} />
              </g>
            ) : null}

            <text x={plotW + 12} y={MID - UP + 12} fontSize={11.5} fill={chart.inflow}>
              entradas
            </text>
            <text x={plotW + 12} y={MID + 60} fontSize={11.5} fill={chart.outflow}>
              saídas
            </text>
            {labels.map((index, i) => (
              <text
                key={i}
                x={x(index)}
                y={HEIGHT - 4}
                fontSize={11}
                fill={chart.tick.fill}
                textAnchor={i === 0 ? "start" : i === labels.length - 1 ? "end" : "middle"}
              >
                {dayjs(bars[index].date).format(weekly ? "MM/YY" : "DD/MM")}
              </text>
            ))}

            {hovered && hover !== null ? (
              <g pointerEvents="none">
                <line x1={x(hover)} x2={x(hover)} y1={8} y2={HEIGHT - 20} stroke={chart.axis} strokeDasharray="3 3" />
              </g>
            ) : null}
            <rect
              x={0}
              y={0}
              width={plotW}
              height={HEIGHT}
              fill="transparent"
              onPointerMove={onMove}
              onPointerLeave={() => setHover(null)}
            />
          </svg>
        )}
        {hovered && hover !== null ? (
          <div
            className="cc-flow-tip"
            style={{ left: Math.min(Math.max(x(hover), 70), plotW - 70) }}
            role="status"
          >
            <b>{hoverDate}</b>
            <span style={{ color: chart.inflow }}>{hovered.entradas} entraram</span>
            <span style={{ color: chart.outflow }}>{hovered.saidas} saíram</span>
          </div>
        ) : null}
      </div>
    </CommandPanel>
  );
}
