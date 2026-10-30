import {
  ActionIcon,
  Badge,
  Button,
  Divider,
  Group,
  Loader,
  Popover,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { useLocalStorage } from "@mantine/hooks";
import {
  IconAdjustmentsHorizontal,
  IconFileText,
  IconSearch,
  IconX,
} from "@tabler/icons-react";

import { useLocations } from "../../hooks/useLocations";
import {
  MOVEMENT_NATURES,
  MOVEMENT_PAGE_SIZES,
  MOVEMENTS_VIEW_KEY,
  TABLE_VIEW_MODE_OPTIONS,
  type MovementsView,
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
  documentoSearch: string;
  onDocumentoSearchChange: (value: string) => void;
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
  showReversed: boolean;
  setShowReversed: (value: boolean) => void;
  tablePreferences: MovementsTablePreferences;
  setTablePreferences: (
    updater: (current: MovementsTablePreferences) => MovementsTablePreferences,
  ) => void;
  activeViewCount: number;
  onClearFilters: () => void;
  onResetView: () => void;
};

const TYPE_PILLS = [
  { value: "", label: "Todos" },
  { value: "ENTRADA", label: "Entradas" },
  { value: "SAIDA", label: "Saídas" },
  { value: "TRANSFERENCIA", label: "Transferências" },
];

// Nested dropdowns must stay inside the popover, or a click on them closes it.
const IN_POPOVER = { withinPortal: false } as const;

export default function MovementsFiltersSection({
  productOptions,
  productLookupLoading,
  productSearch,
  onProductSearchChange,
  documentoSearch,
  onDocumentoSearchChange,
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
  showReversed,
  setShowReversed,
  tablePreferences,
  setTablePreferences,
  activeViewCount,
  onClearFilters,
  onResetView,
}: Props) {
  const { locations, branchColumns } = useLocations();
  const locationOptions = locations.map((loc) => ({
    value: String(loc.id),
    label: loc.label || loc.name,
  }));
  const [view, setView] = useLocalStorage<MovementsView>({
    key: MOVEMENTS_VIEW_KEY,
    defaultValue: "DIA",
  });

  // Tudo que não é busca fica no botão Filtros; o número diz quantos estão ligados.
  const filterCount =
    [
      filters.tipo,
      filters.natureza,
      filters.origem_location_id,
      filters.destino_location_id,
      filters.date_from,
      filters.date_to,
    ].filter(Boolean).length +
    Number(showReversed) +
    Number(sort !== "-data");
  const typeLabel = TYPE_PILLS.find((pill) => pill.value === (filters.tipo || ""))?.label;

  return (
    <div className="toolbar-row">
      <Select
        aria-label="Filtrar por produto"
        placeholder="Filtrar por produto…"
        data={productOptions}
        searchable
        clearable
        size="md"
        leftSection={<IconSearch size={18} stroke={1.5} />}
        style={{ flex: 1, minWidth: 260 }}
        value={filters.produto_id || null}
        onChange={(value) => setFilterValue("produto_id", value ?? "")}
        searchValue={productSearch}
        onSearchChange={onProductSearchChange}
        nothingFoundMessage={
          productSearch.trim().length < 2
            ? "Digite ao menos 2 letras"
            : "Nenhum produto"
        }
        rightSection={productLookupLoading ? <Loader size="xs" /> : undefined}
      />

      <TextInput
        aria-label="Buscar por documento"
        placeholder="Nº da nota"
        size="md"
        leftSection={<IconFileText size={18} stroke={1.5} />}
        style={{ width: 180 }}
        value={documentoSearch}
        onChange={(event) => onDocumentoSearchChange(event.currentTarget.value)}
        rightSection={
          documentoSearch ? (
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              aria-label="Limpar busca por documento"
              onClick={() => onDocumentoSearchChange("")}
            >
              <IconX size={14} />
            </ActionIcon>
          ) : undefined
        }
      />

      <Popover
        position="bottom-end"
        width={360}
        opened={showAdvancedFilters}
        onChange={setShowAdvancedFilters}
        trapFocus={false}
      >
        <Popover.Target>
          <Button
            variant="default"
            onClick={() => setShowAdvancedFilters((value) => !value)}
            leftSection={<IconAdjustmentsHorizontal size={16} stroke={1.5} />}
            rightSection={
              filterCount > 0 ? (
                <Badge size="xs" circle variant="filled">
                  {filterCount}
                </Badge>
              ) : undefined
            }
          >
            Filtros
          </Button>
        </Popover.Target>
        <Popover.Dropdown>
          <Stack gap="sm">
            <Stack gap={4}>
              <Text size="sm" fw={500}>
                Tipo
              </Text>
              <SegmentedControl
                fullWidth
                value={filters.tipo || ""}
                onChange={(value) =>
                  setFilterValue("tipo", value as MovementFilters["tipo"])
                }
                data={TYPE_PILLS}
              />
            </Stack>
            <SimpleGrid cols={2} spacing="sm">
              <Stack gap={4}>
                <Text size="sm" fw={500}>
                  Ordem
                </Text>
                <SegmentedControl
                  fullWidth
                  value={sort === "-data" ? "-data" : "data"}
                  onChange={setSort}
                  data={[
                    { value: "-data", label: "Recentes" },
                    { value: "data", label: "Antigas" },
                  ]}
                />
              </Stack>
              <Stack gap={4}>
                <Text size="sm" fw={500}>
                  Mostrar
                </Text>
                <SegmentedControl
                  fullWidth
                  value={view}
                  onChange={(value) => setView(value as MovementsView)}
                  data={[
                    { value: "DIA", label: "Por dia" },
                    { value: "TABELA", label: "Tabela" },
                  ]}
                />
              </Stack>
            </SimpleGrid>
            <Tooltip
              multiline
              w={260}
              label="Um lançamento errado e o estorno que o desfez ficam fora da lista. Eles continuam guardados e o saldo não muda."
            >
              <Switch
                size="sm"
                label="Mostrar estornados"
                checked={showReversed}
                onChange={(event) => setShowReversed(event.currentTarget.checked)}
              />
            </Tooltip>
            <Divider />
            <Select
              label="Natureza"
              placeholder="Todas"
              data={MOVEMENT_NATURES}
              clearable
              value={filters.natureza || null}
              onChange={(value) =>
                setFilterValue(
                  "natureza",
                  (value as MovementFilters["natureza"]) ?? "",
                )
              }
              comboboxProps={IN_POPOVER}
            />
            <SimpleGrid cols={2} spacing="sm">
              <DatePickerInput
                label="De"
                placeholder="Início"
                valueFormat="DD/MM/YYYY"
                clearable
                value={filters.date_from}
                onChange={(value) =>
                  setFilterValue("date_from", value as Date | null)
                }
                popoverProps={IN_POPOVER}
              />
              <DatePickerInput
                label="Até"
                placeholder="Fim"
                valueFormat="DD/MM/YYYY"
                clearable
                value={filters.date_to}
                onChange={(value) =>
                  setFilterValue("date_to", value as Date | null)
                }
                popoverProps={IN_POPOVER}
              />
            </SimpleGrid>
            {branchColumns.length > 0 && (
              <SimpleGrid cols={2} spacing="sm">
                <Select
                  label="Origem"
                  placeholder="Qualquer"
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
                  comboboxProps={IN_POPOVER}
                />
                <Select
                  label="Destino"
                  placeholder="Qualquer"
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
                  comboboxProps={IN_POPOVER}
                />
              </SimpleGrid>
            )}
            <Group justify="space-between" align="center" wrap="nowrap">
              <Switch
                size="sm"
                label="Filtrar por ID do produto"
                checked={showProductId}
                onChange={(event) =>
                  setShowProductId(event.currentTarget.checked)
                }
              />
              {showProductId && (
                <TextInput
                  aria-label="ID do produto"
                  placeholder="ID"
                  value={filters.produto_id}
                  onChange={(event) =>
                    setFilterValue(
                      "produto_id",
                      event.currentTarget.value.replace(/\D/g, ""),
                    )
                  }
                  w={100}
                />
              )}
            </Group>

            <Divider />
            <Text size="xs" fw={600} c="dimmed" tt="uppercase" lts="0.06em">
              Exibição
            </Text>
            <SimpleGrid cols={2} spacing="sm">
              <Select
                label="Linhas"
                data={TABLE_VIEW_MODE_OPTIONS}
                value={tablePreferences.viewMode}
                allowDeselect={false}
                onChange={(value) =>
                  setTablePreferences((current) => ({
                    ...current,
                    viewMode: (value as MovementTableViewMode) || "AUTO",
                  }))
                }
                comboboxProps={IN_POPOVER}
              />
              <Select
                label="Por página"
                data={MOVEMENT_PAGE_SIZES}
                value={pageSize}
                allowDeselect={false}
                onChange={(value) => {
                  if (!value) return;
                  setPageSize(value);
                }}
                comboboxProps={IN_POPOVER}
              />
            </SimpleGrid>
            <Group justify="space-between" mt={4}>
              <Button variant="subtle" color="gray" size="xs" onClick={onResetView}>
                Restaurar padrão
              </Button>
              <Button size="xs" variant="default" onClick={() => setShowAdvancedFilters(false)}>
                Fechar
              </Button>
            </Group>
          </Stack>
        </Popover.Dropdown>
      </Popover>

      {typeLabel && filters.tipo ? (
        <Badge
          size="lg"
          variant="light"
          rightSection={
            <ActionIcon
              size="xs"
              variant="transparent"
              color="gray"
              aria-label="Mostrar todos os tipos"
              onClick={() => setFilterValue("tipo", "" as MovementFilters["tipo"])}
            >
              <IconX size={12} />
            </ActionIcon>
          }
        >
          {typeLabel}
        </Badge>
      ) : null}

      {activeViewCount > 0 && (
        <Button
          variant="subtle"
          color="gray"
          leftSection={<IconX size={14} />}
          onClick={onClearFilters}
        >
          Limpar
        </Button>
      )}
    </div>
  );
}
