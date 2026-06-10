import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "@mantine/dates/styles.css";
import "../styles/global.css";
import "dayjs/locale/pt-br";

import type { ReactNode } from "react";
import { MantineProvider, localStorageColorSchemeManager } from "@mantine/core";
import { DatesProvider } from "@mantine/dates";
import { ModalsProvider } from "@mantine/modals";
import { Notifications } from "@mantine/notifications";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { get, set, del } from "idb-keyval";
import dayjs from "dayjs";
import { appTheme } from "../theme/theme";
import { ProfileScopeProvider } from "../state/profileScope";

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
  return (
    <PersistQueryClientProvider 
      client={queryClient} 
      persistOptions={{ persister: idbPersister, maxAge: 1000 * 60 * 60 * 24 }} // 24 hours
    >
      <ProfileScopeProvider>
        <MantineProvider
          theme={appTheme}
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
