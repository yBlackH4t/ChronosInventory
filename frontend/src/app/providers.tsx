import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "@mantine/dates/styles.css";
import "@mantine/spotlight/styles.css";
import "@mantine/carousel/styles.css";
import "@mantine/dropzone/styles.css";
import "@fontsource-variable/inter";
import "../styles/global.css";
import "dayjs/locale/pt-br";

import { useEffect, useMemo, type ReactNode } from "react";
import { MantineProvider, localStorageColorSchemeManager } from "@mantine/core";
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
import { ACCENT_PRIMARY, useAppAccent, useAppDensity } from "../lib/appearance";

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

export function AppProviders({ children }: { children: ReactNode }) {
  const [accent] = useAppAccent();
  const [density] = useAppDensity();
  const theme = useMemo(
    () => ({ ...appTheme, primaryColor: ACCENT_PRIMARY[accent] ?? "brand", autoContrast: true }),
    [accent],
  );

  // O CSS global (barra do topo, foco, seleção) lê a mesma escolha pelo atributo.
  useEffect(() => {
    document.documentElement.dataset.accent = accent;
    document.documentElement.dataset.density = density;
  }, [accent, density]);

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
          <DatesProvider settings={{ locale: "pt-br", firstDayOfWeek: 1 }}>
            <ModalsProvider>
              <Notifications position="top-right" />
              {children}
            </ModalsProvider>
          </DatesProvider>
        </MantineProvider>
      </ProfileScopeProvider>
    </PersistQueryClientProvider>
  );
}
