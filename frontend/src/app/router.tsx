import { Suspense, lazy } from "react";
import { Center, Loader, Stack, Text } from "@mantine/core";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import PageTransition from "../components/PageTransition";

const DashboardPage = lazy(() => import("../pages/DashboardPage"));
const ProductsPage = lazy(() => import("../pages/ProductsPage"));
const MovementsPage = lazy(() => import("../pages/MovementsPage"));
const ImportPage = lazy(() => import("../pages/ImportPage"));
const ExportPage = lazy(() => import("../pages/ExportPage"));
const ReportsPage = lazy(() => import("../pages/ReportsPage"));
const BackupPage = lazy(() => import("../pages/BackupPage"));
const InventoryPage = lazy(() => import("../pages/InventoryPage"));
const ReleaseNotesPage = lazy(() => import("../pages/ReleaseNotesPage"));
const ProductStatusPage = lazy(() => import("../pages/ProductStatusPage"));
const StockProfilesPage = lazy(() => import("../pages/StockProfilesPage"));
const StockComparePage = lazy(() => import("../pages/StockComparePage"));
const LabelsPage = lazy(() => import("../pages/LabelsPage"));
const LocationsPage = lazy(() => import("../pages/LocationsPage"));
const SetupPage = lazy(() => import("../pages/SetupPage"));
const SettingsPage = lazy(() => import("../pages/SettingsPage"));

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
        </Routes>
      </AnimatePresence>
    </Suspense>
  );
}
