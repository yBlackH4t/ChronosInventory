import { useState, type PointerEvent } from "react";
import { Button, Chip, Group, SegmentedControl, Skeleton } from "@mantine/core";
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
const LENS_R = 62;
const LENS_ZOOM = 1.8;
/** Menor período que o zoom aceita (colunas). */
const MIN_ZOOM = 5;

const RANGE_LABEL: Record<FlowRange, string> = { "30": "30 dias", "90": "90 dias", "365": "12 meses" };

type FlowChartProps = {
  bars: FlowBar[];
  range: FlowRange;
  onRange: (range: FlowRange) => void;
  saldo: number;
  loading: boolean;
};

type Zoom = { from: number; to: number };

// Entradas sobem do eixo, saídas descem: o movimento do estoque num gráfico só.
// No ano, cada coluna é uma semana. Passar o mouse mostra o dia e uma lupa; arrastar
// escolhe um período para dar zoom. No "Completo" um cometa corre pela linha das saídas.
export default function FlowChart({ bars: allBars, range, onRange, saldo, loading }: FlowChartProps) {
  const chart = useChartTheme();
  const level = useMotionLevel();
  const { ref, width } = useElementSize();
  const [hover, setHover] = useState<number | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  // O zoom vale só para o período em que foi feito: trocar 30/90/12 meses volta ao inteiro.
  const [zoomed, setZoomed] = useState<{ range: FlowRange; zoom: Zoom } | null>(null);
  const zoom = zoomed?.range === range ? zoomed.zoom : null;
  const setZoom = (next: Zoom | null) => setZoomed(next ? { range, zoom: next } : null);
  const [brush, setBrush] = useState<{ start: number; end: number } | null>(null);
  const [lensOn, setLensOn] = useState(true);

  const bars = zoom ? allBars.slice(zoom.from, zoom.to + 1) : allBars;
  const weekly = range === "365";
  const entrou = bars.reduce((acc, bar) => acc + bar.entradas, 0);
  const saiu = bars.reduce((acc, bar) => acc + bar.saidas, 0);
  const maxIn = Math.max(1, ...bars.map((bar) => bar.entradas));
  const maxOut = Math.max(1, ...bars.map((bar) => bar.saidas));
  const plotW = Math.max(0, width - RIGHT_GUTTER);
  const step = bars.length > 1 ? plotW / (bars.length - 1) : plotW;
  const barW = Math.max(3, Math.min(14, step * 0.55));
  const x = (index: number) => index * step;
  const yOut = (value: number) => MID + 6 + (value / maxOut) * DOWN;

  const outLine = monotonePath(bars.map((bar, index) => [x(index), yOut(bar.saidas)]));
  const outArea = bars.length ? `${outLine} L${x(bars.length - 1).toFixed(1)} ${MID + 6} L0 ${MID + 6} Z` : "";
  const labels = bars.length > 1 ? Array.from({ length: 7 }, (_, i) => Math.round((i * (bars.length - 1)) / 6)) : [];
  const draw = revealFor(level, "draw", 0, 0.35);
  const fade = revealFor(level, "fade", 0, 0.35);
  const fmt = (date: string) => dayjs(date).format("DD/MM");
  const periodLabel = zoom && bars.length ? `de ${fmt(bars[0].date)} a ${fmt(bars[bars.length - 1].date)}` : `em ${RANGE_LABEL[range]}`;

  const pointIn = (event: PointerEvent<SVGRectElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  };
  const indexAt = (px: number) => Math.min(bars.length - 1, Math.max(0, Math.round(px / Math.max(step, 1))));

  const onDown = (event: PointerEvent<SVGRectElement>) => {
    if (!bars.length) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const at = pointIn(event).x;
    setBrush({ start: at, end: at });
  };
  const onMove = (event: PointerEvent<SVGRectElement>) => {
    if (!bars.length || step <= 0) return;
    const at = pointIn(event);
    setHover(indexAt(at.x));
    setCursor(at);
    if (brush) setBrush({ ...brush, end: Math.min(Math.max(at.x, 0), plotW) });
  };
  const onUp = () => {
    if (!brush) return;
    const a = indexAt(Math.min(brush.start, brush.end));
    const b = indexAt(Math.max(brush.start, brush.end));
    setBrush(null);
    if (b - a + 1 < MIN_ZOOM) return;
    const base = zoom?.from ?? 0;
    setZoom({ from: base + a, to: base + b });
    setHover(null);
  };

  const hovered = hover === null ? null : bars[hover];
  const hoverDate = hovered ? (weekly ? `semana de ${fmt(hovered.date)}` : dayjs(hovered.date).format("ddd, DD/MM")) : "";
  const showLens = lensOn && level !== "nenhum" && cursor !== null && !brush && hovered !== null;

  // Barras e linhas: desenhadas no gráfico e de novo, sem animação, dentro da lupa.
  const content = (animated: boolean) => (
    <>
      {[1, 2, 3].map((line) => (
        <line key={line} x1={0} x2={plotW} y1={MID - line * 44} y2={MID - line * 44} stroke={chart.grid} />
      ))}
      <line x1={0} x2={plotW} y1={MID + 3} y2={MID + 3} stroke={chart.axis} strokeDasharray="2 4" />
      {bars.map((bar, index) => {
        if (bar.entradas <= 0) return null;
        const h = Math.max(4, (bar.entradas / maxIn) * UP);
        const reveal = revealFor(level, "grow-y", index, 0.1);
        const shape = (
          <>
            <rect x={x(index) - barW / 2} y={MID - h} width={barW} height={h} rx={Math.min(3, barW / 2)} fill={chart.inflow} opacity={0.85} />
            {!weekly ? <circle cx={x(index)} cy={MID - h - 10} r={3.5} fill={chart.inflow} /> : null}
          </>
        );
        if (!animated) return <g key={bar.date}>{shape}</g>;
        return (
          <m.g
            key={bar.date}
            className="cc-flow-in"
            data-hover={hover === index || undefined}
            style={{ transformOrigin: `${x(index)}px ${MID}px` }}
            initial={reveal.initial}
            animate={{ scaleY: 1, opacity: 1 }}
            transition={reveal.transition}
          >
            {shape}
          </m.g>
        );
      })}
      {animated ? (
        <>
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
        </>
      ) : (
        <>
          <path d={outArea} fill={chart.outflow} opacity={0.16} />
          <path d={outLine} fill="none" stroke={chart.outflow} strokeWidth={2} strokeLinejoin="round" />
        </>
      )}
    </>
  );

  return (
    <CommandPanel
      area="flow"
      title="Entradas e saídas"
      aside={
        <Group gap={8} wrap="wrap">
          {zoom ? (
            <Button size="compact-xs" variant="light" onClick={() => setZoom(null)}>
              Voltar a {RANGE_LABEL[range]}
            </Button>
          ) : null}
          {level !== "nenhum" ? (
            <Chip size="xs" checked={lensOn} onChange={setLensOn}>
              Lupa
            </Chip>
          ) : null}
          <SegmentedControl
            size="xs"
            value={range}
            onChange={(value) => onRange(value as FlowRange)}
            data={(Object.keys(RANGE_LABEL) as FlowRange[]).map((value) => ({ value, label: RANGE_LABEL[value] }))}
          />
        </Group>
      }
    >
      <div className="cc-flow-head">
        <div>
          Entrou {periodLabel}
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
        <span className="cc-flow-hint">Arraste no gráfico para ver um período de perto.</span>
      </div>

      <div ref={ref} className="cc-flow-plot">
        {loading || width === 0 ? (
          <Skeleton h={HEIGHT} radius="sm" />
        ) : (
          <svg
            key={zoom ? `${zoom.from}-${zoom.to}` : "all"}
            width={width}
            height={HEIGHT}
            role="img"
            aria-label={`${periodLabel}: entraram ${entrou} e saíram ${saiu} unidades`}
          >
            <defs>
              <clipPath id="cc-lens-clip">
                <circle cx={cursor?.x ?? -999} cy={cursor?.y ?? -999} r={LENS_R} />
              </clipPath>
              <radialGradient id="cc-comet">
                <stop offset="0" stopColor={chart.outflow} />
                <stop offset="1" stopColor={chart.outflow} stopOpacity={0} />
              </radialGradient>
            </defs>

            {content(true)}

            {level === "completo" && bars.length > 1 ? (
              <g className="cc-comet" aria-hidden>
                <circle r={13} fill="url(#cc-comet)" />
                <circle r={3.2} fill="#fff" />
                <animateMotion dur="9s" repeatCount="indefinite" path={outLine} />
              </g>
            ) : null}

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

            {brush ? (
              <rect
                className="cc-flow-brush"
                x={Math.min(brush.start, brush.end)}
                y={0}
                width={Math.abs(brush.end - brush.start)}
                height={HEIGHT - 20}
              />
            ) : null}

            {showLens && cursor ? (
              <g className="cc-lens" pointerEvents="none">
                <g clipPath="url(#cc-lens-clip)">
                  <circle cx={cursor.x} cy={cursor.y} r={LENS_R} fill="var(--surface-solid)" />
                  <g transform={`translate(${cursor.x * (1 - LENS_ZOOM)} ${cursor.y * (1 - LENS_ZOOM)}) scale(${LENS_ZOOM})`}>
                    {content(false)}
                  </g>
                </g>
                <circle cx={cursor.x} cy={cursor.y} r={LENS_R} fill="none" stroke="var(--accent)" strokeWidth={2} />
              </g>
            ) : null}

            <rect
              x={0}
              y={0}
              width={plotW}
              height={HEIGHT}
              fill="transparent"
              style={{ cursor: "crosshair", touchAction: "pan-y" }}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={() => setBrush(null)}
              onPointerLeave={() => {
                if (brush) return;
                setHover(null);
                setCursor(null);
              }}
            />
          </svg>
        )}
        {hovered && hover !== null && !brush ? (
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
