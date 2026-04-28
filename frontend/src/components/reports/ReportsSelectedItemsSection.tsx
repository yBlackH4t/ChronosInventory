import { ActionIcon, Button, Card, Group, Loader, ScrollArea, Stack, Table, Text, TextInput, Badge } from "@mantine/core";
import { IconArrowDown, IconArrowUp, IconPlus, IconTrash } from "@tabler/icons-react";

import type { Product } from "../../lib/api";

type SelectedReportProduct = Pick<Product, "id" | "nome" | "qtd_canoas" | "qtd_pf" | "total_stock">;

type Props = {
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
  locationLabel: (qtdCanoas: number, qtdPf: number) => string;
  loadingGenerate: boolean;
  generateSelectedReport: () => void;
};

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
}: Props) {
  return (
    <Card withBorder>
      <Stack gap="md">
        <Group justify="space-between" align="flex-start">
          <Stack gap={4}>
            <Text fw={600}>Relatorio de itens selecionados</Text>
            <Text size="sm" c="dimmed">
              Busque os itens, selecione os desejados e gere um PDF mostrando quantidade em Canoas, PF, total e onde tem saldo.
            </Text>
          </Stack>
          <Badge variant="outline" color="grape">
            Selecionados: {selectedItems.length}
          </Badge>
        </Group>

        <TextInput
          label="Buscar item"
          placeholder="Digite codigo ou nome da peca"
          value={selectedSearch}
          onChange={(event) => setSelectedSearch(event.currentTarget.value)}
        />

        <Card withBorder radius="md" p="sm">
          <Stack gap="xs">
            <Group justify="space-between">
              <Text fw={500}>Resultados da busca</Text>
              {loadingSearch && selectedSearch.trim().length >= 2 ? <Loader size="xs" /> : null}
            </Group>

            {selectedSearch.trim().length < 2 ? (
              <Text size="sm" c="dimmed">
                Digite ao menos 2 letras para localizar produtos e adicionar ao relatorio.
              </Text>
            ) : lookupErrorMessage ? (
              <Text size="sm" c="red">
                Falha ao buscar produtos: {lookupErrorMessage}
              </Text>
            ) : searchResults.length === 0 ? (
              <Text size="sm" c="dimmed">
                Nenhum item encontrado para essa busca.
              </Text>
            ) : (
              <ScrollArea.Autosize mah={240} offsetScrollbars>
                <Table striped highlightOnHover withTableBorder>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>ID</Table.Th>
                      <Table.Th>Produto</Table.Th>
                      <Table.Th>Canoas</Table.Th>
                      <Table.Th>PF</Table.Th>
                      <Table.Th>Total</Table.Th>
                      <Table.Th>Acoes</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {searchResults.map((product) => {
                      const alreadySelected = selectedIds.has(product.id);
                      return (
                        <Table.Tr key={product.id}>
                          <Table.Td>{product.id}</Table.Td>
                          <Table.Td>{product.nome}</Table.Td>
                          <Table.Td>{product.qtd_canoas}</Table.Td>
                          <Table.Td>{product.qtd_pf}</Table.Td>
                          <Table.Td>{product.total_stock}</Table.Td>
                          <Table.Td>
                            <Button
                              size="xs"
                              variant={alreadySelected ? "light" : "filled"}
                              leftSection={<IconPlus size={14} />}
                              disabled={alreadySelected}
                              onClick={() => addSelectedItem(product)}
                            >
                              {alreadySelected ? "Selecionado" : "Selecionar"}
                            </Button>
                          </Table.Td>
                        </Table.Tr>
                      );
                    })}
                  </Table.Tbody>
                </Table>
              </ScrollArea.Autosize>
            )}
          </Stack>
        </Card>

        <Card withBorder radius="md" p="sm">
          <Stack gap="xs">
            <Group justify="space-between">
              <Text fw={500}>Itens escolhidos para o relatorio</Text>
              <Button variant="subtle" size="xs" onClick={clearSelectedItems} disabled={selectedItems.length === 0}>
                Limpar selecionados
              </Button>
            </Group>
            <Text size="sm" c="dimmed">
              Use os botoes de subir e descer para ajustar a ordem exata em que os itens vao aparecer no PDF.
            </Text>

            {selectedItems.length === 0 ? (
              <Text size="sm" c="dimmed">
                Nenhum item selecionado ainda. Busque acima e clique em Selecionar.
              </Text>
            ) : (
              <ScrollArea.Autosize mah={260} offsetScrollbars>
                <Table striped highlightOnHover withTableBorder>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>ID</Table.Th>
                      <Table.Th>Produto</Table.Th>
                      <Table.Th>Canoas</Table.Th>
                      <Table.Th>PF</Table.Th>
                      <Table.Th>Total</Table.Th>
                      <Table.Th>Onde tem</Table.Th>
                      <Table.Th>Ordem</Table.Th>
                      <Table.Th>Acoes</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {selectedItems.map((item, index) => (
                      <Table.Tr key={item.id}>
                        <Table.Td>{item.id}</Table.Td>
                        <Table.Td>{item.nome}</Table.Td>
                        <Table.Td>{item.qtd_canoas}</Table.Td>
                        <Table.Td>{item.qtd_pf}</Table.Td>
                        <Table.Td>{item.total_stock}</Table.Td>
                        <Table.Td>{locationLabel(item.qtd_canoas, item.qtd_pf)}</Table.Td>
                        <Table.Td>
                          <Group gap={4} wrap="nowrap">
                            <ActionIcon
                              variant="light"
                              color="gray"
                              onClick={() => moveSelectedItem(item.id, "up")}
                              aria-label={`Subir ${item.nome}`}
                              disabled={index === 0}
                            >
                              <IconArrowUp size={16} />
                            </ActionIcon>
                            <ActionIcon
                              variant="light"
                              color="gray"
                              onClick={() => moveSelectedItem(item.id, "down")}
                              aria-label={`Descer ${item.nome}`}
                              disabled={index === selectedItems.length - 1}
                            >
                              <IconArrowDown size={16} />
                            </ActionIcon>
                          </Group>
                        </Table.Td>
                        <Table.Td>
                          <ActionIcon
                            color="red"
                            variant="light"
                            onClick={() => removeSelectedItem(item.id)}
                            aria-label={`Remover ${item.nome}`}
                          >
                            <IconTrash size={16} />
                          </ActionIcon>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </ScrollArea.Autosize>
            )}
          </Stack>
        </Card>

        <Group justify="space-between" align="center">
          <Text size="sm" c="dimmed">
            O PDF final sempre usa os saldos atuais do sistema no momento da geracao.
          </Text>
          <Button onClick={generateSelectedReport} loading={loadingGenerate} disabled={selectedItems.length === 0}>
            Gerar relatorio dos selecionados
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}
