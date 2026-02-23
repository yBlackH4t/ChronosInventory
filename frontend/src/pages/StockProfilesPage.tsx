import { useState } from "react";
import {
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import DataTable from "../components/ui/DataTable";
import EmptyState from "../components/ui/EmptyState";
import FilterToolbar from "../components/ui/FilterToolbar";
import PageHeader from "../components/ui/PageHeader";
import type {
  ApiError,
  StockProfileActivateOut,
  StockProfileOut,
  StockProfilesStateOut,
  SuccessResponse,
} from "../lib/api";
import { api } from "../lib/apiClient";
import { notifyError, notifySuccess } from "../lib/notify";
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

  const createMutation = useMutation<SuccessResponse<StockProfileOut>, Error, { name: string; profile_id?: string }>({
    mutationFn: (payload) => api.createStockProfile(payload),
    onSuccess: () => {
      notifySuccess("Novo estoque criado.");
      setNameInput("");
      setIdInput("");
      queryClient.invalidateQueries({ queryKey: ["stock-profiles"] });
    },
    onError: (error) => {
      if (error instanceof Error && (error as ApiError).status === 404) {
        notifyError(
          new Error("Backend desatualizado para essa funcionalidade. Atualize/recompile o sidecar e reinicie o app.")
        );
        return;
      }
      notifyError(error);
    },
  });

  const activateMutation = useMutation<SuccessResponse<StockProfileActivateOut>, Error, string>({
    mutationFn: (profileId) => api.activateStockProfile({ profile_id: profileId }),
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
        notifyError(error, "Nao foi possivel reiniciar automaticamente. Reinicie manualmente.");
      }
    },
    onError: (error) => {
      if (error instanceof Error && (error as ApiError).status === 404) {
        notifyError(
          new Error("Backend desatualizado para essa funcionalidade. Atualize/recompile o sidecar e reinicie o app.")
        );
        return;
      }
      if (error instanceof Error && /id reservado/i.test(error.message)) {
        notifyError(
          new Error(
            "Seu backend atual nao possui a correcao para reativar o estoque Principal/default. Recompile o sidecar e reinicie o app."
          )
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

  const state = profilesQuery.data?.data;
  const profiles = state?.profiles ?? [];
  const profilesLoadError =
    profilesQuery.error instanceof Error && (profilesQuery.error as ApiError).status === 404
      ? "Backend desatualizado para tela de Estoques. Recompile o sidecar e reinicie o app."
      : profilesQuery.error instanceof Error
        ? profilesQuery.error.message
        : null;

  return (
    <Stack gap="lg">
      <PageHeader
        title="Estoques"
        subtitle="Gerencie multiplas bases locais (um banco por estoque) e troque o ativo com reinicio seguro."
      />

      <Card withBorder>
        <Stack gap="sm">
          <Title order={4}>Estoque ativo</Title>
          {profilesQuery.isLoading ? (
            <Loader size="sm" />
          ) : profilesLoadError ? (
            <EmptyState
              message={profilesLoadError}
              actionLabel="Tentar novamente"
              onAction={() => void profilesQuery.refetch()}
            />
          ) : (
            <>
              <Text size="sm">
                <b>{state?.active_profile_name || "Principal"}</b> ({state?.active_profile_id || "default"})
              </Text>
              <Text size="sm" c="dimmed">
                Banco atual: {state?.current_database_path || "-"}
              </Text>
              <Text size="sm" c="dimmed">
                Pasta raiz: {state?.root_directory || "-"}
              </Text>
              {state?.restart_required && (
                <Badge color="orange" variant="light">
                  Reinicio pendente para aplicar estoque ativo
                </Badge>
              )}
            </>
          )}
        </Stack>
      </Card>

      <FilterToolbar>
        <Group align="end" wrap="wrap">
          <TextInput
            label="Nome do novo estoque"
            placeholder="Ex: Filial Maringa"
            value={nameInput}
            onChange={(event) => setNameInput(event.currentTarget.value)}
            w={320}
          />
          <TextInput
            label="ID (opcional)"
            placeholder="Ex: maringa"
            value={idInput}
            onChange={(event) => setIdInput(event.currentTarget.value)}
            w={220}
          />
          <Button onClick={createProfile} loading={createMutation.isPending}>
            Criar estoque
          </Button>
        </Group>
      </FilterToolbar>

      <Card withBorder>
        <Stack>
          <Title order={4}>Perfis cadastrados</Title>
          {profilesQuery.isLoading ? (
            <Loader size="sm" />
          ) : profilesLoadError ? (
            <EmptyState
              message={profilesLoadError}
              actionLabel="Tentar novamente"
              onAction={() => void profilesQuery.refetch()}
            />
          ) : (
            <DataTable minWidth={980}>
              <Table striped highlightOnHover withTableBorder>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Nome</Table.Th>
                    <Table.Th>ID</Table.Th>
                    <Table.Th>Banco</Table.Th>
                    <Table.Th>Pasta</Table.Th>
                    <Table.Th>Status</Table.Th>
                    <Table.Th>Acoes</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {profiles.map((profile) => (
                    <Table.Tr key={profile.id}>
                      <Table.Td>{profile.name}</Table.Td>
                      <Table.Td>{profile.id}</Table.Td>
                      <Table.Td>
                        <Badge color={profile.db_exists ? "green" : "orange"} variant="light">
                          {profile.db_exists ? "Criado" : "Ainda vazio"}
                        </Badge>
                      </Table.Td>
                      <Table.Td>{profile.path}</Table.Td>
                      <Table.Td>
                        <Badge color={profile.is_active ? "blue" : "gray"} variant="light">
                          {profile.is_active ? "ATIVO" : "INATIVO"}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Button
                          size="xs"
                          variant={profile.is_active ? "default" : "light"}
                          disabled={profile.is_active}
                          loading={activateMutation.isPending}
                          onClick={() => activateMutation.mutate(profile.id)}
                        >
                          {profile.is_active ? "Em uso" : "Ativar"}
                        </Button>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                  {profiles.length === 0 && (
                    <Table.Tr>
                      <Table.Td colSpan={6}>
                        <EmptyState message="Nenhum estoque encontrado." />
                      </Table.Td>
                    </Table.Tr>
                  )}
                </Table.Tbody>
              </Table>
            </DataTable>
          )}
        </Stack>
      </Card>
    </Stack>
  );
}
