import { useLocalStorage } from "@mantine/hooks";

// Preferências de aparência desta máquina (Configurações > Aparência).

export type AppAccent = "indigo" | "petroleo" | "grafite";
export type AppDensity = "normal" | "compact";

export const ACCENT_OPTIONS: { value: AppAccent; label: string }[] = [
  { value: "indigo", label: "Índigo" },
  { value: "petroleo", label: "Azul-petróleo" },
  { value: "grafite", label: "Grafite" },
];

/** Paleta do tema (theme.ts) usada como cor principal em cada opção. */
export const ACCENT_PRIMARY: Record<AppAccent, string> = {
  indigo: "brand",
  petroleo: "accent",
  grafite: "slate",
};

export const ACCENT_KEY = "chronos.appearance.accent";
export const DENSITY_KEY = "chronos.appearance.density";

export function useAppAccent() {
  return useLocalStorage<AppAccent>({ key: ACCENT_KEY, defaultValue: "indigo" });
}

export function useAppDensity() {
  return useLocalStorage<AppDensity>({ key: DENSITY_KEY, defaultValue: "normal" });
}

/** Altura das linhas das tabelas virtualizadas: menor no modo compacto. */
export function useRowHeight(normal = 56): number {
  const [density] = useAppDensity();
  return density === "compact" ? Math.round(normal * 0.75) : normal;
}
