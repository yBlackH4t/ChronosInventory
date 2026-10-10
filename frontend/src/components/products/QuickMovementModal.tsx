import { useMemo, useState } from "react";
import {
  Badge,
  Button,
  Grid,
  Group,
  Modal,
  NumberInput,
  Paper,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useHotkeys } from "@mantine/hooks";
import {
  IconArrowDownRight,
  IconArrowRight,
  IconArrowUpRight,
  IconArrowsExchange,
  IconCheck,
} from "@tabler/icons-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "../../lib/apiClient";
import type { InventoryLocation, MovementCreate, Product } from "../../lib/api";
import { notifyError, notifySuccess } from "../../lib/notify";
import {
  movementColor,
  movementNatureOptionsByType,
  type ProductMovementNature,
  type ProductMovementType,
} from "../../lib/productMovement";
import { useProfileScope } from "../../state/profileScope";

type QuickMovementModalProps = {
  opened: boolean;
  onClose: () => void;
  product: Product | null;
  locations: InventoryLocation[];
  onSuccess?: () => void;
};

function computeInitialLocations(
  product: Product | null,
  locations: InventoryLocation[],
) {
  let bestLocId = locations[0]?.id ? String(locations[0].id) : "";
  let highestStock = -1;
  if (product?.inventories) {
    for (const loc of locations) {
      const stock = product.inventories[loc.id] ?? 0;
      if (stock > highestStock) {
        highestStock = stock;
        bestLocId = String(loc.id);
      }
    }
  }

  const defaultDestino = locations.find((l) => String(l.id) !== bestLocId)?.id
    ? String(locations.find((l) => String(l.id) !== bestLocId)?.id)
    : bestLocId;

  return {
    tipo: (highestStock > 0 ? "SAIDA" : "ENTRADA") as ProductMovementType,
    origemId: bestLocId,
    destinoId: defaultDestino,
  };
}

