import JsBarcode from "jsbarcode";
import type { Product } from "./api";

export type LabelPrintableItem = Pick<Product, "id" | "nome" | "total_stock">;

export type ShippingLabelPrintableItem = {
  cliente: string;
  cidade: string;
  estado: string;
  transportadora: string;
  numeroNota: string;
  pesoKg: string;
  volumeIndex: number;
  volumeTotal: number;
  endereco: string;
  cep: string;
  remetente: string;
  remetenteLocal: string;
};

export type ShippingLabelFieldToken =
  | "cliente"
  | "cidade"
  | "estado"
  | "transportadora"
  | "numeroNota"
  | "pesoKg"
  | "volumeInfo"
  | "endereco"
  | "cep"
  | "cidadeUf"
  | "remetente"
  | "remetenteLocal";

export const SHIPPING_LABEL_FIELD_TOKEN_OPTIONS: {
  value: ShippingLabelFieldToken;
  label: string;
}[] = [
  { value: "cliente", label: "Cliente" },
  { value: "cidade", label: "Cidade" },
  { value: "estado", label: "Estado" },
  { value: "transportadora", label: "Transportadora" },
  { value: "numeroNota", label: "Número da nota" },
  { value: "pesoKg", label: "Peso (Kg)" },
  { value: "volumeInfo", label: "Volume (1/N)" },
  { value: "endereco", label: "Endereço (rua, nº, bairro)" },
  { value: "cep", label: "CEP" },
  { value: "cidadeUf", label: "Cidade / UF" },
  { value: "remetente", label: "Remetente (nome)" },
  { value: "remetenteLocal", label: "Remetente (cidade e CNPJ)" },
];

export type ShippingLabelDesignerItem = {
  id: string;
  kind: "text" | "token" | "image";
  text: string;
  token?: ShippingLabelFieldToken;
  src?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontWeight: 400 | 700;
  align: "left" | "center" | "right";
  objectFit: "contain" | "cover" | "fill";
  /** Moldura preta em volta do bloco (para montar caixas e divisões). */
  frame?: boolean;
  /** Fundo preto com letra branca (destaque). */
  inverted?: boolean;
};

export type ShippingLabelDesignerLayout = {
  name: string;
  widthPx: number;
  heightPx: number;
  pxPerMm: number;
  fontFamily: string;
  showBorder: boolean;
  items: ShippingLabelDesignerItem[];
};

const DEFAULT_DESIGNER_ITEMS: ShippingLabelDesignerItem[] = [
  {
    id: "cliente",
    kind: "token",
    text: "CLIENTE:",
    token: "cliente",
    x: 18,
    y: 22,
    width: 690,
    height: 30,
    fontSize: 18,
    fontWeight: 700,
    align: "left",
    objectFit: "contain",
  },
  {
    id: "cidade",
    kind: "token",
    text: "CIDADE:",
    token: "cidade",
    x: 18,
    y: 58,
    width: 490,
    height: 28,
    fontSize: 16,
    fontWeight: 700,
    align: "left",
    objectFit: "contain",
  },
  {
    id: "estado",
    kind: "token",
    text: "ESTADO:",
    token: "estado",
    x: 518,
    y: 58,
    width: 180,
    height: 28,
    fontSize: 16,
    fontWeight: 700,
    align: "left",
    objectFit: "contain",
  },
  {
    id: "transportadora",
    kind: "token",
    text: "TRANSP:",
    token: "transportadora",
    x: 18,
    y: 92,
    width: 690,
    height: 28,
    fontSize: 16,
    fontWeight: 700,
    align: "left",
    objectFit: "contain",
  },
  {
    id: "nota",
    kind: "token",
    text: "NOTA:",
    token: "numeroNota",
    x: 18,
    y: 126,
    width: 340,
    height: 28,
    fontSize: 16,
    fontWeight: 700,
    align: "left",
    objectFit: "contain",
  },
  {
    id: "volume",
    kind: "token",
    text: "VOL:",
    token: "volumeInfo",
    x: 18,
    y: 160,
    width: 340,
    height: 28,
    fontSize: 16,
    fontWeight: 700,
    align: "left",
    objectFit: "contain",
  },
  {
    id: "peso",
    kind: "token",
    text: "PESO:",
    token: "pesoKg",
    x: 370,
    y: 160,
    width: 338,
    height: 28,
    fontSize: 16,
    fontWeight: 700,
    align: "left",
    objectFit: "contain",
  },
];

