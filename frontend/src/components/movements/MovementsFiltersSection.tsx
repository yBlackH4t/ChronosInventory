import { Badge, Button, Collapse, Group, Loader, Select, Stack, Switch, Text, TextInput } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";

import FilterToolbar from "../ui/FilterToolbar";
import {
  LOCATIONS,
  MOVEMENT_NATURES,
  MOVEMENT_TYPES,
  TABLE_VIEW_MODE_OPTIONS,
  type MovementFilters,
  type MovementTableViewMode,
  type MovementsTablePreferences,
} from "../../lib/movements";

type ProductOption = {
  value: string;
  label: string;
};

type Props = {
  productOptions: ProductOption[];
  productLookupLoading: boolean;
  productSearch: string;
  onProductSearchChange: (value: string) => void;
  filters: MovementFilters;
  setFilterValue: <K extends keyof MovementFilters>(field: K, value: MovementFilters[K]) => void;
  pageSize: string;
  setPageSize: (value: string) => void;
  sort: string;
  setSort: (value: string) => void;
  showAdvancedFilters: boolean;
  setShowAdvancedFilters: (value: boolean | ((current: boolean) => boolean)) => void;
  showProductId: boolean;
  setShowProductId: (value: boolean) => void;
  tablePreferences: MovementsTablePreferences;
  setTablePreferences: (updater: (current: MovementsTablePreferences) => MovementsTablePreferences) => void;
};

export default function MovementsFiltersSection({
  productOptions,
  productLookupLoading,
  productSearch,
  onProductSearchChange,
  filters,
  setFilterValue,
  pageSize,
  setPageSize,
  sort,
  setSort,
  showAdvancedFilters,
  setShowAdvancedFilters,
  showProductId,
  setShowProductId,
  tablePreferences,
  setTablePreferences,
}: Props) {
  return (
    <FilterToolbar>
      <Stack gap="sm">
        <Group align="end" wrap="wrap">
          <Select
            label="Produto (nome)"
            placeholder="Buscar por nome"
            data={productOptions}
            searchable
            clearable
            w={280}
            value={filters.produto_id || null}
            onChange={(value) => setFilterValue("produto_id", value ?? "")}
            searchValue={productSearch}
            onSearchChange={onProductSearchChange}
            nothingFoundMessage={
              productSearch.trim().length < 2 ? "Digite ao menos 2 letras" : "Nenhum produto"
            }
            rightSection={productLookupLoading ? <Loader size="xs" /> : undefined}
          />
          <Select
            label="Tipo"
            data={MOVEMENT_TYPES}
            clearable
            value={filters.tipo || null}
            onChange={(value) => setFilterValue("tipo", (value as MovementFilters["tipo"]) ?? "")}
            w={180}
          />
          <Select
            label="Natureza"
            data={MOVEMENT_NATURES}
            clearable
            value={filters.natureza || null}
            onChange={(value) => setFilterValue("natureza", (value as MovementFilters["natureza"]) ?? "")}
            w={220}
          />
          <DatePickerInput
            label="De"
            value={filters.date_from}
            onChange={(value) => setFilterValue("date_from", value as Date | null)}
            w={170}
          />
          <DatePickerInput
            label="Ate"
            value={filters.date_to}
            onChange={(value) => setFilterValue("date_to", value as Date | null)}
            w={170}
          />
          <Select
            label="Por pagina"
            data={["10", "20", "50"]}
            value={pageSize}
            onChange={(value) => {
              if (!value) return;
              setPageSize(value);
            }}
            w={120}
          />
          <Button
            variant="light"
            onClick={() => {
              setSort(sort === "-data" ? "data" : "-data");
            }}
          >
            Ordenar: {sort === "-data" ? "Mais recentes" : "Mais antigos"}
          </Button>
        </Group>

        <Group justify="space-between" wrap="wrap">
          <Text size="xs" c="dimmed">
            Use filtros avancados para origem, destino e busca por ID.
          </Text>
          <Button
            size="xs"
            variant="default"
            onClick={() => setShowAdvancedFilters((value) => !value)}
          >
            {showAdvancedFilters ? "Ocultar filtros avancados" : "Mostrar filtros avancados"}
          </Button>
        </Group>

        <Group align="end" wrap="wrap">
          <Select
            label="Layout da tabela"
            data={TABLE_VIEW_MODE_OPTIONS}
            value={tablePreferences.viewMode}
            onChange={(value) =>
              setTablePreferences((current) => ({
                ...current,
                viewMode: (value as MovementTableViewMode) || "AUTO",
              }))
            }
            w={260}
          />
          <Badge variant="light">Preferencia salva automaticamente</Badge>
        </Group>

        <Collapse in={showAdvancedFilters}>
          <Group align="end" wrap="wrap">
            <Switch
              label="Buscar por ID"
              checked={showProductId}
              onChange={(event) => setShowProductId(event.currentTarget.checked)}
            />
            {showProductId && (
              <TextInput
                label="Produto ID"
                value={filters.produto_id}
                onChange={(event) =>
                  setFilterValue("produto_id", event.currentTarget.value.replace(/\D/g, ""))
                }
                w={140}
              />
            )}
            <Select
              label="Origem"
              data={LOCATIONS}
              clearable
              value={filters.origem || null}
              onChange={(value) => setFilterValue("origem", (value as MovementFilters["origem"]) ?? "")}
              w={140}
            />
            <Select
              label="Destino"
              data={LOCATIONS}
              clearable
              value={filters.destino || null}
              onChange={(value) => setFilterValue("destino", (value as MovementFilters["destino"]) ?? "")}
              w={140}
            />
          </Group>
        </Collapse>
      </Stack>
    </FilterToolbar>
  );
}
