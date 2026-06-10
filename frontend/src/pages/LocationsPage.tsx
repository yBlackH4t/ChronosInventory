import { useState } from "react";
import {
  ActionIcon,
  Button,
  Card,
  Group,
  Modal,
  Stack,
  Table,
  Text,
  TextInput,
  Switch,
  Alert,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  IconEdit,
  IconPlus,
  IconTrash,
  IconAlertTriangle,
} from "@tabler/icons-react";
import { api } from "../lib/apiClient";
import type { InventoryLocation } from "../lib/api";
import { notifyError, notifySuccess } from "../lib/notify";
import PageHeader from "../components/ui/PageHeader";
import EmptyState from "../components/ui/EmptyState";
import { useLocations } from "../hooks/useLocations";

export default function LocationsPage() {
  const { locations, activeLocations, isLoading } = useLocations();
  const queryClient = useQueryClient();

  const [showInactive, setShowInactive] = useState(false);

  const [modalOpened, { open: openModal, close: closeModal }] =
    useDisclosure(false);
  const [editingLoc, setEditingLoc] = useState<InventoryLocation | null>(null);
  const [name, setName] = useState("");
  const [isActive, setIsActive] = useState(true);

  const [
    deleteModalOpened,
    { open: openDeleteModal, close: closeDeleteModal },
  ] = useDisclosure(false);
  const [locToDelete, setLocToDelete] = useState<InventoryLocation | null>(
    null,
  );
  const [deleteHasStock, setDeleteHasStock] = useState(false);

  const handleEdit = (loc: InventoryLocation) => {
    setEditingLoc(loc);
    setName(loc.label || loc.name);
    setIsActive(loc.ativo);
    openModal();
  };

  const handleCreate = () => {
    if (activeLocations.length >= 5) {
      notifyError(
        new Error("Limite de locais"),
        "Voce ja atingiu o limite maximo de 5 locais ativos.",
      );
      return;
    }
    setEditingLoc(null);
    setName("");
    setIsActive(true);
    openModal();
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      if (editingLoc) {
        return api.updateLocation(editingLoc.id, {
          label: name,
          ativo: isActive,
        });
      }
      return api.createLocation({ name, label: name });
    },
    onSuccess: () => {
      notifySuccess(editingLoc ? "Local atualizado" : "Local criado");
      queryClient.invalidateQueries({ queryKey: ["locations"] });
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
      closeModal();
    },
    onError: (err) => notifyError(err, "Falha ao salvar local"),
  });

  const deleteMutation = useMutation({
    mutationFn: ({ force, hard }: { force: boolean; hard: boolean }) =>
      api.deleteLocation(locToDelete!.id, force, hard),
    onSuccess: () => {
      notifySuccess("Local removido com sucesso");
      queryClient.invalidateQueries({ queryKey: ["locations"] });
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
      closeDeleteModal();
    },
    onError: (err: any) => {
      // Check if it's the "has stock" error
      if (err?.response?.status === 409 || err?.message?.includes("estoque")) {
        setDeleteHasStock(true);
      } else {
        notifyError(err, "Falha ao remover local");
        closeDeleteModal();
      }
    },
  });

  const confirmDelete = (loc: InventoryLocation) => {
    setLocToDelete(loc);
    setDeleteHasStock(false);
    openDeleteModal();
  };

  const displayLocations = showInactive ? locations : activeLocations;

  return (
    <Stack gap="md">
      <PageHeader
        title="Meus Locais"
        subtitle="Gerencie os locais onde seu estoque e armazenado (Maximo: 5)."
        actions={
          <Button
            leftSection={<IconPlus size={16} />}
            onClick={handleCreate}
            disabled={activeLocations.length >= 5}
          >
            Novo local
          </Button>
        }
      />

      <Card withBorder p="md">
        <Group justify="flex-end" mb="md">
          <Switch
            label="Mostrar locais inativos"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.currentTarget.checked)}
            size="sm"
          />
        </Group>

        {isLoading ? (
          <Text>Carregando locais...</Text>
        ) : displayLocations.length === 0 ? (
          <EmptyState
            message="Nenhum local encontrado."
            actionLabel="Criar local"
            onAction={handleCreate}
          />
        ) : (
          <Stack gap="md">
            <Table.ScrollContainer minWidth={500}>
              <Table verticalSpacing="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>ID</Table.Th>
                    <Table.Th>Nome</Table.Th>
                    <Table.Th>Status</Table.Th>
                    <Table.Th style={{ width: 100 }}>Acoes</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {displayLocations.map((loc) => (
                    <Table.Tr key={loc.id}>
                      <Table.Td>{loc.id}</Table.Td>
                      <Table.Td fw={500}>{loc.label || loc.name}</Table.Td>
                      <Table.Td>
                        <Text c={loc.ativo ? "green" : "red"} size="sm">
                          {loc.ativo ? "Ativo" : "Inativo"}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Group gap="xs" wrap="nowrap">
                          <ActionIcon
                            variant="subtle"
                            color="blue"
                            onClick={() => handleEdit(loc)}
                          >
                            <IconEdit size={16} />
                          </ActionIcon>
                          <ActionIcon
                            variant="subtle"
                            color="red"
                            onClick={() => confirmDelete(loc)}
                            disabled={locations.length === 1}
                          >
                            <IconTrash size={16} />
                          </ActionIcon>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </Stack>
        )}
      </Card>

      <Modal
        opened={modalOpened}
        onClose={closeModal}
        title={editingLoc ? "Editar Local" : "Novo Local"}
      >
        <Stack gap="md">
          <TextInput
            label="Nome do local"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            data-autofocus
          />
          {editingLoc && (
            <Switch
              label="Local ativo"
              description="Locais inativos nao aparecem em novos relatorios ou operacoes, mas o historico e mantido."
              checked={isActive}
              onChange={(e) => setIsActive(e.currentTarget.checked)}
            />
          )}
          <Group justify="flex-end" mt="md">
            <Button variant="subtle" onClick={closeModal}>
              Cancelar
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              loading={saveMutation.isPending}
              disabled={!name.trim()}
            >
              Salvar
            </Button>
          </Group>
        </Stack>
      </Modal>

        <Modal
          opened={deleteModalOpened}
          onClose={closeDeleteModal}
          title="Remover Local"
          centered
        >
          <Stack>
            {locToDelete?.ativo === false ? (
              <>
                <Text size="sm">
                  Este local já está inativo. Deseja excluí-lo permanentemente do
                  banco de dados? Esta ação não pode ser desfeita.
                </Text>
                <Group justify="flex-end" mt="md">
                  <Button variant="subtle" onClick={closeDeleteModal}>
                    Cancelar
                  </Button>
                  <Button
                    color="red"
                    onClick={() => deleteMutation.mutate({ force: false, hard: true })}
                    loading={deleteMutation.isPending}
                  >
                    Excluir Permanentemente
                  </Button>
                </Group>
              </>
            ) : !deleteHasStock ? (
              <>
                <Text size="sm">
                  Tem certeza que deseja remover o local{" "}
                  <strong>{locToDelete?.label || locToDelete?.name}</strong>?
                </Text>
                <Group justify="flex-end" mt="md">
                  <Button variant="subtle" onClick={closeDeleteModal}>
                    Cancelar
                  </Button>
                  <Button
                    color="red"
                    onClick={() => deleteMutation.mutate({ force: false, hard: false })}
                    loading={deleteMutation.isPending}
                  >
                    Remover
                  </Button>
                </Group>
              </>
            ) : (
              <>
                <Alert
                  icon={<IconAlertTriangle size={16} />}
                  title="Este local possui estoque ativo!"
                  color="orange"
                >
                  Nao e possivel deletar permanentemente um local que ainda possui
                  produtos associados.
                </Alert>
                <Text size="sm" mt="sm">
                  Voce pode transferir o estoque para outro local primeiro, ou
                  voce pode inativar este local. Ao inativar (soft-delete), o
                  local some das listas de operacao, e seu estoque nao contara
                  mais no total ativo, mas o historico sera mantido.
                </Text>
                <Group justify="flex-end" mt="md">
                  <Button variant="subtle" onClick={closeDeleteModal}>
                    Cancelar
                  </Button>
                  <Button
                    color="orange"
                    onClick={() => deleteMutation.mutate({ force: true, hard: false })}
                    loading={deleteMutation.isPending}
                  >
                    Inativar local (Soft-delete)
                  </Button>
                </Group>
              </>
            )}
          </Stack>
        </Modal>
    </Stack>
  );
}
