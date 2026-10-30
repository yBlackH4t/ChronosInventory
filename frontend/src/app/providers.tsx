import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "@mantine/dates/styles.css";
import "@mantine/spotlight/styles.css";
import "@mantine/carousel/styles.css";
import "@mantine/dropzone/styles.css";
import "@fontsource/sora/latin-400.css";
import "@fontsource/sora/latin-500.css";
import "@fontsource/sora/latin-600.css";
import "@fontsource/sora/latin-700.css";
import "../styles/global.css";
import "../styles/microinteracoes.css";
import "../styles/telas-simples.css";
import "../styles/vivo.css";
import "dayjs/locale/pt-br";

import { useEffect, useLayoutEffect, useMemo, type ReactNode } from "react";
import {
  MantineProvider,
  localStorageColorSchemeManager,
  useComputedColorScheme,
  useMantineColorScheme,
  type MantineColorsTuple,
} from "@mantine/core";
import { useReducedMotion } from "@mantine/hooks";
import { LazyMotion, MotionConfig, domAnimation } from "motion/react";
import { DatesProvider } from "@mantine/dates";
import { ModalsProvider } from "@mantine/modals";
import { Notifications } from "@mantine/notifications";
import { QueryClient, defaultShouldDehydrateQuery } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { get, set, del } from "idb-keyval";
import dayjs from "dayjs";
import { appTheme, cssVariablesResolver } from "../theme/theme";
import { ProfileScopeProvider } from "../state/profileScope";
import {
  useAppDensity,
  useAppMotion,
  useAppPalette,
  useBackdrop,
  useCorners,
  useCustomColors,
  useGlow,
  useMenuStyle,
  useSchemeSchedule,
} from "../lib/appearance";
import {
  PALETTE_VAR_NAMES,
  isPaletteId,
  mantineScale,
  paletteDef,
  paletteVars,
  schemeForHour,
  type PaletteDef,
} from "../lib/palettes";
import { resolveMotionLevel } from "../lib/motion";
import { MotionLevelContext } from "../lib/motionContext";

dayjs.locale("pt-br");

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      gcTime: 10 * 60 * 1000, // 10 minutes
      refetchOnWindowFocus: false,
    },
  },
});

// Custom IndexedDB persister for React Query
const idbPersister = createAsyncStoragePersister({
  storage: {
    getItem: async (key) => await get(key),
    setItem: async (key, value) => await set(key, value),
    removeItem: async (key) => await del(key),
  },
});

const colorSchemeManager = localStorageColorSchemeManager({
  key: "chronos.color-scheme",
});

// Escreve as cores da paleta no :root (inline vence o global.css e o tema do Mantine).
// Fica dentro do MantineProvider para saber se está claro ou escuro agora.
function PaletteVars({ def, opaque }: { def: PaletteDef; opaque: boolean }) {
  const scheme = useComputedColorScheme("light", { getInitialValueInEffect: false });
  useLayoutEffect(() => {
    const style = document.documentElement.style;
    PALETTE_VAR_NAMES.forEach((name) => style.removeProperty(name));
    Object.entries(paletteVars(def, scheme, opaque)).forEach(([name, value]) =>
      style.setProperty(name, value),
    );
  }, [def, scheme, opaque]);
  return null;
}

// "Pelo horário": escurece às 18h e clareia às 7h, conferindo a cada minuto.
function SchemeSchedule() {
  const [enabled] = useSchemeSchedule();
  const { setColorScheme } = useMantineColorScheme();
  useEffect(() => {
    if (!enabled) return;
    const apply = () => setColorScheme(schemeForHour(new Date().getHours()));
    apply();
    const timer = window.setInterval(apply, 60_000);
    return () => window.clearInterval(timer);
  }, [enabled, setColorScheme]);
  return null;
}

export function AppProviders({ children }: { children: ReactNode }) {
  const [storedPalette] = useAppPalette();
  const [customColors] = useCustomColors();
  const [menuStyle] = useMenuStyle();
  const [backdrop] = useBackdrop();
  const [corners] = useCorners();
  const [glow] = useGlow();
  const [density] = useAppDensity();
  const [motionChoice] = useAppMotion();
  const prefersReducedMotion = useReducedMotion(undefined, { getInitialValueInEffect: false });
  const motionLevel = resolveMotionLevel(motionChoice, prefersReducedMotion);
  const palette = isPaletteId(storedPalette) ? storedPalette : "petroleo";
  const def = useMemo(() => paletteDef(palette, customColors), [palette, customColors]);
  const theme = useMemo(
    () => ({
      ...appTheme,
      colors: {
        ...appTheme.colors,
        minha: mantineScale(def.light.accent) as unknown as MantineColorsTuple,
      },
      primaryColor: def.mantine,
      autoContrast: true,
    }),
    [def],
  );

  // O CSS global (barra do topo, foco, seleção, vidro, animações) lê as mesmas escolhas
  // pelos atributos (antes da pintura, para nada piscar ao abrir).
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.palette = palette;
    root.dataset.density = density;
    root.dataset.motion = motionLevel;
    root.dataset.menu = menuStyle;
    root.dataset.backdrop = backdrop;
    root.dataset.corners = corners;
    const glowLevel = Number.isFinite(glow) ? Math.min(100, Math.max(0, glow)) : 60;
    root.style.setProperty("--glow", String(glowLevel / 100));
  }, [palette, density, motionLevel, menuStyle, backdrop, corners, glow]);

  return (
    <PersistQueryClientProvider 
      client={queryClient} 
      persistOptions={{
        persister: idbPersister,
        maxAge: 1000 * 60 * 60 * 24,
        dehydrateOptions: {
          shouldDehydrateQuery: (query) => {
            return (
              defaultShouldDehydrateQuery(query) &&
              !String(query.queryKey[0]).startsWith("assistant-admin")
            );
          },
        },
      }} // 24 hours
    >
      <ProfileScopeProvider>
        <MantineProvider
          theme={theme}
          cssVariablesResolver={cssVariablesResolver}
          colorSchemeManager={colorSchemeManager}
          defaultColorScheme="light"
        >
          <PaletteVars def={def} opaque={motionLevel === "nenhum"} />
          <SchemeSchedule />
          <DatesProvider settings={{ locale: "pt-br", firstDayOfWeek: 1 }}>
            <ModalsProvider>
              <Notifications position="top-right" limit={4} autoClose={4500} containerWidth={380} />
              <MotionLevelContext.Provider value={motionLevel}>
                {/* "suave" e "nenhum": a biblioteca não desloca nada, só esmaece. */}
                <MotionConfig
                  reducedMotion={motionLevel === "completo" ? "never" : "always"}
                >
                  <LazyMotion features={domAnimation} strict>
                    {children}
                  </LazyMotion>
                </MotionConfig>
              </MotionLevelContext.Provider>
            </ModalsProvider>
          </DatesProvider>
        </MantineProvider>
      </ProfileScopeProvider>
    </PersistQueryClientProvider>
  );
}
