import { useLocalStorage } from "@mantine/hooks";
import { DEFAULT_MOTION_LEVEL, type MotionLevel } from "./motion";
import {
  DEFAULT_CUSTOM,
  paletteFromLegacyAccent,
  type CustomColors,
  type PaletteId,
} from "./palettes";

// Preferências de aparência desta máquina (Configurações > Aparência).

export type AppDensity = "normal" | "compact";
/** Barra de cima: vidro (como sempre foi), na cor do tema ou com linha neon. */
export type MenuStyle = "vidro" | "colorido" | "neon";
/** Fundo atrás das telas. */
export type Backdrop = "manchas" | "malha" | "particulas" | "liso";
/** Cantos dos painéis. */
export type Corners = "padrao" | "chanfrado" | "redondo" | "reto";
/** "horario": escurece às 18h e clareia às 7h. "sistema": segue o Windows. */
export type SchemeMode = "light" | "dark" | "sistema" | "horario";

export const MOTION_OPTIONS: { value: MotionLevel; label: string }[] = [
  { value: "completo", label: "Completo" },
  { value: "suave", label: "Suave" },
  { value: "nenhum", label: "Nenhum" },
];

export const MENU_OPTIONS: { value: MenuStyle; label: string }[] = [
  { value: "vidro", label: "Vidro" },
  { value: "colorido", label: "Colorido" },
  { value: "neon", label: "Linha neon" },
];

export const BACKDROP_OPTIONS: { value: Backdrop; label: string }[] = [
  { value: "manchas", label: "Manchas" },
  { value: "malha", label: "Malha viva" },
  { value: "particulas", label: "Partículas" },
  { value: "liso", label: "Liso" },
];

export const CORNER_OPTIONS: { value: Corners; label: string }[] = [
  { value: "padrao", label: "Cantoneiras" },
  { value: "chanfrado", label: "Chanfrado" },
  { value: "redondo", label: "Bem redondo" },
  { value: "reto", label: "Reto" },
];

/** Chave da antiga "Cor principal" (até a 2.7.24): vira a paleta inicial. */
export const ACCENT_KEY = "chronos.appearance.accent";
export const PALETTE_KEY = "chronos.appearance.palette";
export const CUSTOM_COLORS_KEY = "chronos.appearance.custom-colors";
export const MENU_KEY = "chronos.appearance.menu";
export const BACKDROP_KEY = "chronos.appearance.backdrop";
export const CORNERS_KEY = "chronos.appearance.corners";
export const GLOW_KEY = "chronos.appearance.glow";
export const SCHEME_SCHEDULE_KEY = "chronos.appearance.scheme-schedule";
export const DENSITY_KEY = "chronos.appearance.density";
export const MOTION_KEY = "chronos.appearance.motion";

function legacyPalette(): PaletteId {
  try {
    const raw = window.localStorage.getItem(ACCENT_KEY);
    return paletteFromLegacyAccent(raw ? JSON.parse(raw) : null);
  } catch {
    return "petroleo";
  }
}

export function useAppPalette() {
  return useLocalStorage<PaletteId>({
    key: PALETTE_KEY,
    defaultValue: legacyPalette(),
    getInitialValueInEffect: false,
  });
}

export function useCustomColors() {
  return useLocalStorage<CustomColors>({
    key: CUSTOM_COLORS_KEY,
    defaultValue: DEFAULT_CUSTOM,
    getInitialValueInEffect: false,
  });
}

export function useMenuStyle() {
  return useLocalStorage<MenuStyle>({ key: MENU_KEY, defaultValue: "vidro", getInitialValueInEffect: false });
}

export function useBackdrop() {
  return useLocalStorage<Backdrop>({ key: BACKDROP_KEY, defaultValue: "manchas", getInitialValueInEffect: false });
}

export function useCorners() {
  return useLocalStorage<Corners>({ key: CORNERS_KEY, defaultValue: "padrao", getInitialValueInEffect: false });
}

/** Brilho dos destaques, de 0 (sóbrio) a 100. */
export function useGlow() {
  return useLocalStorage<number>({ key: GLOW_KEY, defaultValue: 60, getInitialValueInEffect: false });
}

/** Tema pelo horário ligado? (o claro/escuro/sistema fica com o Mantine). */
export function useSchemeSchedule() {
  return useLocalStorage<boolean>({ key: SCHEME_SCHEDULE_KEY, defaultValue: false, getInitialValueInEffect: false });
}

export function useAppDensity() {
  return useLocalStorage<AppDensity>({ key: DENSITY_KEY, defaultValue: "normal" });
}

/** Animações escolhidas aqui; o nível que vale de fato vem de useMotionLevel(). */
export function useAppMotion() {
  // Lido já no primeiro render: quem escolheu "nenhum" não vê nada se mexer ao abrir.
  return useLocalStorage<MotionLevel>({
    key: MOTION_KEY,
    defaultValue: DEFAULT_MOTION_LEVEL,
    getInitialValueInEffect: false,
  });
}

/** Altura das linhas das tabelas virtualizadas: menor no modo compacto. */
export function useRowHeight(normal = 56): number {
  const [density] = useAppDensity();
  return density === "compact" ? Math.round(normal * 0.75) : normal;
}
