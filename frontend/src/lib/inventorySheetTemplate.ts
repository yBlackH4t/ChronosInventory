type InventorySheetTemplateInput = {
  sessionName?: string;
  local?: string;
  generatedAt?: Date;
  totalRows?: number;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    hour12: false,
  }).format(date);
}

function buildRows(totalRows: number): string {
  const rows = [];
  let remaining = totalRows;
  while (remaining > 0) {
    rows.push(
      `<tr>
        <td class="col-code"></td>
        <td class="col-tally"></td>
        <td class="col-qty"></td>
      </tr>`
    );
    remaining -= 1;
  }
  return rows.join("\n");
}

export function buildInventorySheetHtml(input: InventorySheetTemplateInput = {}): string {
  const generatedAt = input.generatedAt ?? new Date();
  const sessionName = escapeHtml((input.sessionName || "").trim() || "Sessao manual");
  const local = escapeHtml((input.local || "").trim() || "CANOAS");
  const totalRows = Number.isFinite(input.totalRows) ? Math.max(20, Number(input.totalRows)) : 56;

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>Folha de Inventario</title>
    <style>
      :root {
        color-scheme: only light;
      }
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        background: #f4f6fb;
        color: #0f172a;
        font-family: "Segoe UI", Tahoma, sans-serif;
      }
      .page {
        width: 210mm;
        min-height: 297mm;
        margin: 10mm auto;
        background: #ffffff;
        padding: 10mm;
      }
      .header {
        border: 1px solid #cbd5e1;
        border-radius: 8px;
        padding: 8px 10px;
        margin-bottom: 8px;
      }
      .brand {
        margin: 0 0 4px;
        font-size: 20px;
        font-weight: 700;
      }
      .subtitle {
        margin: 0;
        font-size: 12px;
        color: #475569;
      }
      .meta {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 6px;
        margin-top: 8px;
        font-size: 12px;
      }
      .meta strong {
        font-weight: 700;
      }
      .legend {
        margin: 0 0 8px;
        padding: 6px 10px;
        border: 1px solid #bfdbfe;
        border-radius: 8px;
        font-size: 12px;
        color: #1e3a8a;
        background: #eff6ff;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
      }
      thead th {
        border: 1px solid #94a3b8;
        background: #e2e8f0;
        color: #0f172a;
        font-size: 11px;
        font-weight: 700;
        padding: 5px;
        text-align: left;
      }
      tbody td {
        border: 1px solid #cbd5e1;
        font-size: 10px;
        height: 20px;
      }
      .col-code {
        width: 45%;
      }
      .col-tally {
        width: 45%;
      }
      .col-qty {
        width: 10%;
      }
      .footer {
        margin-top: 8px;
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
        font-size: 11px;
      }
      .signature {
        border-top: 1px solid #94a3b8;
        padding-top: 4px;
      }
      @media print {
        body {
          background: #ffffff;
        }
        .page {
          margin: 0;
          width: 100%;
          min-height: auto;
          padding: 0;
        }
      }
    </style>
  </head>
  <body>
    <main class="page">
      <section class="header">
        <p class="brand">Chronos Inventory - Folha de Inventario</p>
        <p class="subtitle">Preencha no papel e depois transcreva para a sessao no sistema.</p>
        <div class="meta">
          <div><strong>Sessao:</strong> ${sessionName}</div>
          <div><strong>Local:</strong> ${local}</div>
          <div><strong>Gerado em:</strong> ${formatDateTime(generatedAt)}</div>
          <div><strong>Responsavel:</strong> _______________________</div>
        </div>
      </section>

      <p class="legend">
        Legenda de contagem por palitinho: cada risco vale 1, e grupo de 5 = quatro riscos + um risco diagonal.
        No fim, escreva a quantidade final na coluna "Qtd final".
      </p>

      <table>
        <thead>
          <tr>
            <th class="col-code">Codigo</th>
            <th class="col-tally">Palitinhos</th>
            <th class="col-qty">Qtd final</th>
          </tr>
        </thead>
        <tbody>
          ${buildRows(totalRows)}
        </tbody>
      </table>

      <section class="footer">
        <div class="signature">Conferido por: ________________________________________________</div>
        <div class="signature">Digitado no sistema por: ______________________________________</div>
      </section>
    </main>
  </body>
</html>`;
}
