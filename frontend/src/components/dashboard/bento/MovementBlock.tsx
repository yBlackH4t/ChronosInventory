import { Group, Skeleton, Text } from "@mantine/core";
import { m } from "motion/react";
import dayjs from "dayjs";
import EmptyState from "../../ui/EmptyState";
import BentoCard from "./BentoCard";
import DrawnSparkline from "./DrawnSparkline";
import { useChartTheme } from "../../../lib/chartTheme";
import { useMotionLevel } from "../../../lib/motionContext";
import { revealFor } from "../../../lib/dashboardMotion";
import { sum, type BalancePoint } from "../../../lib/dashboardMath";

type MovementBlockProps = {
  data: BalancePoint[];
  loading: boolean;
  periodMode: "week" | "month";
  subtitle: string;
  onShowMonth?: () => void;
};

function barLabel(point: BalancePoint, periodMode: "week" | "month"): string {
  return periodMode === "week" ? dayjs(point.key).format("ddd") : point.label;
}

// Entradas e saídas em barras que crescem; o saldo num gráfico pequeno à parte (um eixo
// por gráfico, sem eixo duplo).
export default function MovementBlock({ data, loading, periodMode, subtitle, onShowMonth }: MovementBlockProps) {
  const chart = useChartTheme();
  const level = useMotionLevel();
  const max = Math.max(0, ...data.map((p) => Math.max(p.entradas, p.saidas)));
  const totalIn = sum(data.map((p) => p.entradas));
  const totalOut = sum(data.map((p) => p.saidas));
  const saldo = data.map((p) => p.saldo).filter((v): v is number => v !== null);
  const lastSaldo = saldo.length ? saldo[saldo.length - 1] : null;
  const firstSaldo = saldo.length ? saldo[0] : null;
  const title = periodMode === "week" ? "Movimento da semana" : "Movimento do mês";
  const hasMovement = totalIn > 0 || totalOut > 0;

  const legend = (
    <div className="bento-legend">
      <span className="bento-legend-item">
        <span className="bento-swatch" style={{ background: chart.semantic.inflow }} />
        Entradas <b className="num" style={{ color: "var(--text)" }}>{totalIn.toLocaleString("pt-BR")}</b>
      </span>
      <span className="bento-legend-item">
        <span className="bento-swatch" style={{ background: chart.semantic.outflow }} />
        Saídas <b className="num" style={{ color: "var(--text)" }}>{totalOut.toLocaleString("pt-BR")}</b>
      </span>
    </div>
  );

  return (
    <BentoCard area="mov" title={title} subtitle={subtitle} actions={hasMovement && !loading ? legend : undefined}>
      {loading ? (
        <Skeleton h={170} radius="md" />
      ) : !hasMovement && lastSaldo === null ? (
        <EmptyState
          message="Sem movimentações no período"
          actionLabel={onShowMonth ? "Ver o mês inteiro" : undefined}
          onAction={onShowMonth}
        />
      ) : (
        <>
          <div
            className="bento-bars"
            role="img"
            aria-label={`${title}: ${totalIn} unidades entraram e ${totalOut} saíram`}
          >
            {data.map((point, index) => {
              const reveal = revealFor(level, "grow-y", index, 0.2);
              const height = (value: number) => (max > 0 ? `${(value / max) * 100}%` : "0%");
              return (
                <div key={point.key} className="bento-bar-group">
                  <m.div
                    className="bento-bar"
                    style={{ height: height(point.entradas), background: chart.semantic.inflow }}
                    initial={reveal.initial}
                    animate={{ scaleY: 1, opacity: 1 }}
                    transition={reveal.transition}
                    title={`${point.label}: ${point.entradas} entradas`}
                  />
                  <m.div
                    className="bento-bar"
                    style={{ height: height(point.saidas), background: chart.semantic.outflow }}
                    initial={reveal.initial}
                    animate={{ scaleY: 1, opacity: 1 }}
                    transition={{ ...reveal.transition, delay: reveal.transition.delay + 0.04 }}
                    title={`${point.label}: ${point.saidas} saídas`}
                  />
                </div>
              );
            })}
          </div>
          <div className="bento-bar-labels" aria-hidden>
            {data.map((point) => (
              <span key={point.key}>{barLabel(point, periodMode)}</span>
            ))}
          </div>

          {saldo.length > 1 && lastSaldo !== null ? (
            <div className="bento-saldo">
              <Group justify="space-between" align="baseline" gap="xs" mb={4}>
                <Text size="xs" c="dimmed">
                  Saldo do estoque no período
                </Text>
                <Text size="sm" fw={600} className="num">
                  {lastSaldo.toLocaleString("pt-BR")} unidades
                  {firstSaldo !== null && firstSaldo !== lastSaldo ? (
                    <Text span size="xs" c="dimmed" fw={400}>
                      {" "}
                      ({lastSaldo > firstSaldo ? "+" : ""}
                      {(lastSaldo - firstSaldo).toLocaleString("pt-BR")})
                    </Text>
                  ) : null}
                </Text>
              </Group>
              <DrawnSparkline
                values={saldo}
                color={chart.accent}
                height={34}
                delay={0.5}
                label={`Saldo de ${firstSaldo?.toLocaleString("pt-BR")} para ${lastSaldo.toLocaleString("pt-BR")} unidades`}
              />
            </div>
          ) : null}
        </>
      )}
    </BentoCard>
  );
}
