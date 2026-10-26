import { useLocalStorage } from "@mantine/hooks";
import { DEFAULT_MOTION_LEVEL, type MotionLevel } from "./motion";

// Preferências de aparência desta máquina (Configurações > Aparência).

export type AppAccent = "indigo" | "petroleo" | "grafite";
export type AppDensity = "normal" | "compact";

export const ACCENT_OPTIONS: { value: AppAccent; label: string }[] = [
  { value: "petroleo", label: "Azul-petróleo" },
  { value: "indigo", label: "Índigo" },
  { value: "grafite", label: "Grafite" },
];

export const MOTION_OPTIONS: { value: MotionLevel; label: string }[] = [
  { value: "completo", label: "Completo" },
  { value: "suave", label: "Suave" },
  { value: "nenhum", label: "Nenhum" },
];

/** Paleta do tema (theme.ts) usada como cor principal em cada opção. */
export const ACCENT_PRIMARY: Record<AppAccent, string> = {
  indigo: "brand",
  petroleo: "petrol",
  grafite: "slate",
};

export const ACCENT_KEY = "chronos.appearance.accent";
export const DENSITY_KEY = "chronos.appearance.density";
export const MOTION_KEY = "chronos.appearance.motion";

export function useAppAccent() {
  return useLocalStorage<AppAccent>({ key: ACCENT_KEY, defaultValue: "petroleo" });
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
