import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Center, Loader, Stack, Text } from "@mantine/core";
import { useLocations } from "../hooks/useLocations";

export default function SetupGuard({ children }: { children: ReactNode }) {
  const { locations, isPending, isFetching } = useLocations();
  const location = useLocation();

  // isPending (not isLoading): while the persisted cache is being restored the
  // query is pending but not fetching, and redirecting then sent every reload
  // (F5) through /setup to /dashboard. An empty cached list is only trusted
  // once the refetch confirms it.
  if (isPending || (locations.length === 0 && isFetching)) {
    return (
      <Center h="100vh">
        <Stack gap="xs" align="center">
          <Loader size="md" />
          <Text size="sm" c="dimmed">
            Carregando configurações…
          </Text>
        </Stack>
      </Center>
    );
  }

  const isSetupPath = location.pathname === "/setup";
  const hasLocations = locations.length > 0;

  if (!hasLocations && !isSetupPath) {
    return <Navigate to="/setup" replace />;
  }

  if (hasLocations && isSetupPath) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
