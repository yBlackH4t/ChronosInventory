import { Skeleton, Stack } from "@mantine/core";
import { m } from "motion/react";
import EmptyState from "../../ui/EmptyState";
import BentoCard from "./BentoCard";
import { useChartTheme } from "../../../lib/chartTheme";
import { useMotionLevel } from "../../../lib/motionContext";
import { revealFor } from "../../../lib/dashboardMotion";
import type { TopSaidaItem } from "../../../lib/api";

type TopSaidasBlockProps = {
  items: TopSaidaItem[];
  loading: boolean;
  subtitle: string;
  onShowMonth?: () => void;
  onOpenProduct: (produtoId: number, nome: string) => void;
};

// Ranking das saídas do período: as barras enchem uma depois da outra.
export default function TopSaidasBlock({ items, loading, subtitle, onShowMonth, onOpenProduct }: TopSaidasBlockProps) {
  const chart = useChartTheme();
  const level = useMotionLevel();
  const ranked = items.filter((item) => item.total_saida > 0);
  const max = Math.max(0, ...ranked.map((item) => item.total_saida));

  return (
    <BentoCard area="top" title="Mais saídas" subtitle={subtitle}>
      {loading ? (
        <Stack gap={14} pt={4}>
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} h={28} radius="sm" />
          ))}
        </Stack>
      ) : ranked.length === 0 ? (
        <EmptyState
          message="Sem saídas no período"
          actionLabel={onShowMonth ? "Ver o mês inteiro" : undefined}
          onAction={onShowMonth}
        />
      ) : (
        <ul className="bento-actions" style={{ gap: 4 }}>
          {ranked.map((item, index) => {
            const reveal = revealFor(level, "grow-x", index, 0.3);
            return (
              <li key={item.produto_id}>
                <button
                  type="button"
                  className="bento-action"
                  style={{ flexDirection: "column", alignItems: "stretch", gap: 6, padding: "7px 10px" }}
                  onClick={() => onOpenProduct(item.produto_id, item.nome)}
                  title={item.nome}
                >
                  <span style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
                    <span className="num" style={{ color: "var(--text-subtle)", fontSize: "0.75rem", width: 14 }}>
                      {index + 1}
                    </span>
                    <span className="bento-action-name" style={{ flex: 1, fontSize: "0.85rem" }}>
                      {item.nome}
                    </span>
                    <b className="num" style={{ fontSize: "0.9rem", color: "var(--text)" }}>
                      {item.total_saida.toLocaleString("pt-BR")}
                    </b>
                  </span>
                  <span className="bento-rank-track" style={{ marginLeft: 22 }}>
                    <m.span
                      className="bento-rank-fill"
                      style={{
                        display: "block",
                        width: `${max > 0 ? Math.max((item.total_saida / max) * 100, 3) : 0}%`,
                        background: chart.semantic.outflow,
                      }}
                      initial={reveal.initial}
                      animate={{ scaleX: 1, opacity: 1 }}
                      transition={reveal.transition}
                    />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </BentoCard>
  );
}
