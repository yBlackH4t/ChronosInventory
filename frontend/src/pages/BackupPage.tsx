import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Select,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";

import { api } from "../lib/apiClient";
import { downloadBlob } from "../lib/download";
import type {
  BackupListItemOut,
  BackupOut,
  BackupRestoreOut,
  BackupValidateOut,
  DownloadResponse,
  SuccessResponse,
} from "../lib/api";
import { notifyError, notifySuccess } from "../lib/notify";

function bytesToHuman(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function BackupPage() {
  const queryClient = useQueryClient();
  const [selectedBackupName, setSelectedBackupName] = useState<string | null>(null);
  const [selectedValidation, setSelectedValidation] = useState<BackupValidateOut | null>(null);

  const backupsQuery = useQuery<SuccessResponse<BackupListItemOut[]>>({
    queryKey: ["backup-list"],
    queryFn: ({ signal }) => api.backupList({ signal }),
  });

  const validateCurrentQuery = useQuery<SuccessResponse<BackupValidateOut>>({
    queryKey: ["backup-validate-current"],
    queryFn: ({ signal }) => api.backupValidate(undefined, { signal }),
  });

  const backupMutation = useMutation<SuccessResponse<BackupOut>, Error, void>({
    mutationFn: () => api.backupCreate(),
    onSuccess: () => {
      notifySuccess("Backup criado");
      queryClient.invalidateQueries({ queryKey: ["backup-list"] });
      queryClient.invalidateQueries({ queryKey: ["backup-validate-current"] });
    },
    onError: (error) => notifyError(error),
  });

  const validateSelectedMutation = useMutation<SuccessResponse<BackupValidateOut>, Error, string>({
    mutationFn: (backupName) => api.backupValidate(backupName),
    onSuccess: (response) => {
      setSelectedValidation(response.data);
      notifySuccess("Validacao concluida");
    },
    onError: (error) => notifyError(error),
  });

  const restoreMutation = useMutation<SuccessResponse<BackupRestoreOut>, Error, string>({
    mutationFn: (backupName) => api.backupRestore({ backup_name: backupName }),
    onSuccess: () => {
      notifySuccess("Backup restaurado com sucesso");
      queryClient.invalidateQueries({ queryKey: ["backup-list"] });
      queryClient.invalidateQueries({ queryKey: ["backup-validate-current"] });
      setSelectedValidation(null);
    },
    onError: (error) => notifyError(error),
  });

  const diagnosticsMutation = useMutation<DownloadResponse, Error, void>({
    mutationFn: () => api.backupDiagnostics(),
    onSuccess: ({ blob, filename }) => {
      downloadBlob(blob, filename || `diagnostico_${dayjs().format("YYYYMMDD_HHmmss")}.zip`);
      notifySuccess("Diagnostico exportado");
    },
    onError: (error) => notifyError(error),
  });

  const backups = backupsQuery.data?.data ?? [];
  const backupOptions = useMemo(
    () => backups.map((item) => ({ value: item.name, label: `${item.name} (${bytesToHuman(item.size)})` })),
    [backups]
  );

  useEffect(() => {
    if (!selectedBackupName && backups.length > 0) {
      setSelectedBackupName(backups[0].name);
    }
  }, [backups, selectedBackupName]);

  const selectedBackup = backups.find((item) => item.name === selectedBackupName) || null;
  const currentValidation = validateCurrentQuery.data?.data;

  const confirmRestore = () => {
    if (!selectedBackupName) return;
    modals.openConfirmModal({
      title: "Restaurar backup",
      children: (
        <Text size="sm">
          Esta operacao vai substituir o banco atual pelo backup selecionado ({selectedBackupName}). O sistema cria
          um backup de seguranca automaticamente antes da restauracao.
        </Text>
      ),
      labels: { confirm: "Restaurar agora", cancel: "Cancelar" },
      confirmProps: { color: "red" },
      onConfirm: () => restoreMutation.mutate(selectedBackupName),
    });
  };

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="center">
        <Title order={2}>Backup</Title>
        <Group>
          <Button
            variant="light"
            onClick={() => diagnosticsMutation.mutate()}
            loading={diagnosticsMutation.isPending}
          >
            Exportar diagnostico
          </Button>
          <Button onClick={() => backupMutation.mutate()} loading={backupMutation.isPending}>
            Criar backup
          </Button>
        </Group>
      </Group>

      <Card withBorder>
        <Stack>
          <Title order={4}>Integridade do banco atual</Title>
          {!currentValidation && validateCurrentQuery.isLoading && <Loader size="sm" />}
          {currentValidation && (
            <Group>
              <Badge color={currentValidation.ok ? "green" : "red"} variant="light">
                {currentValidation.ok ? "INTEGRO" : "COM ERRO"}
              </Badge>
              <Text size="sm" c="dimmed">
                {currentValidation.result}
              </Text>
            </Group>
          )}
        </Stack>
      </Card>

      <Card withBorder>
        <Stack>
          <Title order={4}>Restaurar backup</Title>
          {backupsQuery.isLoading ? (
            <Loader size="sm" />
          ) : (
            <>
              <Select
                label="Backup"
                placeholder={backupOptions.length > 0 ? "Selecione o backup" : "Nenhum backup disponivel"}
                data={backupOptions}
                value={selectedBackupName}
                onChange={setSelectedBackupName}
                searchable
              />

              <Group>
                <Button
                  variant="light"
                  disabled={!selectedBackupName}
                  loading={validateSelectedMutation.isPending}
                  onClick={() => selectedBackupName && validateSelectedMutation.mutate(selectedBackupName)}
                >
                  Validar backup selecionado
                </Button>
                <Button
                  color="red"
                  disabled={!selectedBackupName}
                  loading={restoreMutation.isPending}
                  onClick={confirmRestore}
                >
                  Restaurar backup
                </Button>
              </Group>

              {selectedBackup && (
                <Text size="sm" c="dimmed">
                  Selecionado: {selectedBackup.name} | {bytesToHuman(selectedBackup.size)} |{" "}
                  {dayjs(selectedBackup.created_at).format("DD/MM/YYYY HH:mm")}
                </Text>
              )}

              {selectedValidation && (
                <Group>
                  <Badge color={selectedValidation.ok ? "green" : "red"} variant="light">
                    {selectedValidation.ok ? "VALIDO" : "INVALIDO"}
                  </Badge>
                  <Text size="sm" c="dimmed">
                    {selectedValidation.result}
                  </Text>
                </Group>
              )}
            </>
          )}
        </Stack>
      </Card>

      <Card withBorder>
        <Stack>
          <Title order={4}>Backups disponiveis</Title>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Nome</Table.Th>
                <Table.Th>Tamanho</Table.Th>
                <Table.Th>Data</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {backups.map((item) => (
                <Table.Tr key={item.name}>
                  <Table.Td>{item.name}</Table.Td>
                  <Table.Td>{bytesToHuman(item.size)}</Table.Td>
                  <Table.Td>{dayjs(item.created_at).format("DD/MM/YYYY HH:mm")}</Table.Td>
                </Table.Tr>
              ))}
              {backups.length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={3}>
                    <Text c="dimmed" ta="center">
                      Nenhum backup encontrado.
                    </Text>
                  </Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </Stack>
      </Card>
    </Stack>
  );
}
