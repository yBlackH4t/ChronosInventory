import { useEffect, useState } from "react";
import { Button, Group, Modal, Stack, Text, TextInput } from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";

import { api } from "../../lib/apiClient";
import type { NfeItemPreview, NfeProduto } from "../../lib/api";
import { notifyError, notifySuccess } from "../../lib/notify";

type NfeNewProductModalProps = {
  item: NfeItemPreview | null;
  onClose: () => void;
  onCreated: (item: number, product: NfeProduto) => void;
};

// Cadastro rapido de um produto que a nota trouxe e o Chronos ainda nao tem, sem sair da nota.
export default function NfeNewProductModal({ item, onClose, onCreated }: NfeNewProductModalProps) {
  const [nome, setNome] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (item) setNome(item.descricao);
  }, [item]);

  const save = async () => {
    if (!item || !nome.trim()) return;
    setSaving(true);
    try {
      const res = await api.createProduct({ nome: nome.trim() });
      const product = res.data;
      onCreated(item.item, {
        id: product.id,
        nome: product.nome,
        ativo: true,
        estoque: Object.fromEntries(
          Object.entries(product.inventories ?? {}).map(([k, v]) => [String(k), Number(v)]),
        ),
      });
      notifySuccess(`Produto ${product.nome} cadastrado.`);
      onClose();
    } catch (e) {
      notifyError(e, "Não foi possível cadastrar o produto.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal opened={item !== null} onClose={onClose} title="Cadastrar produto da nota" centered size="md">
      <Stack gap="sm">
        {item && (
          <Text size="xs" c="dimmed">
            Item da nota: cód. {item.codigo} · {item.descricao}
          </Text>
        )}
        <TextInput
          label="Nome no Chronos"
          description="Deixe os códigos da peça no nome: é por eles que as próximas notas acham o produto."
          value={nome}
          onChange={(e) => setNome(e.currentTarget.value)}
          maxLength={200}
          data-autofocus
        />
        <Text size="xs" c="dimmed">
          O produto entra com saldo 0. Numa entrada, a nota soma a quantidade quando você confirmar.
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            leftSection={<IconPlus size={16} />}
            loading={saving}
            disabled={!nome.trim()}
            onClick={() => void save()}
          >
            Cadastrar e usar
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
