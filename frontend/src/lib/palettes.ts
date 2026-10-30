// Paletas completas (Configurações > Aparência, 2.7.25). Lógica pura, sem React, para testar.
//
// Cada paleta troca fundo, vidro, bordas, texto, cor principal, manchas do fundo e a escala
// "dark" do Mantine, no claro e no escuro. As cores com significado (entrada, saída,
// zerado, versão) ficam no global.css e não mudam em paleta nenhuma.
//
// O azul-petróleo é o tema do global.css: para ele nada é escrito no :root (paletteVars
// devolve {}), então o app fica exatamente como era.

export type PaletteId =
  | "petroleo"
  | "grafite"
  | "esmeralda"
  | "oficina"
  | "violeta"
  | "turbo"
  | "oceano"
  | "cyber"
  | "minha";

export type Scheme = "light" | "dark";

/** O mínimo que define um lado (claro ou escuro) de uma paleta; o resto é calculado. */
export type PaletteSeed = {
  bg: string;
  solid: string;
  text: string;
  muted: string;
  accent: string;
  /** Fim do degradê e segunda cor dos efeitos. */
  accent2: string;
  /** Texto na cor principal (mais contraste que a própria cor). */
  accentText: string;
};

export type PaletteDef = {
  id: PaletteId;
  label: string;
  hint: string;
  /** Escala do Mantine usada como cor principal (botões, abas, Switch...). */
  mantine: string;
  light: PaletteSeed;
  dark: PaletteSeed;
};

export const PALETTES: PaletteDef[] = [
  {
    id: "petroleo",
    label: "Azul-petróleo",
    hint: "o de sempre",
    mantine: "petrol",
    light: { bg: "#eef3f6", solid: "#ffffff", text: "#10222e", muted: "#4f6371", accent: "#0e7490", accent2: "#38bdf8", accentText: "#0b5f77" },
    dark: { bg: "#0a141b", solid: "#13222d", text: "#e6eef3", muted: "#9bb0be", accent: "#38bdf8", accent2: "#0e7490", accentText: "#38bdf8" },
  },
  {
    id: "grafite",
    label: "Grafite",
    hint: "sóbrio, sem cor",
    mantine: "slate",
    light: { bg: "#f1f2f4", solid: "#ffffff", text: "#16181d", muted: "#555b66", accent: "#334155", accent2: "#64748b", accentText: "#334155" },
    dark: { bg: "#0d0f12", solid: "#1a1d22", text: "#e8eaee", muted: "#a0a6b0", accent: "#cbd5e1", accent2: "#64748b", accentText: "#cbd5e1" },
  },
  {
    id: "esmeralda",
    label: "Esmeralda",
    hint: "verde calmo",
    mantine: "esmeralda",
    light: { bg: "#edf5f1", solid: "#ffffff", text: "#0f241b", muted: "#4c6459", accent: "#047857", accent2: "#34d399", accentText: "#065f46" },
    dark: { bg: "#07130e", solid: "#10241b", text: "#e3f1ea", muted: "#94b3a5", accent: "#34d399", accent2: "#059669", accentText: "#6ee7b7" },
  },
  {
    id: "oficina",
    label: "Oficina",
    hint: "âmbar e cobre",
    mantine: "oficina",
    light: { bg: "#f6f2ea", solid: "#fffdf9", text: "#241a0c", muted: "#6b5a43", accent: "#b45309", accent2: "#f59e0b", accentText: "#92400e" },
    dark: { bg: "#120e08", solid: "#22190e", text: "#f3ebde", muted: "#b7a68e", accent: "#fbbf24", accent2: "#d97706", accentText: "#fcd34d" },
  },
  {
    id: "violeta",
    label: "Violeta",
    hint: "roxo com rosa",
    mantine: "violeta",
    light: { bg: "#f2f0fa", solid: "#ffffff", text: "#1b1530", muted: "#5d5578", accent: "#6d28d9", accent2: "#c084fc", accentText: "#5b21b6" },
    dark: { bg: "#0d0a18", solid: "#1a1430", text: "#ece8fb", muted: "#a9a1c8", accent: "#a78bfa", accent2: "#e879f9", accentText: "#c4b5fd" },
  },
  {
    id: "turbo",
    label: "Turbo",
    hint: "vermelho forte",
    mantine: "turbo",
    light: { bg: "#f7f1f1", solid: "#ffffff", text: "#2a1012", muted: "#6e5153", accent: "#be123c", accent2: "#fb7185", accentText: "#9f1239" },
    dark: { bg: "#120909", solid: "#241213", text: "#f6e7e7", muted: "#bf9fa0", accent: "#fb7185", accent2: "#e11d48", accentText: "#fda4af" },
  },
  {
    id: "oceano",
    label: "Oceano",
    hint: "azul profundo",
    mantine: "oceano",
    light: { bg: "#eef2fb", solid: "#ffffff", text: "#0e1a33", muted: "#4d5b7a", accent: "#1d4ed8", accent2: "#60a5fa", accentText: "#1e40af" },
    dark: { bg: "#070c1a", solid: "#0f1934", text: "#e4ebfb", muted: "#98a8cc", accent: "#60a5fa", accent2: "#2563eb", accentText: "#93c5fd" },
  },
  {
    id: "cyber",
    label: "Cyber",
    hint: "ciano e magenta",
    mantine: "cyber",
    light: { bg: "#eff6f8", solid: "#ffffff", text: "#0b1a20", muted: "#4a6670", accent: "#0891b2", accent2: "#c026d3", accentText: "#0e7490" },
    dark: { bg: "#05070d", solid: "#0c1120", text: "#e6f6ff", muted: "#8fa6b8", accent: "#22d3ee", accent2: "#e879f9", accentText: "#67e8f9" },
  },
];

