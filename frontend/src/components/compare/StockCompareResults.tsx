import {
  Badge,
  Button,
  Card,
  Group,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
} from "@mantine/core";

import DataTable from "../ui/DataTable";
import EmptyState from "../ui/EmptyState";
import FilterToolbar from "../ui/FilterToolbar";
import type { StockCompareOut, StockCompareRowOut } from "../../lib/api";

type CompareFilter =
  | "DIFFERENT"
  | "ALL"
  | "STOCK"
  | "ONLY_LEFT"
  | "ONLY_RIGHT"
  | "NAME"
  | "ACTIVE"
  | "IDENTICAL";

type Props = {
  compareResult: StockCompareOut | null;
  rows: StockCompareRowOut[];
  filter: CompareFilter;
  search: string;
  onFilterChange: (value: CompareFilter) => void;
  onSearchChange: (value: string) => void;
  onResetFilters: () => void;
};

const FILTER_OPTIONS: { value: CompareFilter; label: string }[] = [
  { value: "DIFFERENT", label: "Somente divergentes" },
  { value: "ALL", label: "Todos" },
  { value: "STOCK", label: "Diferenca de Estoque" },
  { value: "ONLY_LEFT", label: "So na base A" },
  { value: "ONLY_RIGHT", label: "So na base B" },
  { value: "NAME", label: "Nome divergente" },
  { value: "ACTIVE", label: "Ativo/inativo divergente" },
  { value: "IDENTICAL", label: "Somente iguais" },
];

const STATUS_META: Record<string, { label: string; color: string }> = {
  IDENTICAL: { label: "Igual", color: "gray" },
  STOCK: { label: "Estoque", color: "blue" },
  ONLY_LEFT: { label: "So A", color: "red" },
  ONLY_RIGHT: { label: "So B", color: "green" },
  NAME: { label: "Nome", color: "violet" },
  ACTIVE: { label: "Status", color: "yellow" },
};

