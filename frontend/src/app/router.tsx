import { Navigate, Route, Routes } from "react-router-dom";
import DashboardPage from "../pages/DashboardPage";
import ProductsPage from "../pages/ProductsPage";
import MovementsPage from "../pages/MovementsPage";
import ImportPage from "../pages/ImportPage";
import ExportPage from "../pages/ExportPage";
import ReportsPage from "../pages/ReportsPage";
import BackupPage from "../pages/BackupPage";

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/produtos" element={<ProductsPage />} />
      <Route path="/movimentacoes" element={<MovementsPage />} />
      <Route path="/importar" element={<ImportPage />} />
      <Route path="/exportar" element={<ExportPage />} />
      <Route path="/relatorios" element={<ReportsPage />} />
      <Route path="/backup" element={<BackupPage />} />
    </Routes>
  );
}
