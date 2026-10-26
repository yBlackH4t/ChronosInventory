import { Badge, Skeleton, Stack } from "@mantine/core";
import { IconAlertTriangle, IconHourglassLow, IconPackageOff } from "@tabler/icons-react";
import { m } from "motion/react";
import EmptyState from "../../ui/EmptyState";
import BentoCard from "./BentoCard";
import { useMotionLevel } from "../../../lib/motionContext";
import { revealFor } from "../../../lib/dashboardMotion";
import { ACTION_LABELS, type ActionItem, type ActionKind } from "../../../lib/dashboardActions";

const TAG_COLOR: Record<ActionKind, string> = {
  ZERADO: "danger",
  REPOR: "warning",
  PARADO: "gray",
};

const ICON: Record<ActionKind, typeof IconPackageOff> = {
  ZERADO: IconPackageOff,
  REPOR: IconAlertTriangle,
  PARADO: IconHourglassLow,
};

type ActionListBlockProps = {
  items: ActionItem[];
  loading: boolean;
  subtitle: string;
  onOpenProduct: (produtoId: number, nome: string) => void;
};

// O maior bloco: o que fazer hoje, numa lista só. Clicar abre a ficha do produto.
export default function ActionListBlock({ items, loading, subtitle, onOpenProduct }: ActionListBlockProps) {
  const level = useMotionLevel();

  return (
    <BentoCard area="acao" title="Pede ação hoje" subtitle={subtitle}>
      {loading ? (
        <Stack gap={10} pt={4}>
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} h={40} radius="md" />
          ))}
        </Stack>
      ) : items.length === 0 ? (
        <EmptyState
          message="Nada pede ação hoje"
          description="Nenhum produto zerado com venda, perto de zerar ou parado ocupando espaço."
        />
      ) : (
        <ul className="bento-actions">
          {items.map((item, index) => {
            const Icon = ICON[item.kind];
            const reveal = revealFor(level, "slide", index, 0.15);
            return (
              <m.li
                key={`${item.kind}-${item.produtoId}`}
                initial={reveal.initial}
                animate={{ opacity: 1, y: 0 }}
                transition={reveal.transition}
              >
                <button
                  type="button"
                  className="bento-action"
                  onClick={() => onOpenProduct(item.produtoId, item.nome)}
                  title={item.nome}
                >
                  <span className="bento-action-icon" data-kind={item.kind} aria-hidden>
                    <Icon size={18} stroke={1.7} />
                  </span>
                  <span className="bento-action-text">
                    <span className="bento-action-name">{item.nome}</span>
                    <span className="bento-action-detail num">{item.detail}</span>
                  </span>
                  <Badge variant="light" color={TAG_COLOR[item.kind]} tt="none" style={{ flexShrink: 0 }}>
                    {ACTION_LABELS[item.kind]}
                  </Badge>
                </button>
              </m.li>
            );
          })}
        </ul>
      )}
    </BentoCard>
  );
}
