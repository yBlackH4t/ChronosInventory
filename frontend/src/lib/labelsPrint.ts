import JsBarcode from "jsbarcode";
import type { Product } from "./api";

export type LabelPrintableItem = Pick<Product, "id" | "nome" | "total_stock">;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function deriveLabelCode(product: LabelPrintableItem): string {
  const byDigits = product.nome.match(/\d{5,}/);
  if (byDigits?.[0]) return byDigits[0];

  const byToken = product.nome
    .toUpperCase()
    .match(/[A-Z0-9]{5,}/g)
    ?.find((token) => /\d/.test(token));
  if (byToken) return byToken;

  return `ID${product.id}`;
}

export function barcodePayload(product: LabelPrintableItem): string {
  return `CI-${product.id}`;
}

function renderBarcodeSvg(payload: string): string {
  if (typeof document === "undefined") {
    return `<div style="font-size:10px;">${escapeHtml(payload)}</div>`;
  }

  try {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    JsBarcode(svg, payload, {
      format: "CODE128",
      width: 1.4,
      height: 44,
      margin: 0,
      displayValue: false,
      background: "#ffffff",
    });
    return svg.outerHTML;
  } catch {
    return `<div style="font-size:10px;">${escapeHtml(payload)}</div>`;
  }
}

export function buildLabelsPrintHtml(items: LabelPrintableItem[]): string {
  const cards = items
    .map((item) => {
      const code = deriveLabelCode(item);
      const payload = barcodePayload(item);
      const barcode = renderBarcodeSvg(payload);
      return `
        <article class="label-card">
          <header class="label-head">
            <span class="brand">Chronos</span>
            <span class="stock">Estoque: ${item.total_stock}</span>
          </header>
          <div class="name">${escapeHtml(item.nome)}</div>
          <div class="code">${escapeHtml(code)}</div>
          <div class="barcode">${barcode}</div>
          <footer class="meta">
            <span>ID ${item.id}</span>
            <span>${escapeHtml(payload)}</span>
          </footer>
        </article>
      `;
    })
    .join("\n");

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>Etiquetas - Chronos Inventory</title>
    <style>
      :root { color-scheme: only light; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: #f5f7fb;
        font-family: "Segoe UI", Tahoma, sans-serif;
        color: #111827;
      }
      .sheet {
        width: 210mm;
        min-height: 297mm;
        margin: 0 auto;
        padding: 8mm;
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 4mm;
      }
      .label-card {
        border: 1px dashed #9ca3af;
        border-radius: 6px;
        background: #fff;
        padding: 2.5mm;
        min-height: 34mm;
        display: grid;
        gap: 1mm;
        align-content: start;
      }
      .label-head {
        display: flex;
        justify-content: space-between;
        font-size: 9px;
      }
      .brand {
        font-weight: 700;
      }
      .stock {
        color: #6b7280;
      }
      .name {
        font-size: 10px;
        line-height: 1.2;
        min-height: 10px;
        max-height: 24px;
        overflow: hidden;
      }
      .code {
        font-size: 17px;
        line-height: 1;
        letter-spacing: 0.6px;
        font-weight: 700;
      }
      .barcode {
        height: 13mm;
        display: flex;
        align-items: center;
      }
      .barcode svg {
        width: 100%;
        height: 100%;
      }
      .meta {
        display: flex;
        justify-content: space-between;
        font-size: 8px;
        color: #4b5563;
      }
      @media print {
        body { background: #fff; }
        .sheet {
          width: 100%;
          min-height: auto;
          margin: 0;
          padding: 6mm;
          gap: 3mm;
        }
      }
    </style>
  </head>
  <body>
    <main class="sheet">
      ${cards}
    </main>
  </body>
</html>`;
}
