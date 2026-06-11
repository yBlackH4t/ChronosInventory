import { useState } from "react";
import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import {
  AppShell,
  Badge,
  Button,
  Card,
  Group,
  Stack,
  Text,
} from "@mantine/core";
import { useHover, useLocalStorage } from "@mantine/hooks";
import { IconAlertTriangle } from "@tabler/icons-react";
import { AnimatePresence, motion } from "framer-motion";
import type { HealthOut } from "../lib/api";
import { useProfileScope } from "../state/profileScope";
import { notifyError } from "../lib/notify";
import { restartApplication } from "../lib/restartApp";
import SidebarNav from "./SidebarNav";
import HeaderBar from "./HeaderBar";

export default function AppLayout({
  children,
  health,
}: {
  children: ReactNode;
  health: HealthOut;
}) {
  const {
    restartRequired,
    activeProfileName,
    activeProfileId,
    backendSupportsProfiles,
  } = useProfileScope();
  const [restarting, setRestarting] = useState(false);
  const location = useLocation();

  const [isPinned, setIsPinned] = useLocalStorage({
    key: "chronos.sidebar.pinned",
    defaultValue: true,
  });

  const { hovered, ref: navbarRef } = useHover();
  const isExpanded = isPinned || hovered;

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

  return (
    <AppShell
      padding="md"
      navbar={{ width: isExpanded ? 276 : 80, breakpoint: "sm" }}
      transitionDuration={300}
      transitionTimingFunction="cubic-bezier(0.4, 0, 0.2, 1)"
      classNames={{
        navbar: "app-shell-navbar",
        main: "app-shell-main",
      }}
    >
      <AppShell.Navbar p="sm" ref={navbarRef} style={{ overflowX: "hidden" }}>
        <SidebarNav collapsed={!isExpanded} isPinned={isPinned} onTogglePin={() => setIsPinned(!isPinned)} />
      </AppShell.Navbar>
      <AppShell.Main>
        <Stack gap="md">
          <Card className="app-main-header" p="sm">
            <HeaderBar health={health} />
          </Card>

          {backendSupportsProfiles && restartRequired && (
            <Card withBorder p="sm" style={{ borderColor: "var(--mantine-color-orange-outline)" }}>
              <Group justify="space-between" align="center" wrap="wrap">
                <Group gap="xs">
                  <Badge
                    color="orange"
                    variant="light"
                    leftSection={<IconAlertTriangle size={12} />}
                  >
                    Reinicio pendente
                  </Badge>
                  <Text size="sm" c="dimmed">
                    Alteracoes aplicadas. Reinicie o sistema para ter efeito.
                  </Text>
                </Group>
                <Button
                  size="xs"
                  color="orange"
                  onClick={() => void handleRestartNow()}
                  loading={restarting}
                >
                  Reiniciar agora
                </Button>
              </Group>
            </Card>
          )}

          <div
            style={
              restartRequired
                ? { pointerEvents: "none", opacity: 0.55 }
                : undefined
            }
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0, y: 15, scale: 0.98, filter: "blur(4px)" }}
                animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: -15, scale: 0.98, filter: "blur(4px)" }}
                transition={{ type: "spring", stiffness: 260, damping: 20 }}
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </div>
        </Stack>
      </AppShell.Main>
    </AppShell>
  );
}
