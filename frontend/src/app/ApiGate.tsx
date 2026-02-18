import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Button, Center, Loader, Stack, Text, Title } from "@mantine/core";
import { api } from "../lib/apiClient";
import type { HealthOut } from "../lib/api";
import { isTauri } from "../lib/tauri";

const MAX_WAIT_MS = 20_000;

type VersionTuple = [number, number, number];

function parseSemver(value: string): VersionTuple | null {
  const match = /^\s*v?(\d+)\.(\d+)\.(\d+)/.exec(value || "");
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function isBackendOutdatedForApp(backendVersion: string, appVersion: string): boolean {
  const backend = parseSemver(backendVersion);
  const app = parseSemver(appVersion);
  if (!backend || !app) return false;

  // Compatibility contract: backend major/minor must be at least the app major/minor.
  if (backend[0] !== app[0]) return backend[0] < app[0];
  return backend[1] < app[1];
}

export function ApiGate({ children }: { children: (health: HealthOut) => ReactNode }) {
  const [health, setHealth] = useState<HealthOut | null>(null);
  const [failed, setFailed] = useState(false);
  const [incompatible, setIncompatible] = useState<{
    appVersion: string;
    backendVersion: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let delay = 300;
    let elapsed = 0;

    const check = async () => {
      try {
        const result = await api.health();
        if (cancelled) return;

        if (!import.meta.env.DEV && isTauri()) {
          try {
            const tauriApp = await import("@tauri-apps/api/app");
            const appVersion = await tauriApp.getVersion();
            const backendVersion = result.data.version || "0.0.0";
            if (isBackendOutdatedForApp(backendVersion, appVersion)) {
              setIncompatible({ appVersion, backendVersion });
              return;
            }
          } catch {
            // If app version cannot be read, keep current behavior and continue startup.
          }
        }

        setHealth(result.data);
      } catch {
        if (cancelled) return;
        elapsed += delay;
        if (elapsed >= MAX_WAIT_MS) {
          setFailed(true);
          return;
        }
        delay = Math.min(Math.round(delay * 1.5), 2000);
        setTimeout(check, delay);
      }
    };

    check();

    return () => {
      cancelled = true;
    };
  }, []);

  if (health) {
    return <>{children(health)}</>;
  }

  if (incompatible) {
    return (
      <Center h="100vh">
        <Stack gap="md" align="center" maw={520}>
          <Title order={2}>Atualizacao incompleta detectada</Title>
          <Text c="dimmed" ta="center">
            O backend local esta desatualizado para esta versao do app.
          </Text>
          <Text c="dimmed" ta="center">
            App: v{incompatible.appVersion} | Backend: v{incompatible.backendVersion}
          </Text>
          <Text c="dimmed" ta="center">
            Reinstale a versao mais recente do Chronos Inventory para sincronizar os componentes.
          </Text>
          <Button onClick={() => window.location.reload()}>Tentar novamente</Button>
        </Stack>
      </Center>
    );
  }

  if (failed) {
    return (
      <Center h="100vh">
        <Stack gap="md" align="center" maw={420}>
          <Title order={2}>Servico local indisponivel</Title>
          <Text c="dimmed" ta="center">
            Verifique se o backend esta rodando em 127.0.0.1:8000 e tente novamente.
          </Text>
          <Button onClick={() => window.location.reload()}>Tentar novamente</Button>
        </Stack>
      </Center>
    );
  }

  return (
    <Center h="100vh">
      <Stack gap="xs" align="center">
        <Loader size="lg" />
        <Text>Iniciando servico local...</Text>
      </Stack>
    </Center>
  );
}
