import { useState } from "react";
import { activityTimeLabel } from "../../../lib/dashboardBento";
import { movementTone } from "../../../lib/semantic";
import { useMotionLevel } from "../../../lib/motionContext";
import type { MovementOut } from "../../../lib/api";

const TYPE_LABEL: Record<MovementOut["tipo"], string> = {
  ENTRADA: "Entrada",
  SAIDA: "Saída",
  TRANSFERENCIA: "Transferência",
};

type LiveTickerProps = {
  rows: MovementOut[];
  locationName: (id: number | null | undefined) => string | null;
  onOpenProduct: (produtoId: number, nome: string) => void;
};

function placeLabel(row: MovementOut, locationName: LiveTickerProps["locationName"]): string | null {
  const from = locationName(row.origem_location_id);
  const to = locationName(row.destino_location_id);
  if (row.tipo === "TRANSFERENCIA" && from && to) return `${from} → ${to}`;
  return row.tipo === "ENTRADA" ? to : from;
}

// Faixa "ao vivo" com as últimas movimentações. No nível "Completo" ela corre devagar
// (para quando o mouse passa por cima); nos outros fica parada e rola com o mouse.
export default function LiveTicker({ rows, locationName, onOpenProduct }: LiveTickerProps) {
  const running = useMotionLevel() === "completo" && rows.length > 2;
  // Movimentação que chegou depois que a tela abriu entra piscando na cor de entrada.
  const rowsKey = rows.map((row) => row.id).join(",");
  const [seen, setSeen] = useState<{ key: string; ids: Set<number>; fresh: Set<number> } | null>(null);
  if (seen?.key !== rowsKey) {
    const fresh = new Set(seen ? rows.filter((row) => !seen.ids.has(row.id)).map((row) => row.id) : []);
    setSeen({ key: rowsKey, ids: new Set([...(seen?.ids ?? []), ...rows.map((row) => row.id)]), fresh });
  }
  const items = (copy: number) =>
    rows.map((row) => {
      const nome = row.produto_nome || `Produto #${row.produto_id}`;
      const place = placeLabel(row, locationName);
      return (
        <button
          key={`${copy}-${row.id}`}
          type="button"
          className="cc-tick"
          data-fresh={seen?.fresh.has(row.id) || undefined}
          onClick={() => onOpenProduct(row.produto_id, nome)}
          tabIndex={copy === 0 ? 0 : -1}
          aria-hidden={copy === 0 ? undefined : true}
          title={place ? `${nome} · ${place}` : nome}
        >
          <span className="cc-mono cc-tick-time">{activityTimeLabel(row.data)}</span>
          <span
            className="cc-tick-dot"
            style={{ background: `var(--mantine-color-${movementTone(row.tipo, row.natureza)}-filled)` }}
            aria-hidden
          />
          {TYPE_LABEL[row.tipo]} de {row.quantidade.toLocaleString("pt-BR")} {nome}
        </button>
      );
    });

  return (
    <section className="cc-ticker surface-panel" aria-label="Últimas movimentações">
      <span className="cc-ticker-label">
        <span className="cc-rec" aria-hidden />
        Ao vivo
      </span>
      <div className="cc-ticker-window" data-running={running || undefined}>
        {rows.length === 0 ? (
          <span className="cc-tick" style={{ cursor: "default" }}>
            Nenhuma movimentação ainda
          </span>
        ) : (
          <div className="cc-ticker-track" aria-live="polite">
            {items(0)}
            {running ? items(1) : null}
          </div>
        )}
      </div>
    </section>
  );
}
