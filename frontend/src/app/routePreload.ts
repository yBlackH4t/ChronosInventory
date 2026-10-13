import type { ComponentType } from "react";

// Page chunks by route. The router builds its lazy() pages from these, and
// preloadRoute() starts the same imports early (cold start, tab hover), so the
// chunk is usually ready by the time the page renders.
export const PAGE_IMPORTS = {
  "/dashboard": () => import("../pages/DashboardPage"),
  "/produtos": () => import("../pages/ProductsPage"),
  "/movimentacoes": () => import("../pages/MovementsPage"),
  "/importar": () => import("../pages/ImportPage"),
  "/exportar": () => import("../pages/ExportPage"),
  "/relatorios": () => import("../pages/ReportsPage"),
  "/backup": () => import("../pages/BackupPage"),
  "/inventario": () => import("../pages/InventoryPage"),
  "/novidades": () => import("../pages/ReleaseNotesPage"),
  "/itens-status": () => import("../pages/ProductStatusPage"),
  "/estoques": () => import("../pages/StockProfilesPage"),
  "/comparar-estoques": () => import("../pages/StockComparePage"),
  "/etiquetas": () => import("../pages/LabelsPage"),
  "/locais": () => import("../pages/LocationsPage"),
  "/setup": () => import("../pages/SetupPage"),
  "/configuracoes": () => import("../pages/SettingsPage"),
  "/assistente": () => import("../pages/AssistantPage"),
} as const;

export type PagePath = keyof typeof PAGE_IMPORTS;

const loadedPages = new Map<PagePath, ComponentType>();

// Imports a page and remembers its component, so a later mount can render it
// synchronously instead of suspending (React.lazy always suspends once).
export function loadPage(path: PagePath) {
  return PAGE_IMPORTS[path]().then((module) => {
    loadedPages.set(path, module.default);
    return module;
  });
}

export function getLoadedPage(path: PagePath): ComponentType | undefined {
  return loadedPages.get(path);
}

// Chunks a page lazy-loads on its first render.
const PAGE_EXTRAS: Partial<Record<PagePath, () => Promise<unknown>>> = {
  "/dashboard": () => import("../components/dashboard/DashboardVisuals"),
};

const started = new Set<string>();

export function preloadRoute(pathname: string): void {
  const path = (pathname === "/" ? "/dashboard" : pathname) as PagePath;
  if (!(path in PAGE_IMPORTS) || started.has(path)) return;
  started.add(path);
  // Best effort: a failed preload is retried by the page's own lazy import.
  void loadPage(path).catch(() => started.delete(path));
  void PAGE_EXTRAS[path]?.().catch(() => {});
}
