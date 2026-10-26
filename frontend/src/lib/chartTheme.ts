import { useCallback, type CSSProperties } from "react";
import { useComputedColorScheme, useMantineTheme } from "@mantine/core";
import { useLocalStorage } from "@mantine/hooks";
import { useLocations } from "../hooks/useLocations";
import { SEMANTIC_HEX, type SemanticHex } from "./semantic";

// Categorical slots validated (dataviz validate_palette.js) against the app
// surfaces: #ffffff (light) and #0f172a (dark). Assign in this order, never
// cycle by rank. Red is intentionally absent: it is reserved for errors.
const SERIES = {
  // 2ª cor era laranja; laranja agora quer dizer só "Saída".
  light: ["#2a78d6", "#8b5cf6", "#1baf7a", "#eda100", "#e87ba4"],
  dark: ["#3987e5", "#9b7bf0", "#199e70", "#c98500", "#d55181"],
};

export type ChartTheme = {
  series: string[];
  /** Fixed roles so "Entradas"/"Saídas" keep their color on every chart. */
  inflow: string;
  outflow: string;
  /** Cores com significado (entrada, saída, versão, nível de estoque). */
  semantic: SemanticHex;
  /** Cor principal do app (segue a escolha em Configurações > Aparência). */
  accent: string;
  grid: string;
  axis: string;
  tick: { fontSize: number; fill: string };
  tooltip: {
    contentStyle: CSSProperties;
    labelStyle: CSSProperties;
    itemStyle: CSSProperties;
  };
  cursorFill: string;
};

export function useChartTheme(): ChartTheme {
  const scheme = useComputedColorScheme("light");
  const dark = scheme === "dark";
  const series = dark ? SERIES.dark : SERIES.light;
  const semantic = dark ? SEMANTIC_HEX.dark : SEMANTIC_HEX.light;
  const theme = useMantineTheme();
  const primary = theme.colors[theme.primaryColor] ?? theme.colors.brand;
  const accent = primary[dark ? 4 : 6];

  return {
    series,
    inflow: semantic.inflow,
    outflow: semantic.outflow,
    semantic,
    accent,
    grid: dark ? "rgba(148, 163, 184, 0.12)" : "#eef2f6",
    axis: dark ? "#64748b" : "#94a3b8",
    tick: { fontSize: 11, fill: dark ? "#94a3b8" : "#64748b" },
    tooltip: {
      contentStyle: {
        background: dark ? "#162235" : "#ffffff",
        border: `1px solid ${dark ? "rgba(148, 163, 184, 0.2)" : "#e2e8f0"}`,
        borderRadius: 10,
        boxShadow: dark
          ? "0 12px 28px rgba(0, 0, 0, 0.45)"
          : "0 12px 28px rgba(15, 23, 42, 0.12)",
        padding: "8px 12px",
        fontSize: 12,
      },
      labelStyle: {
        color: dark ? "#e2e8f0" : "#0f172a",
        fontWeight: 600,
        marginBottom: 4,
      },
      itemStyle: {
        color: dark ? "#cbd5e1" : "#334155",
        padding: 0,
      },
    },
    cursorFill: dark ? "rgba(148, 163, 184, 0.08)" : "rgba(15, 23, 42, 0.04)",
  };
}

// Color follows the branch (by its position in the locations list), so a
// branch keeps the same color on every tile and chart. Users can override it.
export function useLocationColor() {
  const { series } = useChartTheme();
  const { locations } = useLocations();
  const [overrides, setOverrides] = useLocalStorage<Record<string, string>>({
    key: "chronos.dashboard.location_colors",
    defaultValue: {},
  });

  const colorFor = useCallback(
    (name: string) => {
      if (overrides[name]) return overrides[name];
      const index = locations.findIndex(
        (loc) => loc.name === name || loc.label === name,
      );
      return series[(index >= 0 ? index : 0) % series.length];
    },
    [locations, overrides, series],
  );

  const setColor = useCallback(
    (name: string, color: string) =>
      setOverrides((prev) => ({ ...prev, [name]: color })),
    [setOverrides],
  );

  return { colorFor, setColor, palette: series };
}
