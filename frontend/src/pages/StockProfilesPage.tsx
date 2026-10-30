import { useState } from "react";
import {
  ActionIcon,
  Button,
  Group,
  Loader,
  Modal,
  Stack,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { modals } from "@mantine/modals";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import EmptyState from "../components/ui/EmptyState";
import PageHeader from "../components/ui/PageHeader";
import Panel from "../components/ui/Panel";
import StatusDot, { KeyValue } from "../components/ui/StatusDot";
import type {
  ApiError,
  StockProfileActivateOut,
  StockProfileDeleteOut,
  StockProfileOut,
  StockProfilesStateOut,
  SuccessResponse,
} from "../lib/api";
import { api } from "../lib/apiClient";
import { OUTDATED_APP_MESSAGE, notifyError, notifySuccess } from "../lib/notify";
import { isTauri } from "../lib/tauri";
import { restartApplication } from "../lib/restartApp";

export default function StockProfilesPage() {
  const queryClient = useQueryClient();
  const [nameInput, setNameInput] = useState("");
  const [idInput, setIdInput] = useState("");

  const profilesQuery = useQuery<SuccessResponse<StockProfilesStateOut>>({
    queryKey: ["stock-profiles"],
    queryFn: ({ signal }) => api.listStockProfiles({ signal }),
    staleTime: 30_000,
  });

  const [createModalOpened, createModal] = useDisclosure(false);

  const createMutation = useMutation<
    SuccessResponse<StockProfileOut>,
    Error,
    { name: string; profile_id?: string }
  >({
    mutationFn: (payload) => api.createStockProfile(payload),
    onSuccess: () => {
      createModal.close();
      notifySuccess("Novo estoque criado.");
      setNameInput("");
      setIdInput("");
      queryClient.invalidateQueries({ queryKey: ["stock-profiles"] });
    },
    onError: (error) => {
      if (error instanceof Error && (error as ApiError).status === 404) {
        notifyError(
          new Error(
            OUTDATED_APP_MESSAGE,
          ),
        );
        return;
      }
      notifyError(error);
    },
  });

  const activateMutation = useMutation<
    SuccessResponse<StockProfileActivateOut>,
    Error,
    string
  >({
    mutationFn: (profileId) =>
      api.activateStockProfile({ profile_id: profileId }),
    onSuccess: async (response) => {
      notifySuccess(response.data.message);
      queryClient.invalidateQueries({ queryKey: ["stock-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["stock-profiles", "scope"] });
      if (!response.data.requires_restart) return;

      if (!isTauri()) {
        notifySuccess("Reinicie o aplicativo para aplicar a troca de estoque.");
        return;
      }

      try {
        await restartApplication();
      } catch (error) {
        notifyError(
          error,
          "Não foi possível reiniciar automaticamente. Reinicie manualmente.",
        );
      }
    },
    onError: (error) => {
      if (error instanceof Error && (error as ApiError).status === 404) {
        notifyError(
          new Error(
            OUTDATED_APP_MESSAGE,
          ),
        );
        return;
      }
      if (error instanceof Error && /id reservado/i.test(error.message)) {
        notifyError(
          new Error(
            OUTDATED_APP_MESSAGE,
          ),
        );
        return;
      }
      notifyError(error);
    },
  });

  const deleteMutation = useMutation<
    SuccessResponse<StockProfileDeleteOut>,
    Error,
    StockProfileOut
  >({
    mutationFn: (profile) => api.deleteStockProfile(profile.id),
    onSuccess: (response) => {
      notifySuccess(response.data.message);
      queryClient.invalidateQueries({ queryKey: ["stock-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["stock-profiles", "scope"] });
    },
    onError: (error) => {
      if (error instanceof Error && (error as ApiError).status === 404) {
        notifyError(
          new Error(
            OUTDATED_APP_MESSAGE,
          ),
        );
        return;
      }
      notifyError(error);
    },
  });

  const createProfile = () => {
    const name = nameInput.trim();
    const profile_id = idInput.trim().toLowerCase();
    if (name.length < 2) {
      notifyError(new Error("Informe um nome com ao menos 2 caracteres."));
      return;
    }
    createMutation.mutate({
      name,
      profile_id: profile_id || undefined,
    });
  };

  const confirmDeleteProfile = (profile: StockProfileOut) => {
    modals.openConfirmModal({
      title: "Remover estoque",
      children: (
        <Text size="sm">
          O estoque <b>{profile.name}</b> será removido da lista junto com a
          pasta local desse perfil. Essa ação não pode ser desfeita.
        </Text>
      ),
      labels: { confirm: "Remover estoque", cancel: "Cancelar" },
      confirmProps: { color: "danger" },
      onConfirm: () => deleteMutation.mutate(profile),
    });
  };

  const state = profilesQuery.data?.data;
  const profiles = state?.profiles ?? [];
  const profilesLoadError =
    profilesQuery.error instanceof Error &&
    (profilesQuery.error as ApiError).status === 404
      ? OUTDATED_APP_MESSAGE
      : profilesQuery.error instanceof Error
        ? profilesQuery.error.message
        : null;

  return (
    <Stack gap="lg">
      <PageHeader
        title="Perfis de estoque"
        subtitle="Bases de dados independentes (um banco por perfil). Trocar o perfil ativo exige reiniciar."
        actions={
          <Button leftSection={<IconPlus size={16} />} onClick={createModal.open}>
            Novo perfil
          </Button>
        }
      />

      <Panel
        title="Perfil ativo"
        actions={
          state?.restart_required ? (
            <StatusDot tone="warning">Reinício pendente</StatusDot>
          ) : (
            <StatusDot tone="success">Em uso</StatusDot>
          )
        }
      >
        {profilesQuery.isLoading ? (
          <Loader size="sm" />
        ) : profilesLoadError ? (
          <EmptyState
            message="Falha ao carregar perfis"
            description={profilesLoadError}
            actionLabel="Tentar novamente"
            onAction={() => void profilesQuery.refetch()}
          />
        ) : (
          <Stack gap={0}>
            <KeyValue
              label="Perfil"
              value={`${state?.active_profile_name || "Principal"} (${state?.active_profile_id || "default"})`}
            />
            <KeyValue label="Banco atual" value={state?.current_database_path || "—"} mono />
            <KeyValue label="Pasta raiz" value={state?.root_directory || "—"} mono />
          </Stack>
        )}
      </Panel>

      <Panel flush title="Perfis cadastrados">
        {profilesQuery.isLoading ? (
          <Group justify="center" p="xl">
            <Loader size="sm" />
          </Group>
        ) : profilesLoadError ? null : (
          <Table.ScrollContainer minWidth={760}>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Perfil</Table.Th>
                  <Table.Th w={140}>Banco</Table.Th>
                  <Table.Th w={130}>Status</Table.Th>
                  <Table.Th w={170} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {profiles.map((profile) => (
                  <Table.Tr
                    key={profile.id}
                    className={profile.is_active ? "row-selected" : undefined}
                  >
                    <Table.Td>
                      <Text size="sm" fw={500}>
                        {profile.name}
                      </Text>
                      <Text size="xs" c="dimmed" className="mono" truncate="end" title={profile.path}>
                        {profile.id} · {profile.path}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <StatusDot tone={profile.db_exists ? "success" : "neutral"}>
                        {profile.db_exists ? "Criado" : "Vazio"}
                      </StatusDot>
                    </Table.Td>
                    <Table.Td>
                      <StatusDot tone={profile.is_active ? "info" : "neutral"}>
                        {profile.is_active ? "Ativo" : "Inativo"}
                      </StatusDot>
                    </Table.Td>
                    <Table.Td>
                      <Group gap={4} justify="flex-end" wrap="nowrap">
                        {!profile.is_active && (
                          <Button
                            size="xs"
                            variant="default"
                            loading={activateMutation.isPending}
                            onClick={() => activateMutation.mutate(profile.id)}
                          >
                            Ativar
                          </Button>
                        )}
                        <ActionIcon
                          color="gray"
                          className="action-danger"
                          aria-label="Remover perfil"
                          disabled={profile.is_active || profile.id === "default"}
                          loading={deleteMutation.isPending}
                          onClick={() => confirmDeleteProfile(profile)}
                        >
                          <IconTrash size={16} stroke={1.5} />
                        </ActionIcon>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
                {profiles.length === 0 && (
                  <Table.Tr>
                    <Table.Td colSpan={4} style={{ borderBottom: 0 }}>
                      <EmptyState message="Nenhum perfil encontrado" />
                    </Table.Td>
                  </Table.Tr>
                )}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Panel>

      <Modal opened={createModalOpened} onClose={createModal.close} title="Novo perfil de estoque">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            createProfile();
          }}
        >
          <Stack gap="sm">
            <TextInput
              label="Nome"
              placeholder="Ex: Filial Maringá"
              value={nameInput}
              onChange={(event) => setNameInput(event.currentTarget.value)}
              data-autofocus
            />
            <TextInput
              label="ID"
              description="Opcional. Usado no nome da pasta do banco."
              placeholder="Ex: maringa"
              value={idInput}
              onChange={(event) => setIdInput(event.currentTarget.value)}
            />
            <Group justify="flex-end" mt="sm">
              <Button variant="default" onClick={createModal.close}>
                Cancelar
              </Button>
              <Button type="submit" loading={createMutation.isPending}>
                Criar perfil
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}
