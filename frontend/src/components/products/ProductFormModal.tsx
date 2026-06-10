import type { FormEventHandler } from "react";
import {
  Button,
  Modal,
  NumberInput,
  Stack,
  TextInput,
  Textarea,
} from "@mantine/core";
import type { UseFormReturnType } from "@mantine/form";

import type { InventoryLocation, Product, ProductCreate } from "../../lib/api";

type ProductFormModalProps = {
  opened: boolean;
  onClose: () => void;
  editing: Product | null;
  createForm: UseFormReturnType<ProductCreate>;
  editForm: UseFormReturnType<{ nome: string; observacao: string }>;
  onCreateSubmit: FormEventHandler<HTMLFormElement>;
  onEditSubmit: FormEventHandler<HTMLFormElement>;
  createLoading: boolean;
  editLoading: boolean;
  locations?: InventoryLocation[];
};

export function ProductFormModal({
  opened,
  onClose,
  editing,
  createForm,
  editForm,
  onCreateSubmit,
  onEditSubmit,
  createLoading,
  editLoading,
  locations = [],
}: ProductFormModalProps) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={editing ? "Editar produto" : "Novo produto"}
    >
      {editing ? (
        <form onSubmit={onEditSubmit}>
          <Stack>
            <TextInput label="Nome" {...editForm.getInputProps("nome")} />
            <Textarea
              label="Descricao"
              minRows={3}
              {...editForm.getInputProps("observacao")}
            />
            <Button type="submit" loading={editLoading}>
              Salvar
            </Button>
          </Stack>
        </form>
      ) : (
        <form onSubmit={onCreateSubmit}>
          <Stack>
            <TextInput label="Nome" {...createForm.getInputProps("nome")} />
            {locations.map((loc) => (
              <NumberInput
                key={loc.id}
                label={`Qtd ${loc.name}`}
                min={0}
                {...createForm.getInputProps(`inventories.${loc.id}`)}
              />
            ))}
            <Button type="submit" loading={createLoading}>
              Salvar
            </Button>
          </Stack>
        </form>
      )}
    </Modal>
  );
}
