import type { KeyboardEvent, RefObject } from "react";
import { Button, Group, Select, Stack, Text, TextInput, Title, Card } from "@mantine/core";

import type {
  InventoryAdjustmentReason,
  InventoryCountOut,
  InventorySessionOut,
  InventorySessionSummaryOut,
  InventoryStatusFilter,
} from "../../lib/api";
import FilterToolbar from "../ui/FilterToolbar";
import { InventoryCollectorPanel } from "./InventoryCollectorPanel";
import { InventoryCountsTable } from "./InventoryCountsTable";
import { InventorySummaryCards } from "./InventorySummaryCards";

type CollectorLogItem = {
  id: string;
  at: string;
  input: string;
  status: "OK" | "ERRO";
  message: string;
};

type InventorySessionDetailSectionProps = {
  session: InventorySessionOut;
  onSaveCounts: () => void;
  saveCountsLoading: boolean;
  onApplyAdjustments: () => void;
  applyLoading: boolean;
  summary: InventorySessionSummaryOut | null | undefined;
  onSelectSummaryFilter: (filter: "NOT_COUNTED" | "MISSING" | "SURPLUS" | "MATCHED" | "PENDING") => void;
  collectorModeActive: boolean;
  collectorInitializing: boolean;
  collectorLoading: boolean;
  collectorInput: string;
  onCollectorInputChange: (value: string) => void;
  onCollectorInputKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  collectorInputRef: RefObject<HTMLInputElement | null>;
  collectorStep: number;
  onCollectorStepChange: (value: number) => void;
  onInitializeCollectorMode: () => void;
  onStopCollectorMode: () => void;
  onRunCollector: () => void;
  collectorLog: CollectorLogItem[];
  onClearCollectorLog: () => void;
  statusFilter: InventoryStatusFilter;
  statusFilterOptions: { value: InventoryStatusFilter; label: string }[];
  onStatusFilterChange: (value: InventoryStatusFilter) => void;
  search: string;
  onSearchChange: (value: string) => void;
  searchInputRef: RefObject<HTMLInputElement | null>;
  activeFilterCount: number;
  onClearFilters: () => void;
  itemsLoading: boolean;
  itemsErrorMessage: string | null;
  items: InventoryCountOut[];
  edits: Record<
    number,
    {
      qtd_fisico: number;
      motivo_ajuste?: InventoryAdjustmentReason | null;
      observacao?: string | null;
    }
  >;
  onSetItemEdit: (
    productId: number,
    patch: {
      qtd_fisico?: number;
      motivo_ajuste?: InventoryAdjustmentReason | null;
      observacao?: string | null;
    },
    item: InventoryCountOut
  ) => void;
  adjustmentReasonOptions: { value: InventoryAdjustmentReason; label: string }[];
  itemsTotal: number;
  itemsPage: number;
  itemsTotalPages: number;
  onItemsPageChange: (page: number) => void;
};

export function InventorySessionDetailSection({
  session,
  onSaveCounts,
  saveCountsLoading,
  onApplyAdjustments,
  applyLoading,
  summary,
  onSelectSummaryFilter,
  collectorModeActive,
  collectorInitializing,
  collectorLoading,
  collectorInput,
  onCollectorInputChange,
  onCollectorInputKeyDown,
  collectorInputRef,
  collectorStep,
  onCollectorStepChange,
  onInitializeCollectorMode,
  onStopCollectorMode,
  onRunCollector,
  collectorLog,
  onClearCollectorLog,
  statusFilter,
  statusFilterOptions,
  onStatusFilterChange,
  search,
  onSearchChange,
  searchInputRef,
  activeFilterCount,
  onClearFilters,
  itemsLoading,
  itemsErrorMessage,
  items,
  edits,
  onSetItemEdit,
  adjustmentReasonOptions,
  itemsTotal,
  itemsPage,
  itemsTotalPages,
  onItemsPageChange,
}: InventorySessionDetailSectionProps) {
  return (
    <Card withBorder>
      <Stack>
        <Group justify="space-between" wrap="wrap">
          <Stack gap={2}>
            <Title order={4}>Contagens da sessao #{session.id}</Title>
            <Text size="sm" c="dimmed">
              {session.nome} | {session.local} | Status: {session.status}
            </Text>
            <Text size="xs" c="dimmed">
              Atalhos: Ctrl+F busca | Ctrl+B campo do bip | Ctrl+S salvar contagens
            </Text>
          </Stack>
          <Group>
            <Button
              variant="light"
              onClick={onSaveCounts}
              loading={saveCountsLoading}
              disabled={session.status !== "ABERTO"}
            >
              Salvar contagens
            </Button>
            <Button
              color="orange"
              onClick={onApplyAdjustments}
              loading={applyLoading}
              disabled={session.status !== "ABERTO"}
            >
              Aplicar ajustes
            </Button>
          </Group>
        </Group>

        {summary && <InventorySummaryCards summary={summary} onSelectFilter={onSelectSummaryFilter} />}

        <InventoryCollectorPanel
          active={collectorModeActive}
          initializing={collectorInitializing}
          loading={collectorLoading}
          sessionStatus={session.status}
          collectorInput={collectorInput}
          onCollectorInputChange={onCollectorInputChange}
          onCollectorInputKeyDown={onCollectorInputKeyDown}
          collectorInputRef={collectorInputRef}
          collectorStep={collectorStep}
          onCollectorStepChange={onCollectorStepChange}
          onInitialize={onInitializeCollectorMode}
          onStop={onStopCollectorMode}
          onRun={onRunCollector}
          log={collectorLog}
          onClearLog={onClearCollectorLog}
        />

        <FilterToolbar>
          <Group align="end" wrap="wrap">
            <Select
              label="Filtro da contagem"
              data={statusFilterOptions}
              value={statusFilter}
              onChange={(value) => onStatusFilterChange((value as InventoryStatusFilter) || "DIVERGENT")}
              w={220}
              allowDeselect={false}
            />
            <TextInput
              label="Buscar item"
              placeholder="Nome ou ID"
              ref={searchInputRef}
              value={search}
              onChange={(event) => onSearchChange(event.currentTarget.value)}
              w={260}
            />
            <Button variant="subtle" onClick={onClearFilters} disabled={activeFilterCount === 0}>
              Limpar filtros
            </Button>
          </Group>
        </FilterToolbar>

        <InventoryCountsTable
          loading={itemsLoading}
          errorMessage={itemsErrorMessage}
          items={items}
          sessionStatus={session.status}
          edits={edits}
          onSetItemEdit={onSetItemEdit}
          adjustmentReasonOptions={adjustmentReasonOptions}
          totalItems={itemsTotal}
          page={itemsPage}
          totalPages={itemsTotalPages}
          onPageChange={onItemsPageChange}
        />
      </Stack>
    </Card>
  );
}
