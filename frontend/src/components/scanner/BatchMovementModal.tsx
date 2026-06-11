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
} from "@mantine/core";
import { IconTrash } from "@tabler/icons-react";
import { useScanner } from "../../lib/useScanner";
import { api } from "../../lib/apiClient";
import type { Product, MovementCreate } from "../../lib/api";
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
  const [tipo, setTipo] = useState<MovementCreate["tipo"]>("ENTRADA");
  const [natureza, setNatureza] = useState<NonNullable<MovementCreate["natureza"]>>("OPERACAO_NORMAL");
  const [locationId, setLocationId] = useState<string | null>(null);
  const [documento, setDocumento] = useState("");
  const [observacao, setObservacao] = useState("");
  const [loading, setLoading] = useState(false);

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

        setItems((current) => {
          const existing = current.find((i) => i.product.id === product!.id);
          if (existing) {
            return current.map((i) =>
              i.product.id === product!.id
                ? { ...i, quantidade: i.quantidade + 1 }
                : i
            );
          }
          return [...current, { product: product!, quantidade: 1 }];
        });
        notifySuccess(`${product.nome} adicionado ao lote.`);
      } catch (e) {
        notifyError(e, "Erro ao processar leitura do código.");
      }
    });
  }, [opened, listen]);

  const handleConfirm = async () => {
    if (items.length === 0) return;
    if (!locationId && tipo !== "TRANSFERENCIA") {
      notifyError(new Error("Selecione uma localização."));
      return;
    }

    setLoading(true);
    let successCount = 0;
    try {
      for (const item of items) {
        const payload: MovementCreate = {
          produto_id: item.product.id,
          quantidade: item.quantidade,
          tipo,
          natureza,
          origem_location_id: tipo === "SAIDA" ? Number(locationId) : null,
          destino_location_id: tipo === "ENTRADA" ? Number(locationId) : null,
          observacao: observacao || "Movimentação em lote via Scanner",
          documento: documento || undefined,
        };
        await api.createMovement(payload);
        successCount++;
      }
      notifySuccess(`${successCount} movimentações criadas com sucesso!`);
      setItems([]);
      onSuccess();
      onClose();
    } catch (e) {
      notifyError(e, "Ocorreu um erro ao processar o lote.");
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
    <Modal opened={opened} onClose={onClose} title="Movimentação em Lote" size="lg">
      <Stack gap="md">
        <Group grow>
          <Select
            label="Tipo"
            data={["ENTRADA", "SAIDA"]}
            value={tipo}
            onChange={(val) => setTipo(val as any)}
            allowDeselect={false}
          />
          <Select
            label="Natureza"
            data={["OPERACAO_NORMAL", "DEVOLUCAO", "AJUSTE"]}
            value={natureza}
            onChange={(val) => setNatureza(val as any)}
            allowDeselect={false}
          />
          <Select
            label="Localização"
            data={locationOptions}
            value={locationId}
            onChange={setLocationId}
            placeholder="Selecione..."
            allowDeselect={false}
          />
        </Group>

        <Group grow>
          <TextInput
            label="Documento / Nota Fiscal"
            placeholder="Ex: NF 12345"
            value={documento}
            onChange={(e) => setDocumento(e.currentTarget.value)}
          />
          <TextInput
            label="Observação Geral"
            placeholder="Ex: Lote recebido via Scanner"
            value={observacao}
            onChange={(e) => setObservacao(e.currentTarget.value)}
          />
        </Group>

        <Box style={{ border: "1px dashed #ccc", padding: "10px", textAlign: "center", borderRadius: "8px" }}>
          <Text size="sm" c="dimmed">
            Abra o Leitor de Celular e comece a bipar. Os itens aparecerão aqui.
          </Text>
        </Box>

        {items.length > 0 ? (
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Produto</Table.Th>
                <Table.Th style={{ width: 120 }}>Qtd.</Table.Th>
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
            Nenhum produto lido ainda.
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
