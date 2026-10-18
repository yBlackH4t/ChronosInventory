import { useState } from "react";
import {
  ActionIcon,
  Alert,
  Button,
  Group,
  Loader,
  Modal,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
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
import Panel from "../components/ui/Panel";
import StatusDot from "../components/ui/StatusDot";
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
    onError: (err: Error & { response?: { status?: number } }) => {
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
        title="Filiais e locais"
        subtitle={`Onde o estoque fica armazenado · ${activeLocations.length} de 5 ativos`}
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

      <Panel
        flush
        title="Locais"
        actions={
          <Switch
            label="Mostrar inativos"
            labelPosition="left"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.currentTarget.checked)}
            size="sm"
          />
        }
      >
        {isLoading ? (
          <Group justify="center" p="xl">
            <Loader size="sm" />
          </Group>
        ) : displayLocations.length === 0 ? (
          <EmptyState
            message="Nenhum local encontrado"
            actionLabel="Criar local"
            onAction={handleCreate}
          />
        ) : (
          <Table.ScrollContainer minWidth={480}>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Nome</Table.Th>
                  <Table.Th w={140}>Status</Table.Th>
                  <Table.Th w={96} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {displayLocations.map((loc) => (
                  <Table.Tr key={loc.id}>
                    <Table.Td>
                      <Text size="sm" fw={500}>
                        {loc.label || loc.name}
                      </Text>
                      <Text size="xs" c="dimmed" className="mono">
                        #{loc.id}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <StatusDot tone={loc.ativo ? "success" : "neutral"}>
                        {loc.ativo ? "Ativo" : "Inativo"}
                      </StatusDot>
                    </Table.Td>
                    <Table.Td>
                      <Group gap={2} justify="flex-end" wrap="nowrap" className="row-actions">
                        <ActionIcon
                          color="gray"
                          aria-label="Editar local"
                          onClick={() => handleEdit(loc)}
                        >
                          <IconEdit size={16} stroke={1.5} />
                        </ActionIcon>
                        <ActionIcon
                          color="gray"
                          className="action-danger"
                          aria-label="Remover local"
                          onClick={() => confirmDelete(loc)}
                          disabled={locations.length === 1}
                        >
                          <IconTrash size={16} stroke={1.5} />
                        </ActionIcon>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Panel>

      <Modal
        opened={modalOpened}
        onClose={closeModal}
        title={editingLoc ? "Editar local" : "Novo local"}
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
              description="Locais inativos não aparecem em novas operações e relatórios, mas o histórico é mantido."
              checked={isActive}
              onChange={(e) => setIsActive(e.currentTarget.checked)}
            />
          )}
          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={closeModal}>
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
          title="Remover local"
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
                  <Button variant="default" onClick={closeDeleteModal}>
                    Cancelar
                  </Button>
                  <Button
                    color="danger"
                    onClick={() => deleteMutation.mutate({ force: false, hard: true })}
                    loading={deleteMutation.isPending}
                  >
                    Excluir permanentemente
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
                  <Button variant="default" onClick={closeDeleteModal}>
                    Cancelar
                  </Button>
                  <Button
                    color="danger"
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
                  title="Este local ainda tem estoque"
                  color="warning"
                >
                  Não é possível excluir permanentemente um local que ainda possui
                  produtos associados.
                </Alert>
                <Text size="sm" mt="sm">
                  Transfira o estoque para outro local primeiro, ou inative este
                  local. Inativo, ele some das operações e o estoque deixa de
                  contar no total ativo, mas o histórico é mantido.
                </Text>
                <Group justify="flex-end" mt="md">
                  <Button variant="default" onClick={closeDeleteModal}>
                    Cancelar
                  </Button>
                  <Button
                    color="warning"
                    onClick={() => deleteMutation.mutate({ force: true, hard: false })}
                    loading={deleteMutation.isPending}
                  >
                    Inativar local
                  </Button>
                </Group>
              </>
            )}
          </Stack>
        </Modal>
    </Stack>
  );
}
