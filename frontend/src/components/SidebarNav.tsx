import { NavLink as RouterLink, useLocation } from "react-router-dom";
import { Stack, NavLink } from "@mantine/core";
import {
  IconGauge,
  IconBox,
  IconArrowsExchange,
  IconFileImport,
  IconFileExport,
  IconReport,
  IconDatabase,
} from "@tabler/icons-react";

const items = [
  { label: "Dashboard", to: "/dashboard", icon: IconGauge },
  { label: "Produtos", to: "/produtos", icon: IconBox },
  { label: "Movimentacoes", to: "/movimentacoes", icon: IconArrowsExchange },
  { label: "Importar", to: "/importar", icon: IconFileImport },
  { label: "Exportar", to: "/exportar", icon: IconFileExport },
  { label: "Relatorios", to: "/relatorios", icon: IconReport },
  { label: "Backup", to: "/backup", icon: IconDatabase },
];

export default function SidebarNav() {
  const location = useLocation();

  return (
    <Stack gap="xs">
      {items.map((item) => (
        <NavLink
          key={item.to}
          component={RouterLink}
          to={item.to}
          label={item.label}
          leftSection={<item.icon size={18} />}
          active={location.pathname === item.to}
        />
      ))}
    </Stack>
  );
}
