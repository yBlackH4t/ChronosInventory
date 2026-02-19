import type { ReactNode } from "react";
import { AppShell, Card, Stack } from "@mantine/core";
import type { HealthOut } from "../lib/api";
import SidebarNav from "./SidebarNav";
import HeaderBar from "./HeaderBar";

export default function AppLayout({
  children,
  health,
}: {
  children: ReactNode;
  health: HealthOut;
}) {
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
          {children}
        </Stack>
      </AppShell.Main>
    </AppShell>
  );
}
