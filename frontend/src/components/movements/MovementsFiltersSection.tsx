import {
  Button,
  Collapse,
  Group,
  Loader,
  Select,
  Stack,
  Switch,
  TextInput,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { IconFilter, IconSortDescending, IconSortAscending } from "@tabler/icons-react";

import FilterToolbar from "../ui/FilterToolbar";
import { useLocations } from "../../hooks/useLocations";
import {
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
  setFilterValue: <K extends keyof MovementFilters>(
    field: K,
    value: MovementFilters[K],
  ) => void;
  pageSize: string;
  setPageSize: (value: string) => void;
  sort: string;
  setSort: (value: string) => void;
  showAdvancedFilters: boolean;
  setShowAdvancedFilters: (
    value: boolean | ((current: boolean) => boolean),
  ) => void;
  showProductId: boolean;
  setShowProductId: (value: boolean) => void;
  tablePreferences: MovementsTablePreferences;
  setTablePreferences: (
    updater: (current: MovementsTablePreferences) => MovementsTablePreferences,
  ) => void;
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
  const { locations } = useLocations();
  const locationOptions = locations.map((loc) => ({
    value: String(loc.id),
    label: loc.name,
  }));

  return (
    <FilterToolbar>
      <Stack gap="sm">
        <Group justify="space-between" align="end" wrap="wrap">
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
                productSearch.trim().length < 2
                  ? "Digite ao menos 2 letras"
                  : "Nenhum produto"
              }
              rightSection={
                productLookupLoading ? <Loader size="xs" /> : undefined
              }
              variant="filled"
              size="sm"
            />
            <Button
              size="sm"
              variant="light"
              onClick={() => {
                setSort(sort === "-data" ? "data" : "-data");
              }}
              leftSection={sort === "-data" ? <IconSortDescending size={16} /> : <IconSortAscending size={16} />}
            >
              Ordenar: {sort === "-data" ? "Mais recentes" : "Mais antigos"}
            </Button>
          </Group>
          <Button
            size="sm"
            variant="default"
            onClick={() => setShowAdvancedFilters((value) => !value)}
            leftSection={<IconFilter size={16} />}
          >
            {showAdvancedFilters ? "Ocultar filtros" : "Filtros avançados"}
          </Button>
        </Group>



        <Collapse in={showAdvancedFilters}>
          <Stack gap="sm">
            <Group align="end" wrap="wrap">
              <Select
                label="Tipo"
                data={MOVEMENT_TYPES}
                clearable
                value={filters.tipo || null}
                onChange={(value) =>
                  setFilterValue("tipo", (value as MovementFilters["tipo"]) ?? "")
                }
                w={160}
                size="sm"
                variant="filled"
              />
              <Select
                label="Natureza"
                data={MOVEMENT_NATURES}
                clearable
                value={filters.natureza || null}
                onChange={(value) =>
                  setFilterValue(
                    "natureza",
                    (value as MovementFilters["natureza"]) ?? "",
                  )
                }
                w={200}
                size="sm"
                variant="filled"
              />
              <DatePickerInput
                label="De"
                value={filters.date_from}
                onChange={(value) =>
                  setFilterValue("date_from", value as Date | null)
                }
                w={170}
              />
              <DatePickerInput
                label="Ate"
                value={filters.date_to}
                onChange={(value) =>
                  setFilterValue("date_to", value as Date | null)
                }
                w={150}
                size="sm"
                variant="filled"
              />
            </Group>
            <Group align="end" wrap="wrap">
              <Select
                label="Origem"
                data={locationOptions}
                clearable
                value={
                  filters.origem_location_id
                    ? String(filters.origem_location_id)
                    : null
                }
                onChange={(value) =>
                  setFilterValue(
                    "origem_location_id",
                    value ? Number(value) : null,
                  )
                }
                w={140}
                size="sm"
                variant="filled"
              />
              <Select
                label="Destino"
                data={locationOptions}
                clearable
                value={
                  filters.destino_location_id
                    ? String(filters.destino_location_id)
                    : null
                }
                onChange={(value) =>
                  setFilterValue(
                    "destino_location_id",
                    value ? Number(value) : null,
                  )
                }
                w={140}
                size="sm"
                variant="filled"
              />
              <Switch
                label="Buscar por ID"
                checked={showProductId}
                onChange={(event) =>
                  setShowProductId(event.currentTarget.checked)
                }
              />
              {showProductId && (
                <TextInput
                  label="Produto ID"
                  value={filters.produto_id}
                  onChange={(event) =>
                    setFilterValue(
                      "produto_id",
                      event.currentTarget.value.replace(/\D/g, ""),
                    )
                  }
                  w={140}
                  size="sm"
                  variant="filled"
                />
              )}
            </Group>
            <Group align="end" wrap="wrap" mt="sm">
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
                w={240}
                size="sm"
                variant="filled"
              />
              <Select
                label="Por pagina"
                data={["10", "20", "50"]}
                value={pageSize}
                onChange={(value) => {
                  if (!value) return;
                  setPageSize(value);
                }}
                w={100}
                size="sm"
                variant="filled"
              />
            </Group>
          </Stack>
        </Collapse>
      </Stack>
    </FilterToolbar>
  );
}
