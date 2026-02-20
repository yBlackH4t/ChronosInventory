import { useRef } from "react";
import { NavLink as RouterLink, useLocation } from "react-router-dom";
import { Divider, NavLink, Stack, Text } from "@mantine/core";
import { useQueryClient } from "@tanstack/react-query";
import {
  IconArrowsExchange,
  IconBarcode,
  IconBox,
  IconCheckbox,
  IconClipboardList,
  IconDatabase,
  IconFileExport,
  IconFileImport,
  IconGauge,
  IconReport,
  IconSparkles,
} from "@tabler/icons-react";
import { api } from "../lib/apiClient";

type NavItem = {
  label: string;
  to: string;
  icon: typeof IconGauge;
};

const SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: "Operacao",
    items: [
      { label: "Dashboard", to: "/dashboard", icon: IconGauge },
      { label: "Produtos", to: "/produtos", icon: IconBox },
      { label: "Movimentacoes", to: "/movimentacoes", icon: IconArrowsExchange },
      { label: "Inventario", to: "/inventario", icon: IconClipboardList },
    ],
  },
  {
    title: "Arquivos",
    items: [
      { label: "Importar", to: "/importar", icon: IconFileImport },
      { label: "Exportar", to: "/exportar", icon: IconFileExport },
      { label: "Etiquetas", to: "/etiquetas", icon: IconBarcode },
      { label: "Relatorios", to: "/relatorios", icon: IconReport },
    ],
  },
  {
    title: "Sistema",
    items: [
      { label: "Backup", to: "/backup", icon: IconDatabase },
      { label: "Estoques", to: "/estoques", icon: IconDatabase },
      { label: "Ativar/Inativar", to: "/itens-status", icon: IconCheckbox },
      { label: "Novidades", to: "/novidades", icon: IconSparkles },
    ],
  },
];

export default function SidebarNav() {
  const location = useLocation();
  const queryClient = useQueryClient();
  const prefetched = useRef<Set<string>>(new Set());

  const prefetchByRoute = (route: string) => {
    if (prefetched.current.has(route)) return;
    prefetched.current.add(route);

    if (route === "/dashboard") {
      void queryClient.prefetchQuery({
        queryKey: ["analytics", "stock-summary"],
        queryFn: () => api.getAnalyticsStockSummary(),
        staleTime: 30_000,
      });
      void queryClient.prefetchQuery({
        queryKey: ["analytics", "stock-distribution"],
        queryFn: () => api.getAnalyticsStockDistribution(),
        staleTime: 30_000,
      });
      return;
    }

    if (route === "/produtos") {
      void queryClient.prefetchQuery({
        queryKey: ["produtos", "", 1, "10", "nome"],
        queryFn: () =>
          api.listProducts({
            query: "",
            page: 1,
            page_size: 10,
            sort: "nome",
          }),
        staleTime: 30_000,
      });
      return;
    }

    if (route === "/movimentacoes") {
      void queryClient.prefetchQuery({
        queryKey: [
          "movimentacoes",
          1,
          "10",
          "-data",
          {
            produto_id: "",
            tipo: "",
            natureza: "",
            origem: "",
            destino: "",
            date_from: null,
            date_to: null,
          },
        ],
        queryFn: () =>
          api.listMovements({
            page: 1,
            page_size: 10,
            sort: "-data",
          }),
        staleTime: 30_000,
      });
      return;
    }

    if (route === "/backup") {
      void queryClient.prefetchQuery({
        queryKey: ["backup-list"],
        queryFn: () => api.backupList(),
        staleTime: 30_000,
      });
      void queryClient.prefetchQuery({
        queryKey: ["backup-auto-config"],
        queryFn: () => api.backupAutoConfig(),
        staleTime: 30_000,
      });
      return;
    }

    if (route === "/etiquetas") {
      void queryClient.prefetchQuery({
        queryKey: ["labels-products", "", "ATIVO", "COM_ESTOQUE", 1, "20"],
        queryFn: () =>
          api.listProductsStatus({
            query: "",
            status: "ATIVO",
            has_stock: true,
            page: 1,
            page_size: 20,
            sort: "nome",
          }),
        staleTime: 30_000,
      });
      return;
    }

    if (route === "/estoques") {
      void queryClient.prefetchQuery({
        queryKey: ["stock-profiles"],
        queryFn: () => api.listStockProfiles(),
        staleTime: 30_000,
      });
      return;
    }

    if (route === "/inventario") {
      void queryClient.prefetchQuery({
        queryKey: ["inventory-sessions", 1],
        queryFn: () => api.inventoryListSessions({ page: 1, page_size: 20 }),
        staleTime: 30_000,
      });
      return;
    }

    if (route === "/itens-status") {
      void queryClient.prefetchQuery({
        queryKey: ["produtos-status", "", "TODOS", "TODOS", 1, "20"],
        queryFn: () =>
          api.listProductsStatus({
            query: "",
            status: "TODOS",
            has_stock: undefined,
            page: 1,
            page_size: 20,
            sort: "nome",
          }),
        staleTime: 30_000,
      });
    }
  };

  return (
    <Stack gap="md" className="sidebar-shell">
      <Stack gap={2} px="xs" pb="xs">
        <Text className="sidebar-brand-title">Chronos Inventory</Text>
        <Text className="sidebar-brand-subtitle">Gestao de estoque</Text>
      </Stack>

      {SECTIONS.map((section, index) => (
        <Stack key={section.title} gap={6}>
          {index > 0 && <Divider opacity={0.18} />}
          <Text className="sidebar-section-label">{section.title}</Text>
          <Stack gap={4}>
            {section.items.map((item) => (
              <NavLink
                key={item.to}
                component={RouterLink}
                to={item.to}
                label={item.label}
                leftSection={<item.icon size={18} />}
                active={location.pathname === item.to}
                className="sidebar-nav-link"
                onMouseEnter={() => prefetchByRoute(item.to)}
                onFocus={() => prefetchByRoute(item.to)}
              />
            ))}
          </Stack>
        </Stack>
      ))}
    </Stack>
  );
}