export function QuickMovementModal({
  opened,
  onClose,
  product,
  locations,
  onSuccess,
}: QuickMovementModalProps) {
  const queryClient = useQueryClient();
  const { profileScopeKey } = useProfileScope();

  const defaults = useMemo(
    () => computeInitialLocations(product, locations),
    [product, locations],
  );

  const [tipo, setTipo] = useState<ProductMovementType>(defaults.tipo);
  const [origemId, setOrigemId] = useState<string>(defaults.origemId);
  const [destinoId, setDestinoId] = useState<string>(defaults.destinoId);
  const [quantidade, setQuantidade] = useState<number | string>(1);
  const [natureza, setNatureza] = useState<ProductMovementNature>("OPERACAO_NORMAL");
  const [documento, setDocumento] = useState<string>("");
  const [observacao, setObservacao] = useState<string>("");

  const natureOptions = useMemo(
    () => movementNatureOptionsByType(tipo),
    [tipo],
  );

  // Hotkeys to switch type inside modal with Alt+S, Alt+E, Alt+T
  useHotkeys([
    ["alt+s", () => setTipo("SAIDA")],
    ["alt+e", () => setTipo("ENTRADA")],
    ["alt+t", () => setTipo("TRANSFERENCIA")],
  ]);

  const mutation = useMutation({
    mutationFn: (payload: MovementCreate) => api.createMovement(payload),
    onSuccess: () => {
      notifySuccess(
        `${
          tipo === "SAIDA"
            ? "Baixa"
            : tipo === "ENTRADA"
            ? "Entrada"
            : "Transferência"
        } de ${quantidade} un registrada com sucesso!`,
      );
      queryClient.invalidateQueries({
        queryKey: ["produtos", profileScopeKey],
      });
      if (product) {
        queryClient.invalidateQueries({
          queryKey: ["produto", profileScopeKey, product.id],
        });
        queryClient.invalidateQueries({
          queryKey: ["historico", profileScopeKey, product.id],
        });
      }
      queryClient.invalidateQueries({
        queryKey: ["movimentacoes", profileScopeKey],
      });
      onSuccess?.();
      onClose();
    },
    onError: (err) => {
      notifyError(err, "Falha ao registrar movimentação.");
    },
  });

  if (!product) return null;

  const currentOrigemStock =
    origemId && product.inventories
      ? product.inventories[Number(origemId)] ?? 0
      : product.total_stock;

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    const qtd = Number(quantidade);
    if (!qtd || qtd <= 0) {
      notifyError(new Error("Quantidade deve ser maior que 0."));
      return;
    }

    if (tipo !== "ENTRADA" && !origemId) {
      notifyError(new Error("Selecione o local de origem."));
      return;
    }

    if (tipo !== "SAIDA" && !destinoId) {
      notifyError(new Error("Selecione o local de destino."));
      return;
    }

    if (tipo === "TRANSFERENCIA" && origemId === destinoId) {
      notifyError(new Error("Origem e destino não podem ser o mesmo local."));
      return;
    }

    const payload: MovementCreate = {
      tipo,
      produto_id: product.id,
      quantidade: qtd,
      origem_location_id:
        tipo === "ENTRADA" ? undefined : Number(origemId) || undefined,
      destino_location_id:
        tipo === "SAIDA" ? undefined : Number(destinoId) || undefined,
      natureza,
      documento: documento.trim() || undefined,
      observacao: observacao.trim() || undefined,
    };

    mutation.mutate(payload);
  };

  const locationSelectData = locations.map((loc) => {
    const stock = product.inventories?.[loc.id] ?? 0;
    return {
      value: String(loc.id),
      label: `${loc.label || loc.name} (${stock} em estoque)`,
    };
  });

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group gap="xs">
          <IconArrowsExchange size={20} color="var(--accent)" />
          <Text fw={700} size="md">
            Movimentação Rápida
          </Text>
          <Badge size="sm" variant="light" color="gray">
            #{product.id}
          </Badge>
        </Group>
      }
      size="md"
      radius="md"
      centered
    >
      <form onSubmit={handleSubmit}>
        <Stack gap="md">
          {/* Card com dados do item e saldos */}
          <Paper p="sm" radius="md" withBorder bg="var(--mantine-color-default-hover)">
            <Stack gap={4}>
              <Text fw={650} size="sm" lineClamp={2}>
                {product.nome}
              </Text>
              <Group gap="xs" mt={4} wrap="wrap">
                <Text size="xs" c="dimmed">
                  Saldos atuais:
                </Text>
                {locations.map((loc) => {
                  const qty = product.inventories?.[loc.id] ?? 0;
                  return (
                    <Badge
                      key={loc.id}
                      size="xs"
                      variant={qty > 0 ? "light" : "outline"}
                      color={qty > 0 ? "teal" : "gray"}
                    >
                      {loc.label || loc.name}: {qty}
                    </Badge>
                  );
                })}
                <Badge size="xs" variant="filled" color="dark">
                  Total: {product.total_stock}
                </Badge>
              </Group>
            </Stack>
          </Paper>

          {/* Seletor de Tipo */}
          <Stack gap={4}>
            <Group justify="space-between">
              <Text size="xs" fw={600} c="dimmed" tt="uppercase">
                Tipo de Movimentação
              </Text>
              <Text size="xs" c="dimmed">
                Atalhos: Alt+S · Alt+E · Alt+T
              </Text>
            </Group>
            <SegmentedControl
              value={tipo}
              onChange={(val) => {
                const nextTipo = val as ProductMovementType;
                setTipo(nextTipo);
                const nextOptions = movementNatureOptionsByType(nextTipo);
                if (!nextOptions.some((opt) => opt.value === natureza)) {
                  setNatureza("OPERACAO_NORMAL");
                }
              }}
              data={[
                {
                  value: "SAIDA",
                  label: (
                    <Group gap={6} justify="center">
                      <IconArrowDownRight size={16} color="var(--mantine-color-orange-6)" />
                      <Text fw={600} size="sm">
                        Baixa / Saída
                      </Text>
                    </Group>
                  ),
                },
                {
                  value: "ENTRADA",
                  label: (
                    <Group gap={6} justify="center">
                      <IconArrowUpRight size={16} color="var(--mantine-color-teal-6)" />
                      <Text fw={600} size="sm">
                        Entrada
                      </Text>
                    </Group>
                  ),
                },
                {
                  value: "TRANSFERENCIA",
                  label: (
                    <Group gap={6} justify="center">
                      <IconArrowRight size={16} color="var(--mantine-color-indigo-6)" />
                      <Text fw={600} size="sm">
                        Transferência
                      </Text>
                    </Group>
                  ),
                },
              ]}
              color={movementColor(tipo)}
            />
          </Stack>

          {/* Campos de Localidade */}
          <Grid gutter="sm">
            {tipo !== "ENTRADA" && (
              <Grid.Col span={tipo === "TRANSFERENCIA" ? 6 : 12}>
                <Select
                  label="Local de Origem (saída)"
                  placeholder="Selecione o local"
                  data={locationSelectData}
                  value={origemId}
                  onChange={(val) => setOrigemId(val || "")}
                  required
                  allowDeselect={false}
                />
              </Grid.Col>
            )}

            {tipo !== "SAIDA" && (
              <Grid.Col span={tipo === "TRANSFERENCIA" ? 6 : 12}>
                <Select
                  label="Local de Destino (entrada)"
                  placeholder="Selecione o local"
                  data={locationSelectData}
                  value={destinoId}
                  onChange={(val) => setDestinoId(val || "")}
                  required
                  allowDeselect={false}
                />
              </Grid.Col>
            )}
          </Grid>

          {/* Quantidade e Natureza */}
          <Grid gutter="sm">
            <Grid.Col span={6}>
              <NumberInput
                label="Quantidade"
                value={quantidade}
                onChange={setQuantidade}
                min={1}
                max={
                  tipo !== "ENTRADA" && currentOrigemStock > 0
                    ? currentOrigemStock
                    : undefined
                }
                autoFocus
                required
                description={
                  tipo !== "ENTRADA"
                    ? `Disponível na origem: ${currentOrigemStock}`
                    : undefined
                }
              />
            </Grid.Col>
            <Grid.Col span={6}>
              <Select
                label="Natureza / Motivo"
                data={natureOptions}
                value={natureza}
                onChange={(val) =>
                  setNatureza((val as ProductMovementNature) || "OPERACAO_NORMAL")
                }
                allowDeselect={false}
              />
            </Grid.Col>
          </Grid>

          {/* Documento e Observação */}
          <Grid gutter="sm">
            <Grid.Col span={6}>
              <TextInput
                label="Documento / NF (opcional)"
                placeholder="Ex: NF 1234, Pedido 88"
                value={documento}
                onChange={(e) => setDocumento(e.currentTarget.value)}
              />
            </Grid.Col>
            <Grid.Col span={6}>
              <TextInput
                label="Observação (opcional)"
                placeholder="Ex: Venda balcão, garantia..."
                value={observacao}
                onChange={(e) => setObservacao(e.currentTarget.value)}
              />
            </Grid.Col>
          </Grid>

          {/* Botões de Ação */}
          <Group justify="flex-end" mt="sm">
            <Button variant="default" onClick={onClose} disabled={mutation.isPending}>
              Cancelar (Esc)
            </Button>
            <Button
              type="submit"
              color={movementColor(tipo)}
              leftSection={<IconCheck size={16} />}
              loading={mutation.isPending}
            >
              Confirmar {tipo === "SAIDA" ? "Baixa" : tipo === "ENTRADA" ? "Entrada" : "Transferência"}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