export const PALETTE_IDS: readonly PaletteId[] = [...PALETTES.map((p) => p.id), "minha"];

export function isPaletteId(value: unknown): value is PaletteId {
  return typeof value === "string" && (PALETTE_IDS as readonly string[]).includes(value);
}

/** Paleta das versões até a 2.7.24 ("Cor principal"): índigo vira violeta. */
export function paletteFromLegacyAccent(accent: unknown): PaletteId {
  if (accent === "grafite") return "grafite";
  if (accent === "indigo") return "violeta";
  return "petroleo";
}

// ---------------------------------------------------------------------------
// Cores
// ---------------------------------------------------------------------------

type Rgb = [number, number, number];

export function hexToRgb(hex: string): Rgb {
  const clean = hex.replace("#", "").trim();
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean.padEnd(6, "0");
  const value = Number.parseInt(full.slice(0, 6), 16);
  if (Number.isNaN(value)) return [0, 0, 0];
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

export function rgbToHex([r, g, b]: Rgb): string {
  const part = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`;
}

/** Mistura `a` com `b`: weight 0 = só `a`, 1 = só `b`. */
export function mix(a: string, b: string, weight: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return rgbToHex([0, 1, 2].map((i) => x[i] + (y[i] - x[i]) * weight) as Rgb);
}

export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contraste WCAG entre duas cores (1 a 21). */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Escurece (ou clareia) `color` até ler bem sobre `bg` (>= 4,5:1). */
export function readableOn(color: string, bg: string, min = 4.5): string {
  const toward = luminance(bg) > 0.4 ? "#000000" : "#ffffff";
  let out = color;
  for (let step = 1; step <= 20 && contrast(out, bg) < min; step += 1) {
    out = mix(color, toward, step * 0.05);
  }
  return out;
}

/** Escala de 10 tons do Mantine em volta de `base` (tom 6). */
export function mantineScale(base: string): string[] {
  return [0.92, 0.84, 0.68, 0.5, 0.3, 0.14].map((w) => mix(base, "#ffffff", w))
    .concat([base])
    .concat([0.18, 0.34, 0.5].map((w) => mix(base, "#000000", w)));
}

// ---------------------------------------------------------------------------
// "Minha cor": o usuário escolhe duas cores e o resto sai daqui.
// ---------------------------------------------------------------------------

export type CustomColors = { primary: string; second: string };

export const DEFAULT_CUSTOM: CustomColors = { primary: "#e11d48", second: "#f59e0b" };

export function customPalette(colors: CustomColors): PaletteDef {
  const lightBg = mix("#f4f5f7", colors.primary, 0.05);
  const darkBg = mix("#0a0c10", colors.primary, 0.07);
  const darkSolid = mix("#161a20", colors.primary, 0.08);
  return {
    id: "minha",
    label: "Minha cor",
    hint: "escolhida por você",
    mantine: "minha",
    light: {
      bg: lightBg,
      solid: "#ffffff",
      text: "#14181f",
      muted: "#555d6a",
      accent: readableOn(colors.primary, "#ffffff", 3),
      accent2: colors.second,
      accentText: readableOn(colors.primary, lightBg),
    },
    dark: {
      bg: darkBg,
      solid: darkSolid,
      text: "#e9ecf1",
      muted: "#a3aab6",
      accent: readableOn(colors.primary, darkSolid, 3),
      accent2: colors.second,
      accentText: readableOn(colors.primary, darkBg),
    },
  };
}

export function paletteDef(id: PaletteId, custom: CustomColors = DEFAULT_CUSTOM): PaletteDef {
  if (id === "minha") return customPalette(custom);
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0];
}

// ---------------------------------------------------------------------------
// Variáveis CSS
// ---------------------------------------------------------------------------

/** Todas as variáveis que paletteVars pode escrever (para limpar ao trocar). */
export const PALETTE_VAR_NAMES = [
  "--bg",
  "--surface",
  "--surface-raised",
  "--surface-overlay",
  "--surface-solid",
  "--surface-2",
  "--surface-hover",
  "--border",
  "--border-strong",
  "--text",
  "--text-muted",
  "--text-subtle",
  "--accent",
  "--accent-2",
  "--accent-text",
  "--accent-soft",
  "--accent-gradient",
  "--shadow-button",
  "--shadow-lift",
  "--blob-1",
  "--blob-2",
  "--blob-3",
  "--mantine-color-body",
  "--mantine-color-text",
  "--mantine-color-dimmed",
  "--mantine-color-default-border",
  ...Array.from({ length: 10 }, (_, i) => `--mantine-color-dark-${i}`),
] as const;

/**
 * Variáveis CSS da paleta para o :root. `opaque` = nível de animação "Nenhum" (sem
 * desfoque: o vidro vira cartão quase opaco). Petróleo devolve só `--accent-2`.
 */
export function paletteVars(
  def: PaletteDef,
  scheme: Scheme,
  opaque = false,
): Record<string, string> {
  const seed = def[scheme];
  if (def.id === "petroleo") return { "--accent-2": seed.accent2 };
  const dark = scheme === "dark";
  const vars: Record<string, string> = {
    "--bg": seed.bg,
    "--surface": rgba(seed.solid, opaque ? (dark ? 0.9 : 0.86) : 0.62),
    "--surface-raised": opaque ? seed.solid : rgba(seed.solid, dark ? 0.94 : 0.88),
    "--surface-overlay": rgba(seed.solid, dark ? 0.97 : 0.96),
    "--surface-solid": seed.solid,
    "--surface-2": dark ? "rgba(255, 255, 255, 0.05)" : rgba(seed.text, 0.045),
    "--surface-hover": rgba(seed.accent, dark ? 0.08 : 0.07),
    "--border": dark ? rgba(seed.muted, 0.16) : rgba(seed.text, 0.1),
    "--border-strong": dark ? rgba(seed.muted, 0.3) : rgba(seed.text, 0.2),
    "--text": seed.text,
    "--text-muted": seed.muted,
    "--text-subtle": seed.muted,
    "--accent": seed.accent,
    "--accent-2": seed.accent2,
    "--accent-text": seed.accentText,
    "--accent-soft": rgba(seed.accent, dark ? 0.12 : 0.1),
    "--accent-gradient": `linear-gradient(135deg, ${dark ? seed.accent2 : seed.accent} 0%, ${dark ? seed.accent : seed.accent2} 100%)`,
    "--shadow-button": `0 6px 20px ${rgba(seed.accent, dark ? 0.22 : 0.3)}`,
    "--shadow-lift": dark
      ? `0 2px 4px rgba(0, 0, 0, 0.25), 0 14px 36px ${rgba(seed.accent, 0.14)}`
      : `0 2px 4px rgba(15, 40, 60, 0.05), 0 14px 36px ${rgba(seed.accent, 0.14)}`,
    "--blob-1": dark ? mix(seed.accent, seed.bg, 0.35) : mix(seed.accent2, "#ffffff", 0.55),
    "--blob-2": dark ? mix(seed.accent2, seed.bg, 0.45) : mix(seed.accent, "#ffffff", 0.72),
    "--blob-3": dark ? mix(seed.accent2, "#7c4a2d", 0.5) : mix(seed.accent2, "#f3d9c4", 0.6),
    "--mantine-color-body": dark ? mix(seed.solid, seed.bg, 0.4) : "#ffffff",
    "--mantine-color-text": seed.text,
    "--mantine-color-dimmed": seed.muted,
    "--mantine-color-default-border": dark ? rgba(seed.muted, 0.18) : mix(seed.bg, seed.text, 0.12),
  };
  if (dark) {
    const scale = [
      seed.text,
      mix(seed.text, seed.muted, 0.5),
      seed.muted,
      mix(seed.muted, seed.bg, 0.45),
      mix(seed.solid, seed.text, 0.12),
      mix(seed.solid, seed.text, 0.06),
      mix(seed.solid, seed.bg, 0.25),
      mix(seed.solid, seed.bg, 0.6),
      seed.bg,
      mix(seed.bg, "#000000", 0.4),
    ];
    scale.forEach((color, index) => {
      vars[`--mantine-color-dark-${index}`] = color;
    });
  }
  return vars;
}

// ---------------------------------------------------------------------------
// Tema claro/escuro pelo horário
// ---------------------------------------------------------------------------

/** Escuro das 18h às 7h. */
export function schemeForHour(hour: number, darkFrom = 18, lightFrom = 7): Scheme {
  return hour >= darkFrom || hour < lightFrom ? "dark" : "light";
}