function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size < 1024) return `${size || 0} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

function stockBadgeColor(value: number): string {
  if (value === 0) return "gray";
  return value > 0 ? "green" : "red";
}

function boolLabel(value: boolean | null | undefined): string {
  if (value === null || value === undefined) return "-";
  return value ? "Ativo" : "Inativo";
}

export default function StockCompareResults({
  compareResult,
  rows,
  filter,
  search,
  onFilterChange,
  onSearchChange,
  onResetFilters,
}: Props) {
  if (!compareResult) {
    return (
      <Card withBorder>
        <EmptyState message="Publique um snapshot nesta maquina ou compare duas bases manuais para iniciar a analise." />
      </Card>
    );
  }

  return (
    <>
      <SimpleGrid cols={{ base: 2, md: 5 }}>
        <Card
          withBorder
          p="sm"
          style={{ cursor: "pointer" }}
          onClick={() => onFilterChange("DIFFERENT")}
        >
          <Text size="xs" c="dimmed">
            Divergentes
          </Text>
          <Text fw={700} size="xl" c="red">
            {compareResult.summary.divergent_items}
          </Text>
        </Card>
        <Card
          withBorder
          p="sm"
          style={{ cursor: "pointer" }}
          onClick={() => onFilterChange("STOCK")}
        >
          <Text size="xs" c="dimmed">
            Diferencas de Estoque
          </Text>
          <Text fw={700} size="xl" c="blue">
            {compareResult.summary.stock_mismatch_items}
          </Text>
        </Card>
        <Card
          withBorder
          p="sm"
          style={{ cursor: "pointer" }}
          onClick={() => onFilterChange("ONLY_LEFT")}
        >
          <Text size="xs" c="dimmed">
            So na base A
          </Text>
          <Text fw={700} size="xl">
            {compareResult.summary.only_left_items}
          </Text>
        </Card>
        <Card
          withBorder
          p="sm"
          style={{ cursor: "pointer" }}
          onClick={() => onFilterChange("ONLY_RIGHT")}
        >
          <Text size="xs" c="dimmed">
            So na base B
          </Text>
          <Text fw={700} size="xl">
            {compareResult.summary.only_right_items}
          </Text>
        </Card>
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <Card withBorder>
          <Stack gap={4}>
            <Text fw={600}>{compareResult.left.label}</Text>
            <Text size="sm" c="dimmed">
              {compareResult.left.path}
            </Text>
            <Text size="sm">Itens: {compareResult.left.total_items}</Text>
            <Text size="sm">Ativos: {compareResult.left.active_items}</Text>
            <Text size="sm">
              Com estoque: {compareResult.left.with_stock_items}
            </Text>
            <Text size="sm">
              Tamanho: {formatBytes(compareResult.left.file_size)}
            </Text>
          </Stack>
        </Card>
        <Card withBorder>
          <Stack gap={4}>
            <Text fw={600}>{compareResult.right.label}</Text>
            <Text size="sm" c="dimmed">
              {compareResult.right.path}
            </Text>
            <Text size="sm">Itens: {compareResult.right.total_items}</Text>
            <Text size="sm">Ativos: {compareResult.right.active_items}</Text>
            <Text size="sm">
              Com estoque: {compareResult.right.with_stock_items}
            </Text>
            <Text size="sm">
              Tamanho: {formatBytes(compareResult.right.file_size)}
            </Text>
          </Stack>
        </Card>
      </SimpleGrid>

      <FilterToolbar>
        <Group align="end" wrap="wrap">
          <Select
            label="Filtro"
            data={FILTER_OPTIONS}
            value={filter}
            onChange={(value) =>
              onFilterChange((value as CompareFilter) || "DIFFERENT")
            }
            allowDeselect={false}
            w={240}
          />
          <TextInput
            label="Buscar item"
            placeholder="ID ou nome"
            value={search}
            onChange={(event) => onSearchChange(event.currentTarget.value)}
            w={280}
          />
          <Button variant="subtle" onClick={onResetFilters}>
            Limpar filtros
          </Button>
        </Group>
      </FilterToolbar>

      <DataTable minWidth={1500}>
        <Table striped highlightOnHover withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>ID</Table.Th>
              <Table.Th>Produto</Table.Th>
              <Table.Th>{compareResult.left.label} Estoque Total</Table.Th>
              <Table.Th>{compareResult.right.label} Estoque Total</Table.Th>
              <Table.Th>Dif. Estoque</Table.Th>
              <Table.Th>{compareResult.left.label} status</Table.Th>
              <Table.Th>{compareResult.right.label} status</Table.Th>
              <Table.Th>Analise</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((row) => (
              <Table.Tr key={row.product_id}>
                <Table.Td>{row.product_id}</Table.Td>
                <Table.Td>
                  <Stack gap={2}>
                    <Text fw={600}>{row.display_name || "-"}</Text>
                    {row.left_name &&
                      row.right_name &&
                      row.left_name !== row.right_name && (
                        <Text size="xs" c="dimmed">
                          A: {row.left_name} | B: {row.right_name}
                        </Text>
                      )}
                  </Stack>
                </Table.Td>
                <Table.Td>{row.left_stock ?? "-"}</Table.Td>
                <Table.Td>{row.right_stock ?? "-"}</Table.Td>
                <Table.Td>
                  <Badge
                    color={stockBadgeColor(row.diff_stock)}
                    variant="light"
                  >
                    {row.diff_stock}
                  </Badge>
                </Table.Td>
                <Table.Td>{boolLabel(row.left_ativo)}</Table.Td>
                <Table.Td>{boolLabel(row.right_ativo)}</Table.Td>
                <Table.Td>
                  <Group gap={6}>
                    {row.statuses.map((status) => (
                      <Badge
                        key={`${row.product_id}-${status}`}
                        color={STATUS_META[status]?.color || "gray"}
                        variant="light"
                      >
                        {STATUS_META[status]?.label || status}
                      </Badge>
                    ))}
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
            {rows.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={11}>
                  <EmptyState message="Nenhum item encontrado para o filtro atual." />
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </DataTable>
    </>
  );
}
