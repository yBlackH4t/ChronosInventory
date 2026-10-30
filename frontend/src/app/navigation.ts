import { useCallback, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  IconArrowsDiff,
  IconArrowsExchange,
  IconBarcode,
  IconBox,
  IconBuildingStore,
  IconBuildingWarehouse,
  IconChecklist,
  IconClipboardList,
  IconCloudUpload,
  IconDatabase,
  IconFileExport,
  IconFileImport,
  IconGauge,
  IconReport,
  IconSettings,
  IconMessageChatbot,
} from "@tabler/icons-react";
import { api } from "../lib/apiClient";
import { useProfileScope } from "../state/profileScope";
import { preloadRoute } from "./routePreload";

export type NavItem = {
  label: string;
  to: string;
  icon: typeof IconGauge;
  description?: string;
  hotkey?: string;
};

export type NavGroup = {
  title: string;
  items: NavItem[];
};

// Daily-use screens shown as top bar tabs (Alt+1..6).
export const PRIMARY_NAV: NavItem[] = [
  {
    label: "Painel",
    to: "/dashboard",
    icon: IconGauge,
    description: "Visão consolidada do estoque",
    hotkey: "alt+1",
  },
  {
    label: "Produtos",
    to: "/produtos",
    icon: IconBox,
    description: "Consulta de estoque, catálogo e equivalências",
    hotkey: "alt+2",
  },
  {
    label: "Movimentações",
    to: "/movimentacoes",
    icon: IconArrowsExchange,
    description: "Entradas, saídas e transferências",
    hotkey: "alt+3",
  },
  {
    label: "Inventário",
    to: "/inventario",
    icon: IconClipboardList,
    description: "Contagem física e conciliação",
    hotkey: "alt+4",
  },
  {
    label: "Etiquetas",
    to: "/etiquetas",
    icon: IconBarcode,
    description: "Etiquetas de estoque e expedição",
    hotkey: "alt+5",
  },
  {
    label: "Relatórios",
    to: "/relatorios",
    icon: IconReport,
    description: "Estoque, vendas e itens parados",
    hotkey: "alt+6",
  },
  {
    label: "Assistente",
    to: "/assistente",
    icon: IconMessageChatbot,
    description: "Assistente de IA",
    hotkey: "alt+7",
  },
];

// Administrative screens, reachable from the gear menu, Settings and Ctrl+K.
// Grouped by what the person wants to do (2.7.26). "Primeira configuração" left the
// menu: with a branch registered it only bounced back to the Painel.
export const ADMIN_NAV: NavGroup[] = [
  {
    title: "Cadastro",
    items: [
      {
        label: "Importar",
        to: "/importar",
        icon: IconFileImport,
        description: "Planilhas, fotos em lote, catálogo e cadastro da empresa",
      },
      {
        label: "Exportar",
        to: "/exportar",
        icon: IconFileExport,
        description: "Planilhas de produtos e movimentações",
      },
      {
        label: "Ativação em massa",
        to: "/itens-status",
        icon: IconChecklist,
        description: "Ativar ou inativar vários produtos",
      },
      {
        label: "Filiais e locais",
        to: "/locais",
        icon: IconBuildingStore,
        description: "Onde o estoque fica guardado",
      },
    ],
  },
  {
    title: "Cópias e outros computadores",
    items: [
      {
        label: "Backup e segurança",
        to: "/backup",
        icon: IconDatabase,
        description: "Cópias dos dados deste computador",
      },
      {
        label: "Base oficial",
        to: "/base-oficial",
        icon: IconCloudUpload,
        description: "Publicar a base ou pegar do computador principal",
      },
      {
        label: "Comparar estoques",
        to: "/comparar-estoques",
        icon: IconArrowsDiff,
        description: "Diferenças entre este computador e outro",
      },
      {
        label: "Perfis de estoque",
        to: "/estoques",
        icon: IconBuildingWarehouse,
        description: "Bancos separados neste computador",
      },
    ],
  },
  {
    title: "Sistema",
    items: [
      {
        label: "Configurações",
        to: "/configuracoes",
        icon: IconSettings,
        description: "Aparência e este computador",
      },
    ],
  },
];

export function isRouteActive(pathname: string, to: string) {
  return pathname === to || pathname.startsWith(`${to}/`);
}

// Warms the React Query cache for a route on hover/focus of its nav entry.
export function usePrefetchRoute() {
  const queryClient = useQueryClient();
  const { profileScopeKey } = useProfileScope();
  const prefetched = useRef<Set<string>>(new Set());

  useEffect(() => {
    prefetched.current.clear();
  }, [profileScopeKey]);

  return useCallback(
    (route: string) => {
      preloadRoute(route);
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
          queryKey: ["produtos", profileScopeKey, "", 1, "10", "nome", "TODOS"],
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

      if (route === "/estoques" || route === "/comparar-estoques") {
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
    },
    [profileScopeKey, queryClient],
  );
}
