import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Center, Loader, Stack, Text } from "@mantine/core";
import { useLocations } from "../hooks/useLocations";

export default function SetupGuard({ children }: { children: ReactNode }) {
  const { locations, isLoading } = useLocations();
  const location = useLocation();

  if (isLoading) {
    return (
      <Center h="100vh">
        <Stack gap="xs" align="center">
          <Loader size="md" />
          <Text size="sm" c="dimmed">
            Carregando configuracoes...
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
