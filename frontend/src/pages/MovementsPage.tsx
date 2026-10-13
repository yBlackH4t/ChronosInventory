import { Component, useEffect, type ReactNode } from "react";
import { Button, Stack } from "@mantine/core";
import { useState } from "react";
import { IconQrcode } from "@tabler/icons-react";

import MovementsFiltersSection from "../components/movements/MovementsFiltersSection";
import MovementsHistoryModal from "../components/movements/MovementsHistoryModal";
import MovementsTableSection from "../components/movements/MovementsTableSection";
import BatchMovementModal from "../components/scanner/BatchMovementModal";
import EmptyState from "../components/ui/EmptyState";
import PageHeader from "../components/ui/PageHeader";
import { useMovementsPageState } from "../hooks/useMovementsPageState";
import { useScanner } from "../lib/useScanner";

type MovementsPageErrorBoundaryProps = {
  children: ReactNode;
};

type MovementsPageErrorBoundaryState = {
  hasError: boolean;
};

class MovementsPageErrorBoundary extends Component<
  MovementsPageErrorBoundaryProps,
  MovementsPageErrorBoundaryState
> {
  constructor(props: MovementsPageErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): MovementsPageErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown): void {
    console.error("Erro ao renderizar Movimentacoes:", error);
  }

  private handleReload = () => {
    if (typeof window !== "undefined") window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <Stack gap="lg">
          <PageHeader
            title="Movimentações"
            subtitle="Ocorreu um erro ao exibir esta tela."
          />
          <EmptyState
            message="Falha ao exibir as movimentações"
            actionLabel="Recarregar tela"
            onAction={this.handleReload}
          />
        </Stack>
      );
    }
    return this.props.children;
  }
}

function MovementsPageContent() {
  const state = useMovementsPageState();
  const { listen } = useScanner();
  const [batchModalOpened, setBatchModalOpened] = useState(false);

  useEffect(() => {
    if (batchModalOpened) return;
    return listen((code) => {
      state.setProductSearch(code);
      state.setPage(1);
    });
  }, [listen, state, batchModalOpened]);

  return (
    <Stack gap="lg">
      <Stack gap="lg">
        <PageHeader
          title="Movimentações"
          subtitle="Entradas, saídas, transferências e devoluções de todas as filiais."
          actions={
            <Button
              leftSection={<IconQrcode size={16} stroke={1.5} />}
              onClick={() => setBatchModalOpened(true)}
            >
              Movimentação em lote
            </Button>
          }
        />

        <BatchMovementModal
          opened={batchModalOpened}
          onClose={() => setBatchModalOpened(false)}
          onSuccess={() => {
            state.listRefetch();
          }}
        />

        <MovementsFiltersSection
          productOptions={state.productOptions}
          productLookupLoading={state.productLookupLoading}
          productSearch={state.productSearch}
          onProductSearchChange={state.setProductSearch}
          documentoSearch={state.documentoSearch}
          onDocumentoSearchChange={state.setDocumentoSearch}
          filters={state.filters}
          setFilterValue={state.setFilterValue}
          pageSize={state.pageSize}
          setPageSize={state.setPageSize}
          sort={state.sort}
          setSort={state.setSort}
          showAdvancedFilters={state.showAdvancedFilters}
          setShowAdvancedFilters={state.setShowAdvancedFilters}
          showProductId={state.showProductId}
          setShowProductId={state.setShowProductId}
          tablePreferences={state.tablePreferences}
          setTablePreferences={state.setTablePreferences}
          activeViewCount={state.activeViewCount}
          onClearFilters={state.clearFilters}
          onResetView={state.resetView}
        />

        <MovementsTableSection
          loading={state.loading}
          errorMessage={state.listErrorMessage}
          onRetry={() => void state.listRefetch()}
          rows={state.rows}
          tableLayout={state.tableLayout}
          tableColumnCount={state.tableColumnCount}
          activeViewCount={state.activeViewCount}
          clearFilters={state.clearFilters}
          totalItems={state.totalItems}
          page={state.page}
          setPage={state.setPage}
          totalPages={state.totalPages}
          openHistory={state.openHistory}
        />
      </Stack>

      <MovementsHistoryModal
        opened={state.historyOpened}
        onClose={state.closeHistory}
        historyProductId={state.historyProductId}
        loading={state.historyLoading}
        errorMessage={state.historyErrorMessage}
        rows={state.historyRows}
        onRetry={() => void state.historyRefetch()}
      />
    </Stack>
  );
}

export default function MovementsPage() {
  return (
    <MovementsPageErrorBoundary>
      <MovementsPageContent />
    </MovementsPageErrorBoundary>
  );
}
