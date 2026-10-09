// Manufacturer identity used by product rows and catalog cross-references.
// Red is intentionally absent: it is reserved for destructive actions.
const BRAND_COLORS: Record<string, string> = {
  HOLSET: "blue",
  BORGWARNER: "orange",
  GARRETT: "yellow",
  "MASTER POWER": "teal",
  MAHLE: "indigo",
  MITSUBISHI: "grape",
  IHI: "cyan",
  OEM: "gray",
};

export type BrandInfo = { label: string; color: string };

export type ProductCondition = {
  label: "NOVA" | "REMAN" | "MONTADA";
  color: string;
};

export function brandColor(fabricante: string): string {
  return BRAND_COLORS[fabricante.toUpperCase()] ?? "gray";
}

export function detectBrand(nome: string): BrandInfo | null {
  const upper = nome.toUpperCase();
  const make = (label: string): BrandInfo => ({ label, color: brandColor(label) });

  if (upper.includes("HOLSET")) return make("HOLSET");
  if (
    upper.includes("BORG") ||
    upper.includes("SCHWITZER") ||
    upper.includes("BW") ||
    /\b(K03|K04|K14|K16|K24|K27|K29|K31|S100\w*|S1B\w*|S200\w*|S2A\w*|S2B\w*|S2E\w*|S300\w*|S3A\w*|S3B\w*|S400\w*|S4T\w*|B1G|B2G|3LM|4LM)\b/i.test(upper) ||
    /\b[79]0000\d{6}\b/.test(upper)
  )
    return make("BORGWARNER");
  if (upper.includes("GARRETT")) return make("GARRETT");
  if (upper.includes("MASTER POWER") || upper.includes("MASTERPOWER"))
    return make("MASTER POWER");
  if (upper.includes("MAHLE") || upper.includes("BMTS")) return make("MAHLE");
  if (upper.includes("MITSUBISHI") || upper.includes("MHI"))
    return make("MITSUBISHI");
  return null;
}

export function detectCondition(nome: string): ProductCondition {
  const upper = nome.toUpperCase();

  // 1. MONTADA: qualquer turbina montada / remanufaturada internamente pela empresa
  if (upper.includes("MONTAD") || upper.includes("(MONTAD")) {
    return { label: "MONTADA", color: "orange" };
  }

  // 2. HOLSET REMAN: sufixo RX ou termo REMAN explícito
  if (upper.includes("RX") || upper.includes("REMAN")) {
    return { label: "REMAN", color: "grape" };
  }

  // 3. GARRETT (verificamos sufixos primeiro para nao colidir com bases de 6 digitos iniciadas por 9)
  if (/-\s*9\d{3}/.test(upper) || /\b\d{6}9\d{3}\b/.test(upper)) {
    return { label: "REMAN", color: "grape" };
  }
  if (/-\s*[05]\d{3}/.test(upper)) {
    return { label: "NOVA", color: "cyan" };
  }

  // 4. BORGWARNER / SCHWITZER REMAN:
  // - 11 digitos com miolo 990-998 (ex: 53279907101, 14879900089)
  // - 11 digitos com prefixo 90000 (ex: 90000174060, 90000174657)
  // - 6 digitos Schwitzer iniciando com 9 (ex: 970429, 915264, 966595, 997336)
  if (
    /\b\d{4}\s*99[0-8]\s*\d{4}\b/.test(upper) ||
    /\b\d{4}99[0-8]\d{4}\b/.test(upper) ||
    /\b90000\d{6}\b/.test(upper) ||
    /\b9\d{5}\b/.test(upper)
  ) {
    return { label: "REMAN", color: "grape" };
  }

  // 5. NOVA: turbo novo original de fabrica (70000..., 770429, 5327988..., 796155-5005, 4031195)
  return { label: "NOVA", color: "cyan" };
}
