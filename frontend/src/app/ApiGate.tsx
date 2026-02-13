import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Button, Center, Loader, Stack, Text, Title } from "@mantine/core";
import { api } from "../lib/apiClient";
import type { HealthOut } from "../lib/api";

const MAX_WAIT_MS = 20_000;

export function ApiGate({ children }: { children: (health: HealthOut) => ReactNode }) {
  const [health, setHealth] = useState<HealthOut | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let delay = 300;
    let elapsed = 0;

    const check = async () => {
      try {
        const result = await api.health();
        if (cancelled) return;
        setHealth(result.data);
      } catch (err) {
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
