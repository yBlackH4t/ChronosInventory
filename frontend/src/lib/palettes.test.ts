import { describe, expect, it } from "vitest";
import {
  PALETTES,
  PALETTE_VAR_NAMES,
  contrast,
  customPalette,
  isPaletteId,
  mantineScale,
  mix,
  paletteDef,
  paletteFromLegacyAccent,
  paletteVars,
  readableOn,
  schemeForHour,
} from "./palettes";

describe("palettes", () => {
  it("petróleo não escreve nada além da segunda cor (fica o global.css)", () => {
    expect(paletteVars(paletteDef("petroleo"), "light")).toEqual({ "--accent-2": "#38bdf8" });
    expect(paletteVars(paletteDef("petroleo"), "dark")).toEqual({ "--accent-2": "#0e7490" });
  });

  it("as outras paletas escrevem só variáveis conhecidas, no claro e no escuro", () => {
    for (const def of PALETTES.filter((p) => p.id !== "petroleo")) {
      for (const scheme of ["light", "dark"] as const) {
        const vars = paletteVars(def, scheme);
        expect(vars["--bg"]).toBe(def[scheme].bg);
        expect(vars["--accent"]).toBe(def[scheme].accent);
        Object.keys(vars).forEach((name) => expect(PALETTE_VAR_NAMES).toContain(name));
      }
    }
  });

  it("só o escuro troca a escala dark do Mantine", () => {
    const def = paletteDef("violeta");
    expect(paletteVars(def, "light")["--mantine-color-dark-7"]).toBeUndefined();
    expect(paletteVars(def, "dark")["--mantine-color-dark-0"]).toBe(def.dark.text);
  });

  it("no nível Nenhum o vidro fica quase opaco", () => {
    const def = paletteDef("oceano");
    expect(paletteVars(def, "light", true)["--surface"]).toBe("rgba(255, 255, 255, 0.86)");
    expect(paletteVars(def, "dark", true)["--surface-raised"]).toBe(def.dark.solid);
  });

  it("texto da paleta e texto na cor principal leem bem (>= 4,5:1)", () => {
    for (const def of PALETTES) {
      for (const scheme of ["light", "dark"] as const) {
        const seed = def[scheme];
        expect(contrast(seed.text, seed.bg)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(seed.muted, seed.bg)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(seed.accentText, seed.bg)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("minha cor: cor clara demais é escurecida para ler no claro", () => {
    const def = customPalette({ primary: "#fde047", second: "#22d3ee" });
    expect(contrast(def.light.accentText, def.light.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(def.dark.accentText, def.dark.bg)).toBeGreaterThanOrEqual(4.5);
    expect(def.light.accent2).toBe("#22d3ee");
  });

  it("readableOn não mexe no que já lê bem", () => {
    expect(readableOn("#000000", "#ffffff")).toBe("#000000");
  });

  it("mistura e escala de 10 tons", () => {
    expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
    const scale = mantineScale("#be123c");
    expect(scale).toHaveLength(10);
    expect(scale[6]).toBe("#be123c");
  });

  it("cor principal antiga vira paleta", () => {
    expect(paletteFromLegacyAccent("indigo")).toBe("violeta");
    expect(paletteFromLegacyAccent("grafite")).toBe("grafite");
    expect(paletteFromLegacyAccent(null)).toBe("petroleo");
    expect(isPaletteId("minha")).toBe(true);
    expect(isPaletteId("azul")).toBe(false);
  });

  it("pelo horário: escuro das 18h às 7h", () => {
    expect(schemeForHour(6)).toBe("dark");
    expect(schemeForHour(7)).toBe("light");
    expect(schemeForHour(17)).toBe("light");
    expect(schemeForHour(18)).toBe("dark");
  });
});
