import type { ReactNode } from "react";

type CommandPanelProps = {
  area: "sys" | "core" | "alert" | "flow";
  title: string;
  /** Fica à direita do título (contagem, seletor). */
  aside?: ReactNode;
  children: ReactNode;
};

// Painel do Centro de comando: vidro com cantoneiras na cor do app.
export default function CommandPanel({ area, title, aside, children }: CommandPanelProps) {
  const headingId = `cc-${area}`;
  return (
    <section className="cc-panel surface-panel" data-area={area} aria-labelledby={headingId}>
      <div className="cc-panel-head">
        <h2 className="cc-panel-title" id={headingId}>
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}
