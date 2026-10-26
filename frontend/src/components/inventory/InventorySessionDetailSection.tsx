import type { KeyboardEvent, RefObject } from "react";
import {
  Button,
  Card,
  Group,
  Kbd,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";

import type {
  InventoryAdjustmentReason,
  InventoryCountOut,
  InventorySessionOut,
  InventorySessionSummaryOut,
  InventoryStatusFilter,
} from "../../lib/api";
import { sessionLocalLabel, sessionProgress } from "../../lib/inventoryView";
import ProgressRing from "../ui/ProgressRing";
import "../../styles/vidro-telas.css";
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
  onSelectSummaryFilter: (
    filter: "NOT_COUNTED" | "MISSING" | "SURPLUS" | "MATCHED" | "PENDING",
  ) => void;
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
    item: InventoryCountOut,
  ) => void;
  adjustmentReasonOptions: {
    value: InventoryAdjustmentReason;
    label: string;
  }[];
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
  const statusLabel =
    session.status === "ABERTO"
      ? "Em contagem"
      : session.status === "FECHADO"
        ? "Fechada"
        : session.status === "APLICADO"
          ? "Ajuste aplicado"
          : session.status;
  const sessionOpen = session.status === "ABERTO";

  return (
    <Stack gap="md">
      <div className="vt-session-hero surface-panel">
        <ProgressRing
          value={sessionProgress(session)}
          caption="contado"
        />
        <Stack gap={4} miw={0} style={{ flex: 1 }}>
          <Group gap={8} wrap="wrap">
            <span className="vt-chip num">Sessão #{session.id}</span>
            <span className="vt-chip">{sessionLocalLabel(session)}</span>
            <span className="vt-chip" data-tone={sessionOpen ? "live" : undefined}>
              {sessionOpen && <span className="vt-live-dot" aria-hidden />}
              {statusLabel}
            </span>
          </Group>
          <Text fw={650} size="xl" lh={1.25} truncate="end">
            {session.nome}
          </Text>
          <Text size="sm" c="dimmed" className="num">
            {session.counted_items.toLocaleString("pt-BR")} de {session.total_items.toLocaleString("pt-BR")} itens
            contados · {session.divergent_items.toLocaleString("pt-BR")} com diferença
          </Text>
          <Group gap={6} mt={2}>
            <Kbd size="xs">Ctrl F</Kbd>
            <Text size="xs" c="dimmed">
              busca
            </Text>
            <Kbd size="xs">Ctrl B</Kbd>
            <Text size="xs" c="dimmed">
              bip
            </Text>
            <Kbd size="xs">Ctrl S</Kbd>
            <Text size="xs" c="dimmed">
              salvar
            </Text>
          </Group>
        </Stack>
        <Group gap="xs" className="vt-session-actions">
          <Button
            variant="default"
            onClick={onSaveCounts}
            loading={saveCountsLoading}
            disabled={!sessionOpen}
          >
            Salvar contagens
          </Button>
          <Button
            onClick={onApplyAdjustments}
            loading={applyLoading}
            disabled={!sessionOpen}
          >
            Aplicar ajustes
          </Button>
        </Group>
      </div>

      {summary && (
        <InventorySummaryCards
          summary={summary}
          activeFilter={statusFilter}
          onSelectFilter={onSelectSummaryFilter}
        />
      )}

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

      <Card p={0} style={{ overflow: "hidden" }}>
        <Group
          gap="sm"
          wrap="wrap"
          px="lg"
          py="sm"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <TextInput
            placeholder="Buscar item por nome ou ID"
            aria-label="Buscar item"
            leftSection={<IconSearch size={16} stroke={1.5} />}
            ref={searchInputRef}
            value={search}
            onChange={(event) => onSearchChange(event.currentTarget.value)}
            style={{ flex: 1, minWidth: 220 }}
          />
          <Select
            aria-label="Filtro da contagem"
            data={statusFilterOptions}
            value={statusFilter}
            onChange={(value) =>
              onStatusFilterChange(
                (value as InventoryStatusFilter) || "DIVERGENT",
              )
            }
            w={220}
            allowDeselect={false}
          />
          {activeFilterCount > 0 && (
            <Button variant="subtle" color="gray" onClick={onClearFilters}>
              Limpar
            </Button>
          )}
        </Group>

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
      </Card>
    </Stack>
  );
}
