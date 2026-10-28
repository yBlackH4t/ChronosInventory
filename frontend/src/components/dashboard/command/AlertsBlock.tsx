import { Skeleton, Stack } from "@mantine/core";
import { m } from "motion/react";
import EmptyState from "../../ui/EmptyState";
import CommandPanel from "./CommandPanel";
import { useMotionLevel } from "../../../lib/motionContext";
import { revealFor } from "../../../lib/dashboardMotion";
import { ACTION_LABELS, type ActionItem } from "../../../lib/dashboardActions";

type AlertsBlockProps = {
  items: ActionItem[];
  loading: boolean;
  onOpenProduct: (produtoId: number, nome: string) => void;
};

// Coluna da direita: o que pede ação hoje, do mais urgente ao parado. Clicar abre a ficha.
export default function AlertsBlock({ items, loading, onOpenProduct }: AlertsBlockProps) {
  const level = useMotionLevel();

  return (
    <CommandPanel
      area="alert"
      title="Pede ação hoje"
      aside={loading ? null : <span className="cc-count cc-mono">{items.length}</span>}
    >
      {loading ? (
        <Stack gap={12}>
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} h={38} radius="sm" />
          ))}
        </Stack>
      ) : items.length === 0 ? (
        <EmptyState
          message="Nada pede ação hoje"
          description="Nenhum produto zerado com venda, perto de zerar ou parado ocupando espaço."
        />
      ) : (
        <ul className="cc-alerts">
          {items.map((item, index) => {
            const reveal = revealFor(level, "slide", index, 0.2);
            return (
              <m.li
                key={`${item.kind}-${item.produtoId}`}
                initial={reveal.initial}
                animate={{ opacity: 1, y: 0 }}
                transition={reveal.transition}
              >
                <button
                  type="button"
                  className="cc-alert"
                  data-kind={item.kind}
                  onClick={() => onOpenProduct(item.produtoId, item.nome)}
                  title={item.nome}
                >
                  <i aria-hidden />
                  <span className="cc-alert-text">
                    <span className="cc-alert-name">{item.nome}</span>
                    <span className="cc-alert-detail">{item.detail}</span>
                  </span>
                  <span className="cc-alert-tag cc-mono">{ACTION_LABELS[item.kind]}</span>
                </button>
              </m.li>
            );
          })}
        </ul>
      )}
    </CommandPanel>
  );
}
