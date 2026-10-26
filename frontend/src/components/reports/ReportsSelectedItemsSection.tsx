import type { ReactNode } from "react";
import {
  ActionIcon,
  Button,
  Group,
  Loader,
  ScrollArea,
  Stack,
  Table,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import {
  IconArrowDown,
  IconArrowUp,
  IconCheck,
  IconFileTypePdf,
  IconPlus,
  IconSearch,
  IconX,
} from "@tabler/icons-react";

import type { Product } from "../../lib/api";
import { useLocations } from "../../hooks/useLocations";
import ProgressButton from "../ui/ProgressButton";
import ReportShell from "./ReportShell";

type SelectedReportProduct = Pick<
  Product,
  "id" | "nome" | "inventories" | "total_stock"
>;

type Props = {
  /** A última geração deu erro (sem o ✓ no botão). */
  failed?: boolean;
  selectedItems: SelectedReportProduct[];
  selectedIds: Set<number>;
  selectedSearch: string;
  setSelectedSearch: (value: string) => void;
  searchResults: Product[];
  loadingSearch: boolean;
  lookupErrorMessage: string | null;
  addSelectedItem: (product: Product) => void;
  removeSelectedItem: (productId: number) => void;
  moveSelectedItem: (itemId: number, direction: "up" | "down") => void;
  clearSelectedItems: () => void;
  locationLabel: (inventories: Record<number, number>) => string;
  loadingGenerate: boolean;
  generateSelectedReport: () => void;
};

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <Text size="xs" fw={600} c="dimmed" tt="uppercase" lts="0.06em">
      {children}
    </Text>
  );
}

export default function ReportsSelectedItemsSection({
  selectedItems,
  selectedIds,
  selectedSearch,
  setSelectedSearch,
  searchResults,
  loadingSearch,
  lookupErrorMessage,
  addSelectedItem,
  removeSelectedItem,
  moveSelectedItem,
  clearSelectedItems,
  locationLabel,
  loadingGenerate,
  generateSelectedReport,
  failed = false,
}: Props) {
  const { locations } = useLocations();
  const searching = selectedSearch.trim().length >= 2;

  return (
    <ReportShell
      title="Lista personalizada"
      description="Monte uma lista de conferência com os itens que quiser, na ordem que preferir."
      footerHint={`${selectedItems.length} ${selectedItems.length === 1 ? "item" : "itens"} na lista · usa os saldos do momento da geração`}
      action={
        <ProgressButton
          onClick={generateSelectedReport}
          busy={loadingGenerate}
          failed={failed}
          busyLabel="Gerando PDF…"
          doneLabel="PDF pronto"
          disabled={selectedItems.length === 0}
          leftSection={<IconFileTypePdf size={16} stroke={1.5} />}
        >
          Gerar PDF
        </ProgressButton>
      }
    >
      <Stack gap="lg">
        <Stack gap="xs">
          <TextInput
            placeholder="Buscar peça por código ou nome"
            aria-label="Buscar item"
            leftSection={<IconSearch size={16} stroke={1.5} />}
            rightSection={loadingSearch && searching ? <Loader size="xs" /> : undefined}
            value={selectedSearch}
            onChange={(event) => setSelectedSearch(event.currentTarget.value)}
          />

          {searching &&
            (lookupErrorMessage ? (
              <Text size="sm" c="var(--danger)">
                Falha ao buscar produtos: {lookupErrorMessage}
              </Text>
            ) : searchResults.length === 0 && !loadingSearch ? (
              <Text size="sm" c="dimmed">
                Nenhum item encontrado.
              </Text>
            ) : (
              <div className="table-shell">
                <ScrollArea.Autosize mah={220}>
                  {searchResults.map((product) => {
                    const alreadySelected = selectedIds.has(product.id);
                    return (
                      <Group
                        key={product.id}
                        justify="space-between"
                        wrap="nowrap"
                        px="md"
                        py={8}
                        style={{ borderBottom: "1px solid var(--border)" }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <Text size="sm" lineClamp={1}>
                            {product.nome}
                          </Text>
                          <Text size="xs" c="dimmed" className="num">
                            #{product.id} · {product.total_stock} em estoque
                          </Text>
                        </div>
                        <Button
                          size="xs"
                          variant={alreadySelected ? "subtle" : "default"}
                          color={alreadySelected ? "gray" : undefined}
                          leftSection={
                            alreadySelected ? <IconCheck size={14} /> : <IconPlus size={14} />
                          }
                          disabled={alreadySelected}
                          onClick={() => addSelectedItem(product)}
                        >
                          {alreadySelected ? "Na lista" : "Adicionar"}
                        </Button>
                      </Group>
                    );
                  })}
                </ScrollArea.Autosize>
              </div>
            ))}
        </Stack>

        <Stack gap="xs">
          <Group justify="space-between">
            <SectionLabel>Itens do relatório</SectionLabel>
            {selectedItems.length > 0 && (
              <Button variant="subtle" color="gray" size="xs" onClick={clearSelectedItems}>
                Limpar lista
              </Button>
            )}
          </Group>

          {selectedItems.length === 0 ? (
            <Text size="sm" c="dimmed">
              Nenhum item ainda. Busque acima e clique em Adicionar.
            </Text>
          ) : (
            <div className="table-shell">
              <ScrollArea.Autosize mah={320}>
                <Table verticalSpacing="xs">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th w={36}>#</Table.Th>
                      <Table.Th>Produto</Table.Th>
                      {locations.map((loc) => (
                        <Table.Th key={loc.id} w={90} ta="right">
                          {loc.label || loc.name}
                        </Table.Th>
                      ))}
                      <Table.Th w={70} ta="right">
                        Total
                      </Table.Th>
                      <Table.Th w={110} />
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {selectedItems.map((item, index) => (
                      <Table.Tr key={item.id}>
                        <Table.Td c="dimmed" className="num">
                          {index + 1}
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm" lineClamp={1}>
                            {item.nome}
                          </Text>
                          <Text size="xs" c="dimmed">
                            #{item.id} · {locationLabel(item.inventories ?? {})}
                          </Text>
                        </Table.Td>
                        {locations.map((loc) => (
                          <Table.Td key={loc.id} ta="right" className="num">
                            {item.inventories?.[loc.id] ?? 0}
                          </Table.Td>
                        ))}
                        <Table.Td ta="right" fw={600} className="num">
                          {item.total_stock}
                        </Table.Td>
                        <Table.Td>
                          <Group gap={2} justify="flex-end" wrap="nowrap" className="row-actions">
                            <ActionIcon
                              color="gray"
                              onClick={() => moveSelectedItem(item.id, "up")}
                              aria-label={`Subir ${item.nome}`}
                              disabled={index === 0}
                            >
                              <IconArrowUp size={15} stroke={1.5} />
                            </ActionIcon>
                            <ActionIcon
                              color="gray"
                              onClick={() => moveSelectedItem(item.id, "down")}
                              aria-label={`Descer ${item.nome}`}
                              disabled={index === selectedItems.length - 1}
                            >
                              <IconArrowDown size={15} stroke={1.5} />
                            </ActionIcon>
                            <Tooltip label="Remover da lista">
                              <ActionIcon
                                color="gray"
                                className="action-danger"
                                onClick={() => removeSelectedItem(item.id)}
                                aria-label={`Remover ${item.nome}`}
                              >
                                <IconX size={15} stroke={1.5} />
                              </ActionIcon>
                            </Tooltip>
                          </Group>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </ScrollArea.Autosize>
            </div>
          )}
        </Stack>
      </Stack>
    </ReportShell>
  );
}
