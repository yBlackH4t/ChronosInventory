import {
  ActionIcon,
  Button,
  Card,
  Group,
  Loader,
  ScrollArea,
  Stack,
  Table,
  Text,
  TextInput,
  Badge,
  ThemeIcon,
} from "@mantine/core";
import {
  IconArrowDown,
  IconArrowUp,
  IconPlus,
  IconTrash,
  IconListCheck,
} from "@tabler/icons-react";

import type { Product } from "../../lib/api";
import { useLocations } from "../../hooks/useLocations";

type SelectedReportProduct = Pick<
  Product,
  "id" | "nome" | "inventories" | "total_stock"
>;

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
  locationLabel: (inventories: Record<number, number>) => string;
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
  const { locations } = useLocations();

  return (
    <Card 
      withBorder 
      shadow="sm"
      p="xl"
      style={{
        background: 'rgba(255, 255, 255, 0.03)',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: 'var(--mantine-radius-xl)',
        overflow: 'hidden'
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "-50px",
          right: "-50px",
          width: "150px",
          height: "150px",
          background: "radial-gradient(circle, rgba(156, 39, 176, 0.15) 0%, rgba(0,0,0,0) 70%)",
          borderRadius: "50%",
          zIndex: 0,
        }}
      />

      <Stack gap="lg" style={{ position: 'relative', zIndex: 1 }}>
        <Group justify="space-between" align="flex-start">
          <Group>
            <ThemeIcon size={48} radius="md" variant="light" color="grape">
              <IconListCheck size={24} />
            </ThemeIcon>
            <div>
              <Text fw={700} size="lg" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Relatório de Itens Selecionados
              </Text>
              <Text size="sm" c="dimmed">
                Monte sua própria lista de conferência
              </Text>
            </div>
          </Group>
          <Badge variant="gradient" gradient={{ from: 'grape', to: 'pink' }}>
            Selecionados: {selectedItems.length}
          </Badge>
        </Group>

        <TextInput
          label="Buscar item"
          placeholder="Digite codigo ou nome da peca"
          value={selectedSearch}
          onChange={(event) => setSelectedSearch(event.currentTarget.value)}
          size="md"
          variant="filled"
        />

        <Card 
          withBorder 
          radius="md" 
          p="md"
          style={{ background: 'rgba(0, 0, 0, 0.02)' }}
        >
          <Stack gap="xs">
            <Group justify="space-between">
              <Text fw={500}>Resultados da busca</Text>
              {loadingSearch && selectedSearch.trim().length >= 2 ? (
                <Loader size="xs" color="grape" />
              ) : null}
            </Group>

            {selectedSearch.trim().length < 2 ? (
              <Text size="sm" c="dimmed">
                Digite ao menos 2 letras para localizar produtos e adicionar ao
                relatorio.
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
                <Table striped highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>ID</Table.Th>
                      <Table.Th>Produto</Table.Th>
                      {locations.map((loc) => (
                        <Table.Th key={loc.id}>{loc.name}</Table.Th>
                      ))}
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
                          {locations.map((loc) => (
                            <Table.Td key={loc.id}>
                              {product.inventories?.[loc.id] ?? 0}
                            </Table.Td>
                          ))}
                          <Table.Td>{product.total_stock}</Table.Td>
                          <Table.Td>
                            <Button
                              size="xs"
                              color="grape"
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

        <Card 
          withBorder 
          radius="md" 
          p="md"
          style={{ background: 'rgba(0, 0, 0, 0.02)' }}
        >
          <Stack gap="xs">
            <Group justify="space-between">
              <Text fw={500}>Itens escolhidos para o relatorio</Text>
              <Button
                variant="subtle"
                color="red"
                size="xs"
                onClick={clearSelectedItems}
                disabled={selectedItems.length === 0}
              >
                Limpar selecionados
              </Button>
            </Group>

            {selectedItems.length === 0 ? (
              <Text size="sm" c="dimmed">
                Nenhum item selecionado ainda. Busque acima e clique em
                Selecionar.
              </Text>
            ) : (
              <ScrollArea.Autosize mah={260} offsetScrollbars>
                <Table striped highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>ID</Table.Th>
                      <Table.Th>Produto</Table.Th>
                      {locations.map((loc) => (
                        <Table.Th key={loc.id}>{loc.name}</Table.Th>
                      ))}
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
                        {locations.map((loc) => (
                          <Table.Td key={loc.id}>
                            {item.inventories?.[loc.id] ?? 0}
                          </Table.Td>
                        ))}
                        <Table.Td>{item.total_stock}</Table.Td>
                        <Table.Td>
                          {locationLabel(item.inventories ?? {})}
                        </Table.Td>
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

        <Group justify="space-between" align="center" mt="sm">
          <Text size="sm" c="dimmed">
            O PDF final sempre usa os saldos atuais do sistema no momento da
            geracao.
          </Text>
          <Button
            onClick={generateSelectedReport}
            loading={loadingGenerate}
            disabled={selectedItems.length === 0}
            variant="gradient"
            gradient={{ from: 'grape', to: 'pink' }}
            size="md"
            radius="md"
          >
            Gerar Relatório dos Selecionados
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}
