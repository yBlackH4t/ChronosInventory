import { Tooltip } from "@mantine/core";
import dayjs from "dayjs";
import { useMemo } from "react";

import type { MovementOut } from "../../lib/api";
import { dayAnchorId, minimapDays } from "../../lib/movementMinimap";
import { useMotionLevel } from "../../lib/motionContext";

// Minimapa da lista por dia: um traço por dia (mais alto = mais unidades), verde para
// entradas e laranja para saídas. Passar o mouse mostra os totais; clicar rola até o dia.
export default function MovementsMinimap({ rows }: { rows: MovementOut[] }) {
  const level = useMotionLevel();
  const days = useMemo(() => [...minimapDays(rows)].reverse(), [rows]);
  if (days.length < 2) return null;
  const max = Math.max(1, ...days.map((d) => d.entradas + d.saidas + d.transferencias));

  const jump = (day: string) => {
    document.getElementById(dayAnchorId(day))?.scrollIntoView({
      behavior: level === "nenhum" ? "auto" : "smooth",
      block: "start",
    });
  };

  return (
    <nav className="mi-minimap" aria-label="Dias da lista">
      {days.map((d) => {
        const total = d.entradas + d.saidas + d.transferencias;
        const height = 18 + Math.round((total / max) * 26);
        const parts = [
          d.entradas ? `${d.entradas} entrada${d.entradas > 1 ? "s" : ""}` : null,
          d.saidas ? `${d.saidas} saída${d.saidas > 1 ? "s" : ""}` : null,
          d.transferencias ? `${d.transferencias} transferida${d.transferencias > 1 ? "s" : ""}` : null,
        ].filter(Boolean);
        const label = `${dayjs(d.day).format("ddd DD/MM")}: ${parts.join(" · ") || "sem unidades"} (${d.count} mov.)`;
        return (
          <Tooltip key={d.day} label={label} openDelay={80} withArrow>
            <button type="button" className="mi-minimap-tick" onClick={() => jump(d.day)} aria-label={label}>
              <span className="mi-minimap-bar" style={{ height }}>
                <span style={{ flexGrow: d.entradas, background: "var(--success)" }} />
                <span style={{ flexGrow: d.transferencias, background: "var(--pm-transfer-text)" }} />
                <span style={{ flexGrow: d.saidas, background: "var(--warning)" }} />
              </span>
              <span className="mi-minimap-day num">{dayjs(d.day).format("DD")}</span>
            </button>
          </Tooltip>
        );
      })}
    </nav>
  );
}
