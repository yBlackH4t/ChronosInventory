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
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import dayjs from "dayjs";
import { appTheme } from "../theme/theme";
import { ProfileScopeProvider } from "../state/profileScope";

dayjs.locale("pt-br");

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      gcTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
    },
  },
});

const colorSchemeManager = localStorageColorSchemeManager({
  key: "chronos.color-scheme",
});

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
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
    </QueryClientProvider>
  );
}
