import { useState, useEffect } from "react";
import {
  Modal,
  Button,
  Table,
  Group,
  Text,
  Select,
  NumberInput,
  ActionIcon,
  Stack,
  Box,
  TextInput,
  Autocomplete,
} from "@mantine/core";
import { IconTrash, IconSearch } from "@tabler/icons-react";
import { useScanner } from "../../lib/useScanner";
import { api } from "../../lib/apiClient";
import type { Product, MovementBatchCreate } from "../../lib/api";
import { notifyError, notifySuccess } from "../../lib/notify";
import { useLocations } from "../../hooks/useLocations";

type StagedItem = {
  product: Product;
  quantidade: number;
};

type BatchMovementModalProps = {
  opened: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

export default function BatchMovementModal({
  opened,
  onClose,
  onSuccess,
}: BatchMovementModalProps) {
  const [items, setItems] = useState<StagedItem[]>([]);
  const [tipo, setTipo] = useState<MovementBatchCreate["tipo"]>("ENTRADA");
  const [natureza, setNatureza] = useState<NonNullable<MovementBatchCreate["natureza"]>>("OPERACAO_NORMAL");
  const [locationId, setLocationId] = useState<string | null>(null); // For ENTRADA/SAIDA
  const [origemLocationId, setOrigemLocationId] = useState<string | null>(null); // For TRANSFERENCIA
  const [destinoLocationId, setDestinoLocationId] = useState<string | null>(null); // For TRANSFERENCIA
  const [documento, setDocumento] = useState("");
  const [observacao, setObservacao] = useState("");
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{value: string, label: string, product: Product}[]>([]);

  const { locations } = useLocations();
  const { listen } = useScanner();

  useEffect(() => {
    if (!opened) return;
    return listen(async (code) => {
      try {
        let product: Product | null = null;
        const upper = code.toUpperCase();
        if (upper.startsWith("CI-")) {
          const id = parseInt(upper.replace("CI-", ""), 10);
          const res = await api.getProduct(id);
          product = res.data;
        } else {
          // Busca por query
          const res = await api.listProducts({ query: code, page_size: 1 });
          if (res.data && res.data.length > 0) {
            product = res.data[0];
          }
        }

        if (!product) {
          notifyError(new Error(`Produto não encontrado para o código: ${code}`));
          return;
        }

        addProductToBatch(product);
        notifySuccess(`${product.nome} adicionado ao lote.`);
      } catch (e) {
        notifyError(e, "Erro ao processar leitura do código.");
      }
    });
  }, [opened, listen]);

  const addProductToBatch = (product: Product) => {
    setItems((current) => {
      const existing = current.find((i) => i.product.id === product.id);
      if (existing) {
        return current.map((i) =>
          i.product.id === product.id
            ? { ...i, quantidade: i.quantidade + 1 }
            : i
        );
      }
      return [...current, { product, quantidade: 1 }];
    });
  };

  const handleProductSearch = async (query: string) => {
    setSearchQuery(query);
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    try {
      const res = await api.listProducts({ query, page_size: 10 });
      setSearchResults(
        res.data.map(p => ({
          value: p.id.toString(),
          label: `${p.nome} (Estoque: ${p.total_stock})`,
          product: p
        }))
      );
    } catch (e) {
      console.error(e);
    }
  };

  const handleProductSelect = (val: string) => {
    const selected = searchResults.find(r => r.value === val);
    if (selected) {
      addProductToBatch(selected.product);
      setSearchQuery("");
      setSearchResults([]);
    }
  };

  const handleConfirm = async () => {
    if (items.length === 0) return;
    
    let resolvedOrigem = null;
    let resolvedDestino = null;

    if (tipo === "TRANSFERENCIA") {
      if (!origemLocationId || !destinoLocationId) {
        notifyError(new Error("Selecione os locais de Origem e Destino."));
        return;
      }
      if (origemLocationId === destinoLocationId) {
        notifyError(new Error("Origem e Destino não podem ser iguais."));
        return;
      }
      resolvedOrigem = Number(origemLocationId);
      resolvedDestino = Number(destinoLocationId);
    } else {
      if (!locationId) {
        notifyError(new Error("Selecione uma localização."));
        return;
      }
      resolvedOrigem = tipo === "SAIDA" ? Number(locationId) : null;
      resolvedDestino = tipo === "ENTRADA" ? Number(locationId) : null;
    }

    setLoading(true);
    try {
      const payload: MovementBatchCreate = {
        tipo,
        natureza,
        origem_location_id: resolvedOrigem,
        destino_location_id: resolvedDestino,
        observacao: observacao || "Movimentação em massa",
        documento: documento || undefined,
        items: items.map(i => ({
          produto_id: i.product.id,
          quantidade: i.quantidade,
        })),
      };

      await api.createMovementsBatch(payload);
      
      notifySuccess(`${items.length} movimentações criadas em lote com sucesso!`);
      setItems([]);
      setDocumento("");
      setObservacao("");
      onSuccess();
      onClose();
    } catch (e) {
      notifyError(e, "Ocorreu um erro ao processar a movimentação em massa.");
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = (productId: number) => {
    setItems((c) => c.filter((i) => i.product.id !== productId));
  };

  const handleChangeQty = (productId: number, val: number | string) => {
    setItems((c) =>
      c.map((i) => (i.product.id === productId ? { ...i, quantidade: Number(val) } : i))
    );
  };

  const locationOptions = locations.map((loc) => ({
    value: loc.id.toString(),
    label: loc.name,
  }));

  return (
    <Modal opened={opened} onClose={onClose} title="Movimentação em Lote / Transferência" size="xl">
      <Stack gap="md">
        <Group grow>
          <Select
            label="Tipo"
            data={["ENTRADA", "SAIDA", "TRANSFERENCIA"]}
            value={tipo}
            onChange={(val) => {
              setTipo(val as any);
              if (val === "TRANSFERENCIA") {
                setNatureza("OPERACAO_NORMAL");
              }
            }}
            allowDeselect={false}
          />
          <Select
            label="Natureza"
            data={tipo === "TRANSFERENCIA" 
              ? ["OPERACAO_NORMAL", "TRANSFERENCIA_EXTERNA"] 
              : ["OPERACAO_NORMAL", "DEVOLUCAO", "AJUSTE"]}
            value={natureza}
            onChange={(val) => setNatureza(val as any)}
            allowDeselect={false}
          />
        </Group>

        {tipo === "TRANSFERENCIA" ? (
          <Group grow>
            <Select
              label="Local de Origem"
              data={locationOptions}
              value={origemLocationId}
              onChange={setOrigemLocationId}
              placeholder="Estoque de Origem"
              allowDeselect={false}
            />
            <Select
              label="Local de Destino"
              data={locationOptions}
              value={destinoLocationId}
              onChange={setDestinoLocationId}
              placeholder="Estoque de Destino"
              allowDeselect={false}
            />
          </Group>
        ) : (
          <Select
            label="Localização"
            data={locationOptions}
            value={locationId}
            onChange={setLocationId}
            placeholder="Selecione o Local..."
            allowDeselect={false}
          />
        )}

        <Group grow>
          <TextInput
            label="Documento / Nota Fiscal"
            placeholder="Ex: NF 12345"
            value={documento}
            onChange={(e) => setDocumento(e.currentTarget.value)}
          />
          <TextInput
            label="Observação Geral"
            placeholder="Ex: Lote recebido ou Transferência em Massa"
            value={observacao}
            onChange={(e) => setObservacao(e.currentTarget.value)}
          />
        </Group>

        <Box style={{ border: "1px dashed #ccc", padding: "15px", borderRadius: "8px" }}>
          <Stack gap="xs">
            <Text size="sm" fw={500}>Adicionar Itens ao Lote</Text>
            <Text size="xs" c="dimmed">
              Você pode usar seu leitor de código de barras a qualquer momento, ou pesquisar o produto manualmente abaixo:
            </Text>
            <Autocomplete
              placeholder="Pesquisar por nome ou código..."
              data={searchResults}
              value={searchQuery}
              onChange={handleProductSearch}
              onOptionSubmit={handleProductSelect}
              leftSection={<IconSearch size={16} />}
            />
          </Stack>
        </Box>

        {items.length > 0 ? (
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Produto</Table.Th>
                <Table.Th style={{ width: 140 }}>Qtd.</Table.Th>
                <Table.Th style={{ width: 60 }}></Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {items.map((item) => (
                <Table.Tr key={item.product.id}>
                  <Table.Td>{item.product.nome}</Table.Td>
                  <Table.Td>
                    <NumberInput
                      value={item.quantidade}
                      onChange={(v) => handleChangeQty(item.product.id, v)}
                      min={1}
                      size="xs"
                    />
                  </Table.Td>
                  <Table.Td>
                    <ActionIcon color="red" variant="subtle" onClick={() => handleRemove(item.product.id)}>
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        ) : (
          <Text size="sm" ta="center" c="dimmed" mt="md">
            Nenhum produto lido ou adicionado ainda.
          </Text>
        )}

        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} loading={loading} disabled={items.length === 0}>
            Confirmar Lote
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
