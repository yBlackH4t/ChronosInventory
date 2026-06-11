import { useEffect, useRef } from "react";
import { NavLink as RouterLink, useLocation } from "react-router-dom";
import { Divider, NavLink, Stack, Text } from "@mantine/core";
import { useQueryClient } from "@tanstack/react-query";
import {
  IconArrowsExchange,
  IconBarcode,
  IconBox,
  IconClipboardList,
  IconFileExport,
  IconFileImport,
  IconGauge,
  IconReport,
  IconPinned,
  IconPinnedOff,
  IconHourglassEmpty,
  IconSettings,
} from "@tabler/icons-react";
import { api } from "../lib/apiClient";
import { useProfileScope } from "../state/profileScope";

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
      {
        label: "Movimentacoes",
        to: "/movimentacoes",
        icon: IconArrowsExchange,
      },
      { label: "Inventario", to: "/inventario", icon: IconClipboardList },
    ],
  },
  {
    title: "Documentos",
    items: [
      { label: "Etiquetas", to: "/etiquetas", icon: IconBarcode },
      { label: "Relatorios", to: "/relatorios", icon: IconReport },
    ],
  },
  {
    title: "Dados",
    items: [
      { label: "Importar", to: "/importar", icon: IconFileImport },
      { label: "Exportar", to: "/exportar", icon: IconFileExport },
    ],
  },
  {
    title: "Administracao",
    items: [
      { label: "Configuracoes", to: "/configuracoes", icon: IconSettings },
    ],
  },
];

export default function SidebarNav({ collapsed = false, isPinned = true, onTogglePin }: { collapsed?: boolean; isPinned?: boolean; onTogglePin?: () => void }) {
  const location = useLocation();
  const queryClient = useQueryClient();
  const { profileScopeKey } = useProfileScope();
  const prefetched = useRef<Set<string>>(new Set());

  useEffect(() => {
    prefetched.current.clear();
  }, [profileScopeKey]);

  const prefetchByRoute = (route: string) => {
    if (prefetched.current.has(route)) return;
    prefetched.current.add(route);

    if (route === "/dashboard") {
      void queryClient.prefetchQuery({
        queryKey: ["analytics", profileScopeKey, "stock-summary"],
        queryFn: () => api.getAnalyticsStockSummary(),
        staleTime: 30_000,
      });
      void queryClient.prefetchQuery({
        queryKey: ["analytics", profileScopeKey, "stock-distribution"],
        queryFn: () => api.getAnalyticsStockDistribution(),
        staleTime: 30_000,
      });
      return;
    }

    if (route === "/produtos") {
      void queryClient.prefetchQuery({
        queryKey: ["produtos", profileScopeKey, "", 1, "10", "nome"],
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
          profileScopeKey,
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
        queryKey: [
          "labels-products",
          profileScopeKey,
          "",
          "ATIVO",
          "COM_ESTOQUE",
          1,
          "20",
        ],
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

    if (route === "/comparar-estoques") {
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
        queryKey: [
          "produtos-status",
          profileScopeKey,
          "",
          "TODOS",
          "TODOS",
          1,
          "20",
        ],
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
    <Stack gap="md" className="sidebar-shell" style={{ overflowX: "hidden", height: "100%", justifyContent: "space-between" }}>
      <div>
        <Stack gap={2} px={collapsed ? 0 : "xs"} pb="xs" align={collapsed ? "center" : "flex-start"} style={{ transition: "all 0.3s ease", position: "relative" }}>
          {!collapsed && (
            <div style={{ position: "absolute", right: 0, top: 4, cursor: "pointer" }} onClick={onTogglePin}>
              {isPinned ? <IconPinned size={16} color="var(--mantine-color-dimmed)" /> : <IconPinnedOff size={16} color="var(--mantine-color-dimmed)" />}
            </div>
          )}
          {collapsed ? (
             <IconHourglassEmpty size={32} stroke={1.5} color="#f8fafc" style={{ marginBottom: 8 }} />
          ) : (
            <>
              <Text className="sidebar-brand-title" style={{ fontSize: "1.1rem" }}>
                Chronos Inventory
              </Text>
              <Text className="sidebar-brand-subtitle">Gestao de estoque</Text>
            </>
          )}
        </Stack>

        {SECTIONS.map((section, index) => (
        <Stack key={section.title} gap={6}>
          {index > 0 && <Divider opacity={0.18} />}
          {!collapsed && <Text className="sidebar-section-label">{section.title}</Text>}
          <Stack gap={4} align={collapsed ? "center" : "stretch"}>
            {section.items.map((item) => (
              <NavLink
                key={item.to}
                component={RouterLink}
                to={item.to}
                label={!collapsed ? item.label : undefined}
                leftSection={<item.icon size={22} style={{ margin: collapsed ? "0 auto" : undefined }} />}
                active={location.pathname === item.to}
                className="sidebar-nav-link"
                style={{ justifyContent: collapsed ? "center" : "flex-start", padding: collapsed ? "12px 0" : undefined }}
                onMouseEnter={() => prefetchByRoute(item.to)}
                onFocus={() => prefetchByRoute(item.to)}
              />
            ))}
          </Stack>
          </Stack>
        ))}
      </div>
    </Stack>
  );
}
