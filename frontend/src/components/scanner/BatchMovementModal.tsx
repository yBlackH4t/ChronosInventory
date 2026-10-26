import { useState, useEffect, useRef } from "react";
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
  Switch,
  VisuallyHidden,
} from "@mantine/core";
import { IconTrash, IconSearch, IconVolume, IconVolumeOff } from "@tabler/icons-react";
import { useScanner } from "../../lib/useScanner";
import { api } from "../../lib/apiClient";
import type { Product, MovementBatchCreate } from "../../lib/api";
import { notifyError, notifySuccess } from "../../lib/notify";
import { useLocations } from "../../hooks/useLocations";
import { useMotionLevel } from "../../lib/motionContext";
import { playBeep, readBeepPreference, writeBeepPreference } from "../../lib/scanFeedback";
import "./scanner.css";

// Quanto tempo a moldura verde fica no item lido.
const SCAN_HIT_MS = 1600;

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
  const motionLevel = useMotionLevel();
  // Bipe ao ler: desligado por padrão, lembrado só nesta máquina.
  const [beepOn, setBeepOn] = useState(() => readBeepPreference());
  const beepRef = useRef(beepOn);
  const [flash, setFlash] = useState<{ id: number; n: number } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const rowRefs = useRef(new Map<number, HTMLTableRowElement>());

  useEffect(() => {
    beepRef.current = beepOn;
  }, [beepOn]);

  const toggleBeep = (on: boolean) => {
    setBeepOn(on);
    writeBeepPreference(on);
    if (on) playBeep(true);
  };

  const scanPanelRef = useRef<HTMLDivElement>(null);
  // Código não encontrado: o quadro de leitura treme de leve (fora do nível "Nenhum").
  const shakePanel = () => {
    const panel = scanPanelRef.current;
    if (!panel) return;
    panel.classList.remove("mi-shake");
    void panel.offsetWidth;
    panel.classList.add("mi-shake");
    window.setTimeout(() => panel.classList.remove("mi-shake"), 500);
  };

  const markFound = (product: Product) => {
    setFlash((current) => ({ id: product.id, n: (current?.n ?? 0) + 1 }));
    setAnnouncement(`${product.nome} adicionado ao lote.`);
  };

  // Moldura verde no item achado: pulsa (Completo), acende e apaga (Suave) ou fica parada
  // um instante (Nenhum). Lido de novo, a moldura recomeça.
  useEffect(() => {
    if (!flash) return;
    const row = rowRefs.current.get(flash.id);
    if (!row) return;
    row.classList.remove("scan-hit");
    void row.offsetWidth; // recomeça a animação
    row.classList.add("scan-hit");
    row.scrollIntoView({ block: "nearest", behavior: motionLevel === "completo" ? "smooth" : "auto" });
    const timer = window.setTimeout(() => row.classList.remove("scan-hit"), SCAN_HIT_MS);
    return () => {
      window.clearTimeout(timer);
      row.classList.remove("scan-hit");
    };
  }, [flash, motionLevel]);

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
          if (beepRef.current) playBeep(false);
          shakePanel();
          notifyError(new Error(`Produto não encontrado para o código: ${code}`));
          return;
        }

        addProductToBatch(product);
        markFound(product);
        if (beepRef.current) playBeep(true);
        notifySuccess(`${product.nome} adicionado ao lote.`);
      } catch (e) {
        notifyError(e, "Erro ao processar leitura do código.");
      }
    });
  }, [opened, listen]);

  const addProductToBatch = (product: Product) => {
    // O item lido sobe para o topo da lista (novo ou de novo), onde a moldura acende.
    setItems((current) => {
      const existing = current.find((i) => i.product.id === product.id);
      const rest = current.filter((i) => i.product.id !== product.id);
      return existing
        ? [{ ...existing, quantidade: existing.quantidade + 1 }, ...rest]
        : [{ product, quantidade: 1 }, ...rest];
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
      markFound(selected.product);
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
        notifyError(new Error("Selecione os locais de origem e destino."));
        return;
      }
      if (origemLocationId === destinoLocationId) {
        notifyError(new Error("Origem e destino não podem ser iguais."));
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
    <Modal opened={opened} onClose={onClose} title="Movimentação em Lote / Transferência" size="xl" classNames={{ header: "modal-solid-header" }}>
      <Stack gap="md">
        <Group grow>
          <Select
            label="Tipo"
            data={["ENTRADA", "SAIDA", "TRANSFERENCIA"]}
            value={tipo}
            onChange={(val) => {
              setTipo(val as MovementBatchCreate["tipo"]);
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
            onChange={(val) => setNatureza(val as NonNullable<MovementBatchCreate["natureza"]>)}
            allowDeselect={false}
          />
        </Group>

        {tipo === "TRANSFERENCIA" ? (
          <Group grow>
            <Select
              label="Local de origem"
              data={locationOptions}
              value={origemLocationId}
              onChange={setOrigemLocationId}
              placeholder="Estoque de Origem"
              allowDeselect={false}
            />
            <Select
              label="Local de destino"
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

        <Box className="scan-panel" ref={scanPanelRef}>
          <Stack gap="xs">
            <Group justify="space-between" align="center" gap="xs">
              <Text size="sm" fw={500}>Adicionar Itens ao Lote</Text>
              <Switch
                size="sm"
                checked={beepOn}
                onChange={(e) => toggleBeep(e.currentTarget.checked)}
                label="Bipe ao ler"
                description="Só neste computador"
                thumbIcon={beepOn ? <IconVolume size={10} /> : <IconVolumeOff size={10} />}
              />
            </Group>
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
          <Table verticalSpacing="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Produto</Table.Th>
                <Table.Th style={{ width: 140 }}>Qtd.</Table.Th>
                <Table.Th style={{ width: 60 }}></Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {items.map((item) => (
                <Table.Tr
                  key={item.product.id}
                  ref={(el) => {
                    if (el) rowRefs.current.set(item.product.id, el);
                    else rowRefs.current.delete(item.product.id);
                  }}
                >
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
                    <ActionIcon color="gray" className="action-danger" aria-label="Remover item" onClick={() => handleRemove(item.product.id)}>
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

        <VisuallyHidden aria-live="polite" role="status">
          {announcement}
        </VisuallyHidden>

        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} loading={loading} disabled={items.length === 0}>
            Confirmar movimentação em lote
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
