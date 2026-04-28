import { Component, type ReactNode } from "react";
import { Badge, Button, Stack } from "@mantine/core";

import MovementsFiltersSection from "../components/movements/MovementsFiltersSection";
import MovementsHistoryModal from "../components/movements/MovementsHistoryModal";
import MovementsTableSection from "../components/movements/MovementsTableSection";
import EmptyState from "../components/ui/EmptyState";
import PageHeader from "../components/ui/PageHeader";
import { useMovementsPageState } from "../hooks/useMovementsPageState";

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
            title="Movimentacoes"
            subtitle="Ocorreu um erro visual nesta tela. Clique para recarregar."
          />
          <EmptyState
            message="Falha ao renderizar esta visualizacao."
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

  return (
    <Stack gap="xl">
      <Stack gap="sm">
        <PageHeader
          title="Historico de movimentacoes"
          subtitle="Filtros detalhados para rastrear entradas, saidas, transferencias e devolucoes."
          actions={(
            <>
              <Badge variant="light">Filtros ativos: {state.activeViewCount}</Badge>
              <Button
                size="xs"
                variant="subtle"
                onClick={state.clearFilters}
                disabled={state.activeViewCount === 0}
              >
                Limpar filtros
              </Button>
              <Button size="xs" variant="subtle" onClick={state.resetView}>
                Resetar visao
              </Button>
            </>
          )}
        />

        <MovementsFiltersSection
          productOptions={state.productOptions}
          productLookupLoading={state.productLookupLoading}
          productSearch={state.productSearch}
          onProductSearchChange={state.setProductSearch}
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
