import type { InventorySessionSummaryOut, InventoryStatusFilter } from "../../lib/api";
import StatTile from "../ui/StatTile";

type SummaryFilter = "NOT_COUNTED" | "MISSING" | "SURPLUS" | "MATCHED" | "PENDING";

type InventorySummaryCardsProps = {
  summary: InventorySessionSummaryOut;
  activeFilter?: InventoryStatusFilter;
  onSelectFilter: (filter: SummaryFilter) => void;
};

export function InventorySummaryCards({
  summary,
  activeFilter,
  onSelectFilter,
}: InventorySummaryCardsProps) {
  const tiles: {
    key: SummaryFilter;
    label: string;
    value: number;
    accent?: string;
  }[] = [
    { key: "NOT_COUNTED", label: "Não contados", value: summary.not_counted_items },
    {
      key: "MISSING",
      label: "Faltando no físico",
      value: summary.missing_items,
      accent: "var(--warning)",
    },
    {
      key: "SURPLUS",
      label: "Sobrando no físico",
      value: summary.surplus_items,
      accent: "var(--mantine-color-teal-filled)",
    },
    {
      key: "MATCHED",
      label: "Conferidos OK",
      value: summary.matched_items,
      accent: "var(--success)",
    },
    {
      key: "PENDING",
      label: "Pendentes de ajuste",
      value: summary.pending_items,
      accent: "var(--mantine-color-blue-filled)",
    },
  ];

  const total = summary.total_items;

  return (
    <div className="stat-grid">
      {tiles.map((tile) => (
        <StatTile
          key={tile.key}
          label={tile.label}
          value={tile.value}
          accent={tile.accent}
          footer={
            <div className="vt-share" aria-hidden>
              <span
                style={{
                  width: `${total > 0 ? Math.round((tile.value / total) * 100) : 0}%`,
                  background: tile.accent ?? "var(--text-muted)",
                }}
              />
            </div>
          }
          hint={total > 0 ? `${Math.round((tile.value / total) * 100)}% dos itens` : undefined}
          active={activeFilter === tile.key}
          onClick={() => onSelectFilter(tile.key)}
        />
      ))}
    </div>
  );
}
