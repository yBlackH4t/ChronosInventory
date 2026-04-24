import type { FormEventHandler } from "react";
import { Button, Modal, NumberInput, Stack, TextInput, Textarea } from "@mantine/core";
import type { UseFormReturnType } from "@mantine/form";

import type { Product, ProductCreate } from "../../lib/api";

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
}: ProductFormModalProps) {
  return (
    <Modal opened={opened} onClose={onClose} title={editing ? "Editar produto" : "Novo produto"}>
      {editing ? (
        <form onSubmit={onEditSubmit}>
          <Stack>
            <TextInput label="Nome" {...editForm.getInputProps("nome")} />
            <Textarea label="Descricao" minRows={3} {...editForm.getInputProps("observacao")} />
            <Button type="submit" loading={editLoading}>
              Salvar
            </Button>
          </Stack>
        </form>
      ) : (
        <form onSubmit={onCreateSubmit}>
          <Stack>
            <TextInput label="Nome" {...createForm.getInputProps("nome")} />
            <NumberInput label="Qtd Canoas" min={0} {...createForm.getInputProps("qtd_canoas")} />
            <NumberInput label="Qtd PF" min={0} {...createForm.getInputProps("qtd_pf")} />
            <Button type="submit" loading={createLoading}>
              Salvar
            </Button>
          </Stack>
        </form>
      )}
    </Modal>
  );
}