export const DEFAULT_SHIPPING_LABEL_DESIGNER_LAYOUT: ShippingLabelDesignerLayout =
  {
    name: "Modelo visual",
    widthPx: 760,
    heightPx: 225,
    pxPerMm: 4,
    fontFamily: 'Calibri, "Segoe UI", Tahoma, sans-serif',
    showBorder: true,
    items: DEFAULT_DESIGNER_ITEMS,
  };

type HalfSheetBlock = Partial<ShippingLabelDesignerItem> &
  Pick<ShippingLabelDesignerItem, "id" | "x" | "y" | "width" | "height">;

function halfSheetBlock(block: HalfSheetBlock): ShippingLabelDesignerItem {
  return {
    kind: "text",
    text: "",
    fontSize: 12,
    fontWeight: 700,
    align: "left",
    objectFit: "contain",
    ...block,
  };
}

/**
 * Modelo "meia folha" (19 x 13,5 cm, duas por A4): remetente com logo, destinatário com
 * endereço e CEP, cidade grande, e nota / volume / peso em caixas. `logoSrc` reaproveita a
 * imagem que já estava no layout.
 */
export function halfSheetShippingLabelLayout(
  logoSrc?: string,
): ShippingLabelDesignerLayout {
  const label = (id: string, text: string, x: number, y: number, inverted = false) =>
    halfSheetBlock({ id, text, x, y, width: 220, height: 18, inverted });
  const token = (
    id: string,
    tokenName: ShippingLabelFieldToken,
    x: number,
    y: number,
    width: number,
    height: number,
    fontSize: number,
    extra: Partial<ShippingLabelDesignerItem> = {},
  ) => halfSheetBlock({ id, kind: "token", token: tokenName, x, y, width, height, fontSize, ...extra });

  return {
    name: "Meia folha com endereço",
    widthPx: 760,
    heightPx: 540,
    pxPerMm: 4,
    fontFamily: 'Calibri, "Segoe UI", Tahoma, sans-serif',
    showBorder: true,
    items: [
      // Caixas primeiro: o texto fica por cima.
      halfSheetBlock({ id: "caixa_destino", x: 0, y: 100, width: 760, height: 300, frame: true }),
      halfSheetBlock({ id: "caixa_nota", x: 0, y: 399, width: 254, height: 82, frame: true }),
      halfSheetBlock({ id: "caixa_volume", x: 253, y: 399, width: 254, height: 82, frame: true, inverted: true }),
      halfSheetBlock({ id: "caixa_peso", x: 506, y: 399, width: 254, height: 82, frame: true }),
      {
        ...halfSheetBlock({ id: "logo", x: 14, y: 12, width: 240, height: 76 }),
        kind: "image",
        text: "Logo",
        src: logoSrc,
      },
      label("rotulo_remetente", "REMETENTE", 280, 14),
      token("remetente", "remetente", 280, 34, 466, 22, 16),
      token("remetente_local", "remetenteLocal", 280, 58, 466, 22, 14, { fontWeight: 400 }),
      label("rotulo_destino", "DESTINATÁRIO", 16, 112),
      token("cliente", "cliente", 16, 132, 728, 64, 26),
      token("endereco", "endereco", 16, 204, 728, 26, 18, { fontWeight: 400 }),
      token("cep", "cep", 16, 232, 360, 26, 18, { fontWeight: 400, text: "CEP" }),
      token("cidade_uf", "cidadeUf", 16, 300, 728, 48, 36),
      label("rotulo_nota", "NOTA FISCAL", 16, 408),
      token("nota", "numeroNota", 16, 428, 228, 46, 38),
      label("rotulo_volume", "VOLUME", 269, 408, true),
      token("volume", "volumeInfo", 269, 428, 228, 46, 38, { inverted: true }),
      label("rotulo_peso", "PESO", 522, 408),
      token("peso", "pesoKg", 522, 428, 228, 46, 38),
      label("rotulo_transp", "TRANSPORTADORA", 16, 500),
      token("transportadora", "transportadora", 170, 494, 576, 28, 19),
    ],
  };
}

/** Blocos com a nossa marca: logo e remetente. */
const BRAND_BLOCK_IDS = new Set(["logo", "rotulo_remetente", "remetente", "remetente_local"]);
const RAW_SHIFT_PX = 96;

