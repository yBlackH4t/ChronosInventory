import type { ReactNode } from "react";

import { trackCursorGlow } from "../../../lib/cursorGlow";

type BentoCardProps = {
  area: "acao" | "saude" | "assist" | "mov" | "top" | "ativ";
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
};

// Bloco do Painel: vidro (surface-panel), título e o conteúdo. O lugar na grade vem da área.
export default function BentoCard({ area, title, subtitle, actions, children }: BentoCardProps) {
  const headingId = `bento-${area}`;
  return (
    <section
      className="bento-card surface-panel mi-glow"
      data-area={area}
      aria-labelledby={headingId}
      onPointerMove={trackCursorGlow}
    >
      <div className="bento-card-head">
        <div style={{ minWidth: 0 }}>
          <h2 className="bento-title" id={headingId}>
            {title}
          </h2>
          {subtitle ? <p className="bento-subtitle">{subtitle}</p> : null}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}
