import { Suspense, lazy } from "react";
import { Center, Loader, Stack, Text } from "@mantine/core";
import { Navigate, Route, Routes } from "react-router-dom";

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
const LabelsPage = lazy(() => import("../pages/LabelsPage"));

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
  return (
    <Suspense fallback={<RouteLoader />}>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/produtos" element={<ProductsPage />} />
        <Route path="/movimentacoes" element={<MovementsPage />} />
        <Route path="/entrada-nf" element={<Navigate to="/produtos" replace />} />
        <Route path="/importar" element={<ImportPage />} />
        <Route path="/exportar" element={<ExportPage />} />
        <Route path="/relatorios" element={<ReportsPage />} />
        <Route path="/backup" element={<BackupPage />} />
        <Route path="/etiquetas" element={<LabelsPage />} />
        <Route path="/inventario" element={<InventoryPage />} />
        <Route path="/itens-status" element={<ProductStatusPage />} />
        <Route path="/estoques" element={<StockProfilesPage />} />
        <Route path="/novidades" element={<ReleaseNotesPage />} />
      </Routes>
    </Suspense>
  );
}