/**
 * Etiqueta "crua": a meia folha sem logo e sem remetente, para notas despachadas em nome de
 * um cliente (nada da nossa marca pode ir no volume).
 */
export function rawShippingLabelLayout(): ShippingLabelDesignerLayout {
  const base = halfSheetShippingLabelLayout();
  return {
    ...base,
    name: "Crua (sem marca)",
    heightPx: base.heightPx - RAW_SHIFT_PX,
    items: base.items
      .filter((item) => !BRAND_BLOCK_IDS.has(item.id))
      .map((item) => ({ ...item, y: Math.max(0, item.y - RAW_SHIFT_PX) })),
  };
}

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

function clampDesigner(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeDesignerItem(
  raw: unknown,
  fallbackId: string,
): ShippingLabelDesignerItem {
  const source =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const kindRaw = source.kind;
  const kind: "text" | "token" | "image" =
    kindRaw === "token" ? "token" : kindRaw === "image" ? "image" : "text";
  const token = source.token;
  const normalizedToken: ShippingLabelFieldToken | undefined =
    SHIPPING_LABEL_FIELD_TOKEN_OPTIONS.some((item) => item.value === token)
      ? (token as ShippingLabelFieldToken)
      : kind === "token"
        ? "cliente"
        : undefined;
  const weightRaw = Number(source.fontWeight);
  const alignRaw = source.align;
  const objectFitRaw = source.objectFit;

  return {
    id:
      typeof source.id === "string" && source.id.trim()
        ? source.id
        : fallbackId,
    kind,
    text: typeof source.text === "string" ? source.text : "",
    token: normalizedToken,
    src: typeof source.src === "string" ? source.src : undefined,
    x: clampDesigner(Number(source.x) || 0, 0, 3000),
    y: clampDesigner(Number(source.y) || 0, 0, 3000),
    width: clampDesigner(Number(source.width) || 220, 40, 3000),
    height: clampDesigner(Number(source.height) || 28, 18, 3000),
    fontSize: clampDesigner(Number(source.fontSize) || 16, 8, 64),
    fontWeight: weightRaw >= 700 ? 700 : 400,
    align: alignRaw === "center" || alignRaw === "right" ? alignRaw : "left",
    objectFit:
      objectFitRaw === "cover" || objectFitRaw === "fill"
        ? objectFitRaw
        : "contain",
    frame: source.frame === true,
    inverted: source.inverted === true,
  };
}

export function normalizeShippingLabelDesignerLayout(
  raw: unknown,
): ShippingLabelDesignerLayout {
  const source =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const itemsRaw = Array.isArray(source.items) ? source.items : [];
  const items = itemsRaw.length
    ? itemsRaw
        .map((item, index) => normalizeDesignerItem(item, `item_${index + 1}`))
        .slice(0, 60)
    : DEFAULT_SHIPPING_LABEL_DESIGNER_LAYOUT.items;

  return {
    name:
      typeof source.name === "string" && source.name.trim()
        ? source.name.trim()
        : DEFAULT_SHIPPING_LABEL_DESIGNER_LAYOUT.name,
    widthPx: clampDesigner(
      Number(source.widthPx) || DEFAULT_SHIPPING_LABEL_DESIGNER_LAYOUT.widthPx,
      300,
      2200,
    ),
    heightPx: clampDesigner(
      Number(source.heightPx) ||
        DEFAULT_SHIPPING_LABEL_DESIGNER_LAYOUT.heightPx,
      120,
      2200,
    ),
    pxPerMm: clampDesigner(
      Number(source.pxPerMm) || DEFAULT_SHIPPING_LABEL_DESIGNER_LAYOUT.pxPerMm,
      2,
      12,
    ),
    fontFamily:
      typeof source.fontFamily === "string" && source.fontFamily.trim()
        ? source.fontFamily.trim()
        : DEFAULT_SHIPPING_LABEL_DESIGNER_LAYOUT.fontFamily,
    showBorder:
      typeof source.showBorder === "boolean" ? source.showBorder : true,
    items,
  };
}

export function resolveShippingLabelDesignerItemText(
  item: ShippingLabelDesignerItem,
  data: ShippingLabelPrintableItem,
): string {
  if (item.kind === "text") return item.text;
  const prefix = item.text?.trim() ? `${item.text.trim()} ` : "";
  const volumeInfo = `${data.volumeIndex}/${data.volumeTotal}`;
  switch (item.token) {
    case "cliente":
      return `${prefix}${data.cliente}`;
    case "cidade":
      return `${prefix}${data.cidade}`;
    case "estado":
      return `${prefix}${data.estado}`;
    case "transportadora":
      return `${prefix}${data.transportadora}`;
    case "numeroNota":
      return `${prefix}${data.numeroNota}`;
    case "pesoKg":
      return `${prefix}${data.pesoKg} kg`;
    case "volumeInfo":
      return `${prefix}${volumeInfo}`;
    case "endereco":
      return `${prefix}${data.endereco}`;
    case "cep":
      return `${prefix}${data.cep}`;
    case "cidadeUf":
      return `${prefix}${data.cidade} / ${data.estado}`;
    case "remetente":
      return `${prefix}${data.remetente}`;
    case "remetenteLocal":
      return `${prefix}${data.remetenteLocal}`;
    default:
      return prefix.trim();
  }
}

export function buildShippingLabelsDesignerPrintHtml(
  dataItems: ShippingLabelPrintableItem[],
  rawLayout: ShippingLabelDesignerLayout,
): string {
  const layout = normalizeShippingLabelDesignerLayout(rawLayout);
  const pxPerMm = layout.pxPerMm;
  const cardWidthMm = layout.widthPx / pxPerMm;
  const cardHeightMm = layout.heightPx / pxPerMm;

  const cards = dataItems
    .map((data) => {
      const blocks = layout.items
        .map((item) => {
          const leftMm = item.x / pxPerMm;
          const topMm = item.y / pxPerMm;
          const widthMm = item.width / pxPerMm;
          const heightMm = item.height / pxPerMm;
          const fontMm = item.fontSize / pxPerMm;
          const isImage = item.kind === "image";
          const safeTopMm = isImage ? topMm : Math.max(0, topMm - 0.2);
          const fixedHeight = isImage || Boolean(item.frame);
          const safeHeightMm = fixedHeight ? heightMm : heightMm + 0.9;
          const content = isImage
            ? item.src
              ? `<img class="designer-image" src="${escapeHtml(item.src)}" alt="" style="object-fit:${item.objectFit};" />`
              : `<div class="designer-image-placeholder">Imagem</div>`
            : escapeHtml(resolveShippingLabelDesignerItemText(item, data));
          return `
          <div
            class="designer-block"
            style="
              left:${leftMm}mm;
              top:${safeTopMm}mm;
              width:${widthMm}mm;
              ${fixedHeight ? `height:${safeHeightMm}mm;` : `min-height:${safeHeightMm}mm;`}
              ${item.frame ? "border:0.4mm solid #000;" : ""}
              ${item.inverted ? "background:#000;color:#fff;" : ""}
              font-size:${fontMm}mm;
              font-weight:${item.fontWeight};
              text-align:${item.align};
              ${isImage ? `padding:0;` : ""}
            "
          >${content}</div>`; // colado nas tags: com pre-wrap, a quebra e o recuo viravam uma linha em branco
        })
        .join("\n");

      return `
      <article class="designer-card">
        ${blocks}
      </article>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>Etiquetas de Expedição - Designer Visual</title>
    <style>
      :root { color-scheme: only light; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: #fff;
        color: #111827;
        font-family: ${layout.fontFamily};
      }
      .sheet {
        width: 210mm;
        min-height: 297mm;
        margin: 0 auto;
        padding: 6mm;
        display: grid;
        grid-template-columns: 1fr;
        gap: 3mm;
      }
      .designer-card {
        position: relative;
        width: ${cardWidthMm}mm;
        height: ${cardHeightMm}mm;
        border: ${layout.showBorder ? "1px solid #000" : "none"};
        background: #fff;
        overflow: visible;
      }
      .designer-block {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
        position: absolute;
        white-space: pre-wrap;
        overflow: visible;
        overflow-wrap: anywhere;
        line-height: 1.05;
        color: #000000;
        box-sizing: border-box;
        padding: 0.2mm 0.6mm 0.55mm;
        -webkit-font-smoothing: antialiased;
        text-rendering: geometricPrecision;
      }
      .designer-image {
        width: 100%;
        height: 100%;
        object-fit: contain;
        display: block;
      }
      .designer-image-placeholder {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #6b7280;
        border: 1px dashed #cbd5e1;
        font-size: 3.4mm;
      }
      @media print {
        body { background: #fff; }
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
