import type { ReactNode } from "react";
import { AppShell } from "@mantine/core";
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
      navbar={{ width: 260, breakpoint: "sm" }}
      header={{ height: 60 }}
    >
      <AppShell.Navbar p="md">
        <SidebarNav />
      </AppShell.Navbar>
      <AppShell.Header p="md">
        <HeaderBar health={health} />
      </AppShell.Header>
      <AppShell.Main>{children}</AppShell.Main>
    </AppShell>
  );
}
