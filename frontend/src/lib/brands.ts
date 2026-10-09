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

export function brandColor(fabricante: string): string {
  return BRAND_COLORS[fabricante.toUpperCase()] ?? "gray";
}

export function detectBrand(nome: string): BrandInfo | null {
  const upper = nome.toUpperCase();
  const make = (label: string): BrandInfo => ({ label, color: brandColor(label) });

  if (upper.includes("HOLSET")) return make("HOLSET");
  if (
    upper.includes("BORGWARNER") ||
    upper.includes("BORG WARNER") ||
    upper.includes("SCHWITZER") ||
    upper.includes("BW")
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
