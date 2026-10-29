import { BrowserRouter } from "react-router-dom";
import type { HealthOut } from "../lib/api";
import AppLayout from "../components/AppLayout";
import AppErrorBoundary from "../components/AppErrorBoundary";
import SetupGuard from "../components/SetupGuard";
import { AppRouter } from "./router";
import { useBackendWatch } from "../hooks/useBackendWatch";
import { useTauriUpdater } from "../hooks/useTauriUpdater";
import { GlobalSpotlight } from "../components/common/GlobalSpotlight";

export default function App({ health }: { health: HealthOut }) {
  useTauriUpdater();
  useBackendWatch();

  return (
    <BrowserRouter>
      <GlobalSpotlight />
      <AppErrorBoundary>
        <SetupGuard>
          <AppLayout health={health}>
            <AppRouter />
          </AppLayout>
        </SetupGuard>
      </AppErrorBoundary>
    </BrowserRouter>
  );
}
