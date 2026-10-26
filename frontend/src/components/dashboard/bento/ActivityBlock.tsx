import { Skeleton, Stack } from "@mantine/core";
import { m } from "motion/react";
import EmptyState from "../../ui/EmptyState";
import BentoCard from "./BentoCard";
import { useMotionLevel } from "../../../lib/motionContext";
import { revealFor } from "../../../lib/dashboardMotion";
import { activityTimeLabel } from "../../../lib/dashboardBento";
import { movementNatureLabel } from "../../../lib/movements";
import { movementTone } from "../../../lib/semantic";
import type { MovementOut } from "../../../lib/api";

const TYPE_LABEL: Record<MovementOut["tipo"], string> = {
  ENTRADA: "Entrada",
  SAIDA: "Saída",
  TRANSFERENCIA: "Transferência",
};

type ActivityBlockProps = {
  rows: MovementOut[];
  loading: boolean;
  locationName: (id: number | null | undefined) => string | null;
  onOpenProduct: (produtoId: number, nome: string) => void;
};

function placeLabel(row: MovementOut, locationName: ActivityBlockProps["locationName"]): string | null {
  const from = locationName(row.origem_location_id);
  const to = locationName(row.destino_location_id);
  if (row.tipo === "TRANSFERENCIA" && from && to) return `${from} → ${to}`;
  return row.tipo === "ENTRADA" ? to : from;
}

// Últimas movimentações. A lista se atualiza sozinha; a linha nova desce do topo
// (as que já estavam não se mexem de novo).
export default function ActivityBlock({ rows, loading, locationName, onOpenProduct }: ActivityBlockProps) {
  const level = useMotionLevel();

  return (
    <BentoCard area="ativ" title="Atividade ao vivo" subtitle="Últimas movimentações, atualiza sozinha">
      {loading ? (
        <Stack gap={10} pt={4}>
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} h={30} radius="sm" />
          ))}
        </Stack>
      ) : rows.length === 0 ? (
        <EmptyState message="Nenhuma movimentação ainda" />
      ) : (
        <ul className="bento-activity" aria-live="polite">
          {rows.map((row, index) => {
            const reveal = revealFor(level, "slide", index, 0.2);
            const nome = row.produto_nome || `Produto #${row.produto_id}`;
            const nature = row.natureza && row.natureza !== "OPERACAO_NORMAL" ? movementNatureLabel(row.natureza) : null;
            const place = placeLabel(row, locationName);
            const detail = [nature, place, activityTimeLabel(row.data)].filter(Boolean).join(" · ");
            return (
              <m.li
                key={row.id}
                initial={reveal.initial}
                animate={{ opacity: 1, y: 0 }}
                transition={reveal.transition}
              >
                <button
                  type="button"
                  className="bento-activity-row"
                  onClick={() => onOpenProduct(row.produto_id, nome)}
                  title={nome}
                >
                  <span
                    className="bento-activity-dot"
                    style={{ background: `var(--mantine-color-${movementTone(row.tipo, row.natureza)}-filled)` }}
                    aria-hidden
                  />
                  <span className="bento-action-text">
                    <span className="bento-action-name" style={{ fontSize: "0.85rem" }}>
                      <b style={{ fontWeight: 600 }}>
                        {TYPE_LABEL[row.tipo]} de {row.quantidade.toLocaleString("pt-BR")}
                      </b>{" "}
                      {nome}
                    </span>
                    <span className="bento-action-detail num">{detail}</span>
                  </span>
                </button>
              </m.li>
            );
          })}
        </ul>
      )}
    </BentoCard>
  );
}
