import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AppShell, Button, Group, Text } from "@mantine/core";
import { useHotkeys } from "@mantine/hooks";
import { IconAlertTriangle } from "@tabler/icons-react";
import type { HealthOut } from "../lib/api";
import { useProfileScope } from "../state/profileScope";
import { notifyError } from "../lib/notify";
import { restartApplication } from "../lib/restartApp";
import { PRIMARY_NAV } from "../app/navigation";
import { preloadRoute } from "../app/routePreload";
import TopBar from "./shell/TopBar";

const TOPBAR_HEIGHT = 97; // 52px row + 44px tabs + 1px border

export default function AppLayout({
  children,
  health,
}: {
  children: ReactNode;
  health: HealthOut;
}) {
  const { restartRequired, backendSupportsProfiles } = useProfileScope();
  const [restarting, setRestarting] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useHotkeys(
    PRIMARY_NAV.filter((item) => item.hotkey).map((item) => [
      item.hotkey!,
      () => navigate(item.to),
    ]),
    [],
  );

  // Once the first screen is up, load the other tabs' code in the background so
  // switching (click or Alt+N) never shows the loading screen.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      PRIMARY_NAV.forEach((item) => preloadRoute(item.to));
    }, 1500);
    return () => window.clearTimeout(timer);
  }, []);

  if (location.pathname === "/setup") {
    return <>{children}</>;
  }

  const handleRestartNow = async () => {
    if (restarting) return;
    setRestarting(true);
    try {
      await restartApplication();
    } catch (error) {
      notifyError(
        error,
        "Nao foi possivel reiniciar automaticamente. Feche e abra o app.",
      );
    } finally {
      setRestarting(false);
    }
  };

  const showRestartBanner = backendSupportsProfiles && restartRequired;

  return (
    <AppShell
      header={{ height: TOPBAR_HEIGHT }}
      padding={0}
      classNames={{ header: "topbar", main: "app-shell-main" }}
    >
      <AppShell.Header withBorder={false}>
        <TopBar health={health} />
      </AppShell.Header>

      <AppShell.Main>
        {showRestartBanner && (
          <div className="restart-banner">
            <Group
              justify="space-between"
              wrap="wrap"
              gap="sm"
              className="topbar-inner"
              py={8}
            >
              <Group gap="xs">
                <IconAlertTriangle
                  size={16}
                  stroke={1.75}
                  color="var(--warning)"
                />
                <Text size="sm">
                  Alteracoes aplicadas. Reinicie o sistema para ter efeito.
                </Text>
              </Group>
              <Button
                size="xs"
                variant="light"
                color="orange"
                onClick={() => void handleRestartNow()}
                loading={restarting}
              >
                Reiniciar agora
              </Button>
            </Group>
          </div>
        )}

        <div
          className="app-content"
          style={
            restartRequired
              ? { pointerEvents: "none", opacity: 0.55 }
              : undefined
          }
        >
          {children}
        </div>
      </AppShell.Main>
    </AppShell>
  );
}
