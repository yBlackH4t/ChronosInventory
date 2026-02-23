import { useState } from "react";
import type { ReactNode } from "react";
import { AppShell, Badge, Button, Card, Group, Stack, Text } from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import type { HealthOut } from "../lib/api";
import { useProfileScope } from "../state/profileScope";
import { isTauri } from "../lib/tauri";
import { notifyError } from "../lib/notify";
import SidebarNav from "./SidebarNav";
import HeaderBar from "./HeaderBar";

export default function AppLayout({
  children,
  health,
}: {
  children: ReactNode;
  health: HealthOut;
}) {
  const { restartRequired, activeProfileName, activeProfileId, backendSupportsProfiles } = useProfileScope();
  const [restarting, setRestarting] = useState(false);

  const handleRestartNow = async () => {
    if (restarting) return;
    setRestarting(true);
    try {
      if (isTauri()) {
        const process = await import("@tauri-apps/api/process");
        await process.relaunch();
        return;
      }
      window.location.reload();
    } catch (error) {
      notifyError(error, "Nao foi possivel reiniciar automaticamente. Feche e abra o app.");
    } finally {
      setRestarting(false);
    }
  };

  return (
    <AppShell
      padding="md"
      navbar={{ width: 276, breakpoint: "sm" }}
      classNames={{
        navbar: "app-shell-navbar",
        main: "app-shell-main",
      }}
    >
      <AppShell.Navbar p="sm">
        <SidebarNav />
      </AppShell.Navbar>
      <AppShell.Main>
        <Stack gap="md">
          <Card className="app-main-header" p="sm">
            <HeaderBar health={health} />
          </Card>

          {backendSupportsProfiles && (
            <Card withBorder p="sm">
              <Group justify="space-between" align="center" wrap="wrap">
                <Group gap="xs" align="center">
                  <Text size="sm" c="dimmed">
                    Estoque ativo:
                  </Text>
                  <Badge variant="light">
                    {activeProfileName} ({activeProfileId})
                  </Badge>
                </Group>

                {restartRequired && (
                  <Group gap="xs">
                    <Badge color="orange" variant="light" leftSection={<IconAlertTriangle size={12} />}>
                      Reinicio pendente
                    </Badge>
                    <Button size="xs" color="orange" onClick={() => void handleRestartNow()} loading={restarting}>
                      Reiniciar agora
                    </Button>
                  </Group>
                )}
              </Group>
            </Card>
          )}

          <div style={restartRequired ? { pointerEvents: "none", opacity: 0.55 } : undefined}>
            {children}
          </div>
        </Stack>
      </AppShell.Main>
    </AppShell>
  );
}

