import { useState, useEffect } from "react";
import {
  Modal,
  Button,
  Table,
  Group,
  Text,
  ActionIcon,
  Stack,
  Box,
  Autocomplete,
  Loader,
  Badge,
  Paper,
} from "@mantine/core";
import { IconSearch, IconUnlink } from "@tabler/icons-react";
import { api } from "../../lib/apiClient";
import type { Product } from "../../lib/api";
import { notifyError, notifySuccess } from "../../lib/notify";

type ProductLinkModalProps = {
  opened: boolean;
  onClose: () => void;
  product: Product | null;
  onSuccess: () => void;
};

export default function ProductLinkModal({
  opened,
  onClose,
  product,
  onSuccess,
}: ProductLinkModalProps) {
  const [linkedProducts, setLinkedProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ value: string, label: string, product: Product }[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (opened && product && product.linked_count > 0) {
      loadLinkedProducts(product.id);
    } else {
      setLinkedProducts([]);
    }
  }, [opened, product]);

  const loadLinkedProducts = async (id: number) => {
    setLoading(true);
    try {
      const res = await api.getLinkedProducts(id);
      setLinkedProducts(res.data);
    } catch (e) {
      notifyError(e, "Erro ao carregar produtos vinculados.");
    } finally {
      setLoading(false);
    }
  };

  const handleProductSearch = async (query: string) => {
    setSearchQuery(query);
    if (!query || query.length < 2) {
      setSearchResults([]);
      return;
    }

    try {
      const res = await api.listProducts({ query, page_size: 10 });
      // Excluir o próprio produto da lista de resultados
      const filtered = (res.data || []).filter(p => p.id !== product?.id);
      const mapped = filtered.map(p => ({
        value: String(p.id),
        label: `#${p.id} - ${p.nome}`,
        product: p,
      }));
      setSearchResults(mapped);
    } catch (e) {
      console.error("Erro na busca", e);
    }
  };

  const handleLinkProduct = async (produto_vinculado_id: number) => {
    if (!product) return;
    setSaving(true);
    try {
      await api.patchProduct(product.id, { produto_vinculado_id });
      notifySuccess("Produto vinculado com sucesso.");
      setSearchQuery("");
      onSuccess();
    } catch (e) {
      notifyError(e, "Erro ao vincular produto.");
    } finally {
      setSaving(false);
    }
  };

  const handleUnlinkProduct = async (childProduct: Product) => {
    setSaving(true);
    try {
      await api.patchProduct(childProduct.id, { produto_vinculado_id: null });
      notifySuccess("Vínculo removido com sucesso.");
      if (product) loadLinkedProducts(product.id);
      onSuccess();
    } catch (e) {
      notifyError(e, "Erro ao remover vínculo.");
    } finally {
      setSaving(false);
    }
  };

  const handleUnlinkSelf = async () => {
    if (!product) return;
    setSaving(true);
    try {
      await api.patchProduct(product.id, { produto_vinculado_id: null });
      notifySuccess("Vínculo removido com sucesso.");
      onSuccess();
    } catch (e) {
      notifyError(e, "Erro ao remover vínculo.");
    } finally {
      setSaving(false);
    }
  };

  if (!product) return null;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Text fw={600} size="lg">
          Gerenciar Vínculos: {product.nome}
        </Text>
      }
      size="lg"
      padding="xl"
    >
      <Stack gap="xl">
        {/* Se o produto ESTÁ vinculado a outro (Filho) */}
        {product.produto_vinculado_id ? (
          <Paper p="md" withBorder>
            <Text fw={500} mb="sm">Este produto é um componente de:</Text>
            <Group justify="space-between" align="center">
              <Badge color="blue" size="lg" variant="light">
                #{product.produto_vinculado_id} - {product.produto_vinculado_nome}
              </Badge>
              <Button
                color="red"
                variant="light"
                size="xs"
                leftSection={<IconUnlink size={14} />}
                onClick={handleUnlinkSelf}
                loading={saving}
              >
                Remover Vínculo
              </Button>
            </Group>
          </Paper>
        ) : (
          /* Se NÃO está vinculado a nada, permite buscar e vincular a um Pai */
          <Box>
            <Text fw={500} mb="xs">Vincular a um Componente Base / Pai:</Text>
            <Autocomplete
              placeholder="Digite o código ou nome do componente..."
              leftSection={<IconSearch size={16} />}
              data={searchResults}
              value={searchQuery}
              onChange={handleProductSearch}
              onOptionSubmit={(val) => {
                const item = searchResults.find(r => r.value === val);
                if (item) {
                  handleLinkProduct(item.product.id);
                }
              }}
            />
            <Text c="dimmed" size="xs" mt="xs">
              Exemplo: Linke esta produto ao item pai correspondente.
            </Text>
          </Box>
        )}

        {/* Lista de produtos que estão vinculados A ESTE (Pai) */}
        {product.linked_count > 0 && (
          <Box mt="md">
            <Group justify="space-between" mb="xs">
              <Text fw={500}>Produtos Vinculados a este componente ({product.linked_count}):</Text>
            </Group>

            {loading ? (
              <Group justify="center" p="xl"><Loader size="sm" /></Group>
            ) : linkedProducts.length === 0 ? (
              <Text c="dimmed" size="sm">Nenhum produto listado.</Text>
            ) : (
              <Table striped highlightOnHover withTableBorder>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>ID</Table.Th>
                    <Table.Th>Nome</Table.Th>
                    <Table.Th style={{ width: 80 }}>Ações</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {linkedProducts.map((p) => (
                    <Table.Tr key={p.id}>
                      <Table.Td>#{p.id}</Table.Td>
                      <Table.Td>{p.nome}</Table.Td>
                      <Table.Td>
                        <ActionIcon
                          color="red"
                          variant="light"
                          onClick={() => handleUnlinkProduct(p)}
                          loading={saving}
                        >
                          <IconUnlink size={16} />
                        </ActionIcon>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </Box>
        )}
      </Stack>
    </Modal>
  );
}
