import type { ReactNode } from "react";

type ReportPaperPreviewProps = {
  title: string;
  /** Colunas como saem no PDF. */
  columns: string[];
  /** Quantas linhas desenhar na miniatura (até 9). */
  rows?: number;
  /** Números de verdade, ao lado da folha. */
  facts?: { label: string; value: ReactNode; tone?: "accent" | "warning" | "danger" }[];
};

const ROW_WIDTHS = [86, 72, 94, 64, 80, 70, 90, 60, 76];

// Miniatura da folha A4 que o relatório vai gerar: cabeçalho, colunas e linhas.
// Ao trocar de relatório, as linhas "imprimem" uma a uma (só nos níveis Suave e Completo).
export default function ReportPaperPreview({ title, columns, rows = 7, facts = [] }: ReportPaperPreviewProps) {
  const shown = Math.max(1, Math.min(rows, ROW_WIDTHS.length));
  return (
    <div className="vt-report-preview">
      <div className="vt-paper" aria-hidden key={title}>
        <div className="vt-paper-head">
          <span className="vt-paper-logo" />
          <span className="vt-paper-title">{title}</span>
        </div>
        <span className="vt-paper-line" style={{ width: "46%" }} />
        <div className="vt-paper-cols" style={{ gridTemplateColumns: `2.4fr repeat(${columns.length - 1}, 1fr)` }}>
          {columns.map((column) => (
            <span key={column}>{column}</span>
          ))}
        </div>
        {Array.from({ length: shown }, (_, index) => (
          <div
            key={index}
            className="vt-paper-row"
            style={{ gridTemplateColumns: `2.4fr repeat(${columns.length - 1}, 1fr)`, animationDelay: `${120 + index * 55}ms` }}
          >
            <span style={{ width: `${ROW_WIDTHS[index]}%` }} />
            {columns.slice(1).map((column) => (
              <span key={column} className="vt-paper-num" />
            ))}
          </div>
        ))}
        <span className="vt-paper-foot" />
      </div>
      {facts.length > 0 && (
        <dl className="vt-report-facts">
          {facts.map((fact) => (
            <div key={fact.label} data-tone={fact.tone}>
              <dt>{fact.label}</dt>
              <dd className="num">{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
