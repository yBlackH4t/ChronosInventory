import React from "react";

/**
 * Renderiza texto com formatação estilo WhatsApp:
 * - `*negrito*` vira <strong>negrito</strong>
 * - quebras de linha `\n` viram <br />
 * Não interpreta tags HTML.
 */
export function formatWhatsAppText(text: string): React.ReactNode {
  if (!text) return null;
  const lines = text.split("\n");
  return lines.map((line, i) => (
    <React.Fragment key={i}>
      {line.split(/(\*[^*]+\*)/g).map((part, j) => {
        if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
          return <strong key={j}>{part.slice(1, -1)}</strong>;
        }
        return <span key={j}>{part}</span>;
      })}
      {i < lines.length - 1 && <br />}
    </React.Fragment>
  ));
}
