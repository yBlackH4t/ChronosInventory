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

import { IconSearch } from "@tabler/icons-react";

import EmptyState from "../ui/EmptyState";
import Panel from "../ui/Panel";
import StatTile from "../ui/StatTile";
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
  { value: "STOCK", label: "Diferença de estoque" },
  { value: "ONLY_LEFT", label: "Só na base A" },
  { value: "ONLY_RIGHT", label: "Só na base B" },
  { value: "NAME", label: "Nome divergente" },
  { value: "ACTIVE", label: "Ativo/inativo divergente" },
  { value: "IDENTICAL", label: "Somente iguais" },
];

const STATUS_META: Record<string, { label: string; color: string }> = {
  IDENTICAL: { label: "Igual", color: "gray" },
  STOCK: { label: "Estoque", color: "blue" },
  ONLY_LEFT: { label: "Só A", color: "orange" },
  ONLY_RIGHT: { label: "Só B", color: "teal" },
  NAME: { label: "Nome", color: "violet" },
  ACTIVE: { label: "Status", color: "yellow" },
};

function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size < 1024) return `${size || 0} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
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
      <Card>
        <EmptyState
          message="Nenhuma comparação carregada"
          description="Publique um snapshot nesta máquina e compare com outro computador, ou compare dois arquivos manualmente."
        />
      </Card>
    );
  }

  const summaryTiles: { key: CompareFilter; label: string; value: number }[] = [
    { key: "DIFFERENT", label: "Divergentes", value: compareResult.summary.divergent_items },
    { key: "STOCK", label: "Diferença de estoque", value: compareResult.summary.stock_mismatch_items },
    { key: "ONLY_LEFT", label: `Só em ${compareResult.left.label}`, value: compareResult.summary.only_left_items },
    { key: "ONLY_RIGHT", label: `Só em ${compareResult.right.label}`, value: compareResult.summary.only_right_items },
  ];

  const sides = [compareResult.left, compareResult.right];

  return (
    <Stack gap="md">
      <div className="stat-grid">
        {summaryTiles.map((tile) => (
          <StatTile
            key={tile.key}
            label={tile.label}
            value={tile.value.toLocaleString("pt-BR")}
            active={filter === tile.key}
            onClick={() => onFilterChange(tile.key)}
          />
        ))}
      </div>

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        {sides.map((side) => (
          <Panel key={side.label} title={side.label} subtitle={<span className="mono">{side.path}</span>}>
            <Group gap="xl" wrap="wrap">
              {[
                ["Itens", side.total_items],
                ["Ativos", side.active_items],
                ["Com estoque", side.with_stock_items],
                ["Tamanho", formatBytes(side.file_size)],
              ].map(([label, value]) => (
                <div key={String(label)}>
                  <Text size="xs" c="dimmed">
                    {label}
                  </Text>
                  <Text size="sm" fw={600} className="num">
                    {value}
                  </Text>
                </div>
              ))}
            </Group>
          </Panel>
        ))}
      </SimpleGrid>

      <Card p={0} style={{ overflow: "hidden" }}>
        <Group
          gap="sm"
          wrap="wrap"
          px="lg"
          py="sm"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <TextInput
            aria-label="Buscar item"
            placeholder="Buscar por ID ou nome"
            leftSection={<IconSearch size={16} stroke={1.5} />}
            value={search}
            onChange={(event) => onSearchChange(event.currentTarget.value)}
            style={{ flex: 1, minWidth: 220 }}
          />
          <Select
            aria-label="Filtro"
            data={FILTER_OPTIONS}
            value={filter}
            onChange={(value) =>
              onFilterChange((value as CompareFilter) || "DIFFERENT")
            }
            allowDeselect={false}
            w={220}
          />
          <Button variant="subtle" color="gray" onClick={onResetFilters}>
            Limpar
          </Button>
        </Group>

        <Table.ScrollContainer minWidth={980}>
          <Table verticalSpacing="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Produto</Table.Th>
                <Table.Th w={130} ta="right">
                  {compareResult.left.label}
                </Table.Th>
                <Table.Th w={130} ta="right">
                  {compareResult.right.label}
                </Table.Th>
                <Table.Th w={100} ta="right">
                  Diferença
                </Table.Th>
                <Table.Th w={170}>Status A / B</Table.Th>
                <Table.Th w={220}>Análise</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((row) => (
                <Table.Tr key={row.product_id}>
                  <Table.Td>
                    <Text size="sm" fw={500} lineClamp={1}>
                      {row.display_name || "—"}
                    </Text>
                    <Text size="xs" c="dimmed">
                      <span className="mono">#{row.product_id}</span>
                      {row.left_name &&
                        row.right_name &&
                        row.left_name !== row.right_name &&
                        ` · A: ${row.left_name} · B: ${row.right_name}`}
                    </Text>
                  </Table.Td>
                  <Table.Td ta="right" className="num">
                    {row.left_stock ?? "—"}
                  </Table.Td>
                  <Table.Td ta="right" className="num">
                    {row.right_stock ?? "—"}
                  </Table.Td>
                  <Table.Td ta="right">
                    <Text
                      size="sm"
                      fw={row.diff_stock === 0 ? 400 : 600}
                      className="num"
                      c={row.diff_stock === 0 ? "var(--text-subtle)" : undefined}
                    >
                      {row.diff_stock > 0 ? `+${row.diff_stock}` : row.diff_stock}
                    </Text>
                  </Table.Td>
                  <Table.Td c="dimmed">
                    {boolLabel(row.left_ativo)} / {boolLabel(row.right_ativo)}
                  </Table.Td>
                  <Table.Td>
                    <Group gap={4}>
                      {row.statuses.map((status) => (
                        <Badge
                          key={`${row.product_id}-${status}`}
                          color={STATUS_META[status]?.color || "gray"}
                          variant="light"
                          size="sm"
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
                  <Table.Td colSpan={6} style={{ borderBottom: 0 }}>
                    <EmptyState message="Nenhum item para o filtro atual" />
                  </Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Card>
    </Stack>
  );
}
