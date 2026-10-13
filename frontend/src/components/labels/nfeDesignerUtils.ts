import {
  DEFAULT_SHIPPING_LABEL_DESIGNER_LAYOUT,
  normalizeShippingLabelDesignerLayout,
  type ShippingLabelDesignerItem,
  type ShippingLabelDesignerLayout,
  type ShippingLabelPrintableItem,
} from "../../lib/labelsPrint";

// Constantes e funcoes puras do designer de etiquetas de NF-e.
export const MAX_NFE_LABELS_PER_PRINT = 400;
export const STORAGE_KEY = "chronos.nfe.designer_layout.v2";
export const GRID_SIZE = 4;
export const COMMON_WINDOWS_FONTS = [
  "Segoe UI",
  "Calibri",
  "Arial",
  "Tahoma",
  "Verdana",
  "Trebuchet MS",
  "Times New Roman",
  "Georgia",
  "Cambria",
  "Franklin Gothic Medium",
  "Garamond",
  "Courier New",
  "Consolas",
  "Candara",
  "Corbel",
];

export type InteractionRef = {
  id: string;
  pointerId: number;
  mode: "move" | "resize";
  lastX: number;
  lastY: number;
} | null;

export type AlignMode = "left" | "center" | "right" | "top" | "middle" | "bottom";

type LocalFontFace = {
  family?: string;
  fullName?: string;
};

export function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `item_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function snap(value: number): number {
  return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

export function loadLayoutFromStorage(): ShippingLabelDesignerLayout {
  if (typeof window === "undefined")
    return DEFAULT_SHIPPING_LABEL_DESIGNER_LAYOUT;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SHIPPING_LABEL_DESIGNER_LAYOUT;
    return normalizeShippingLabelDesignerLayout(JSON.parse(raw) as unknown);
  } catch {
    return DEFAULT_SHIPPING_LABEL_DESIGNER_LAYOUT;
  }
}

export function printHtml(html: string) {
  if (typeof document === "undefined" || typeof window === "undefined") return;
  const frame = document.createElement("iframe");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  frame.style.visibility = "hidden";

  const cleanup = () => {
    window.setTimeout(() => {
      if (frame.parentNode) frame.parentNode.removeChild(frame);
    }, 500);
  };

  frame.onload = () => {
    const frameWindow = frame.contentWindow;
    if (!frameWindow) {
      cleanup();
      return;
    }
    frameWindow.focus();
    frameWindow.print();
    cleanup();
  };

  document.body.appendChild(frame);
  if (!frame.contentDocument) {
    cleanup();
    return;
  }
  frame.contentDocument.open();
  frame.contentDocument.write(html);
  frame.contentDocument.close();
}

export function isEditableElement(element: Element | null): boolean {
  if (!(element instanceof HTMLElement)) return false;
  const tag = element.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    element.isContentEditable
  );
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("Nao foi possivel ler a imagem selecionada."));
    };
    reader.onerror = () =>
      reject(reader.error ?? new Error("Falha ao ler imagem."));
    reader.readAsDataURL(file);
  });
}

export function measureTextBlockHeight(
  text: string,
  item: ShippingLabelDesignerItem,
  fontFamily: string,
): number {
  if (typeof document === "undefined") {
    return Math.max(24, snap(item.fontSize * 1.8));
  }

  const probe = document.createElement("div");
  probe.style.position = "fixed";
  probe.style.left = "-99999px";
  probe.style.top = "0";
  probe.style.width = `${Math.max(40, item.width)}px`;
  probe.style.minHeight = "0";
  probe.style.padding = "1px 4px 3px";
  probe.style.fontSize = `${item.fontSize}px`;
  probe.style.fontWeight = String(item.fontWeight);
  probe.style.fontFamily = fontFamily;
  probe.style.whiteSpace = "pre-wrap";
  probe.style.overflowWrap = "anywhere";
  probe.style.lineHeight = "1.05";
  probe.style.boxSizing = "border-box";
  probe.textContent = text || " ";
  document.body.appendChild(probe);
  const measured = probe.getBoundingClientRect().height;
  document.body.removeChild(probe);
  return Math.max(18, snap(Math.ceil(measured + 2)));
}

export async function detectFontOptions(): Promise<string[]> {
  if (typeof window === "undefined") return COMMON_WINDOWS_FONTS;

  const unique = new Set<string>();
  const addFont = (fontName: string | undefined) => {
    if (!fontName) return;
    const normalized = fontName.trim();
    if (!normalized) return;
    unique.add(normalized);
  };

  try {
    const win = window as Window & {
      queryLocalFonts?: () => Promise<LocalFontFace[]>;
    };
    if (typeof win.queryLocalFonts === "function") {
      const localFonts = await win.queryLocalFonts();
      localFonts.forEach((font) => {
        addFont(font.family);
        addFont(font.fullName);
      });
    }
  } catch {
    // Fallback to curated list below.
  }

  if (unique.size === 0) {
    COMMON_WINDOWS_FONTS.forEach((font) => addFont(font));
  }

  return Array.from(unique).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export const SAMPLE_DATA: ShippingLabelPrintableItem = {
  cliente: "CLIENTE EXEMPLO LTDA",
  cidade: "EXEMPLO",
  estado: "RS",
  transportadora: "TRANSPORTADORA EXEMPLO",
  numeroNota: "123456",
  pesoKg: "10",
  volumeIndex: 1,
  volumeTotal: 1,
};
