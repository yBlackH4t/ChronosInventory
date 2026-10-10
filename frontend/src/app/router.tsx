import { Suspense, lazy, useState } from "react";
import { Center, Loader, Stack, Text } from "@mantine/core";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import PageTransition from "../components/PageTransition";
import { getLoadedPage, loadPage, type PagePath } from "./routePreload";

// lazy() that skips the loading fallback when the chunk was already preloaded
// (cold start or tab hover). Decided once per mount, so a page never remounts.
function lazyPage(path: PagePath) {
  const LazyPage = lazy(() => loadPage(path));
  function Page() {
    const [Loaded] = useState(() => getLoadedPage(path));
    return Loaded ? <Loaded /> : <LazyPage />;
  }
  return Page;
}

const DashboardPage = lazyPage("/dashboard");
const ProductsPage = lazyPage("/produtos");
const MovementsPage = lazyPage("/movimentacoes");
const ImportPage = lazyPage("/importar");
const ExportPage = lazyPage("/exportar");
const ReportsPage = lazyPage("/relatorios");
const BackupPage = lazyPage("/backup");
const InventoryPage = lazyPage("/inventario");
const ReleaseNotesPage = lazyPage("/novidades");
const ProductStatusPage = lazyPage("/itens-status");
const StockProfilesPage = lazyPage("/estoques");
const StockComparePage = lazyPage("/comparar-estoques");
const LabelsPage = lazyPage("/etiquetas");
const LocationsPage = lazyPage("/locais");
const SetupPage = lazyPage("/setup");
const SettingsPage = lazyPage("/configuracoes");
const AssistantPage = lazyPage("/assistente");

function RouteLoader() {
  return (
    <Center h={300}>
      <Stack gap="xs" align="center">
        <Loader size="sm" />
        <Text size="sm" c="dimmed">
          Carregando tela...
        </Text>
      </Stack>
    </Center>
  );
}

export function AppRouter() {
  const location = useLocation();

  return (
    <Suspense fallback={<RouteLoader />}>
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<PageTransition><DashboardPage /></PageTransition>} />
          <Route path="/produtos" element={<PageTransition><ProductsPage /></PageTransition>} />
          <Route path="/movimentacoes" element={<PageTransition><MovementsPage /></PageTransition>} />
          <Route
            path="/entrada-nf"
            element={<Navigate to="/produtos" replace />}
          />
          <Route path="/importar" element={<PageTransition><ImportPage /></PageTransition>} />
          <Route path="/exportar" element={<PageTransition><ExportPage /></PageTransition>} />
          <Route path="/relatorios" element={<PageTransition><ReportsPage /></PageTransition>} />
          <Route path="/backup" element={<PageTransition><BackupPage /></PageTransition>} />
          <Route path="/etiquetas" element={<PageTransition><LabelsPage /></PageTransition>} />
          <Route path="/inventario" element={<PageTransition><InventoryPage /></PageTransition>} />
          <Route path="/itens-status" element={<PageTransition><ProductStatusPage /></PageTransition>} />
          <Route path="/estoques" element={<PageTransition><StockProfilesPage /></PageTransition>} />
          <Route path="/comparar-estoques" element={<PageTransition><StockComparePage /></PageTransition>} />
          <Route path="/novidades" element={<PageTransition><ReleaseNotesPage /></PageTransition>} />
          <Route path="/locais" element={<PageTransition><LocationsPage /></PageTransition>} />
          <Route path="/setup" element={<PageTransition><SetupPage /></PageTransition>} />
          <Route path="/configuracoes" element={<PageTransition><SettingsPage /></PageTransition>} />
          <Route path="/assistente" element={<PageTransition><AssistantPage /></PageTransition>} />
        </Routes>
      </AnimatePresence>
    </Suspense>
  );
}
