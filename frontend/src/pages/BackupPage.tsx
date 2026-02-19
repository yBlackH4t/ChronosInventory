import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Card,
  Group,
  Loader,
  NumberInput,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";

import { api } from "../lib/apiClient";
import DataTable from "../components/ui/DataTable";
import EmptyState from "../components/ui/EmptyState";
import PageHeader from "../components/ui/PageHeader";
import { downloadBlob } from "../lib/download";
import { loadTabState, saveTabState } from "../state/tabStateCache";
import type {
  BackupListItemOut,
  BackupOut,
  BackupAutoConfigOut,
  BackupAutoConfigIn,
  BackupRestoreOut,
  BackupRestoreTestOut,
  BackupValidateOut,
  DownloadResponse,
  SuccessResponse,
} from "../lib/api";
import { notifyError, notifySuccess } from "../lib/notify";

type BackupTabState = {
  selectedBackupName: string | null;
  scrollY: number;
};

const BACKUP_TAB_ID = "backup";
const DEFAULT_BACKUP_TAB_STATE: BackupTabState = {
  selectedBackupName: null,
  scrollY: 0,
};

function bytesToHuman(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function BackupPage() {
  const persistedState = useMemo(
    () => loadTabState<BackupTabState>(BACKUP_TAB_ID) ?? DEFAULT_BACKUP_TAB_STATE,
    []
  );
  const queryClient = useQueryClient();
  const [selectedBackupName, setSelectedBackupName] = useState<string | null>(
    persistedState.selectedBackupName
  );
  const [selectedValidation, setSelectedValidation] = useState<BackupValidateOut | null>(null);
  const [scrollY, setScrollY] = useState(persistedState.scrollY);
  const [autoEnabledInput, setAutoEnabledInput] = useState<boolean | null>(null);
  const [autoHourInput, setAutoHourInput] = useState<number | null>(null);
  const [autoMinuteInput, setAutoMinuteInput] = useState<number | null>(null);
  const [autoRetentionInput, setAutoRetentionInput] = useState<string | null>(null);

  const backupsQuery = useQuery<SuccessResponse<BackupListItemOut[]>>({
    queryKey: ["backup-list"],
    queryFn: ({ signal }) => api.backupList({ signal }),
  });

  const validateCurrentQuery = useQuery<SuccessResponse<BackupValidateOut>>({
    queryKey: ["backup-validate-current"],
    queryFn: ({ signal }) => api.backupValidate(undefined, { signal }),
  });

  const autoConfigQuery = useQuery<SuccessResponse<BackupAutoConfigOut>>({
    queryKey: ["backup-auto-config"],
    queryFn: ({ signal }) => api.backupAutoConfig({ signal }),
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

  const restorePreUpdateMutation = useMutation<SuccessResponse<BackupRestoreOut>, Error, void>({
    mutationFn: () => api.backupRestorePreUpdate(),
    onSuccess: () => {
      notifySuccess("Backup pre-update restaurado com sucesso");
      queryClient.invalidateQueries({ queryKey: ["backup-list"] });
      queryClient.invalidateQueries({ queryKey: ["backup-validate-current"] });
    },
    onError: (error) => notifyError(error),
  });

  const restoreTestMutation = useMutation<
    SuccessResponse<BackupRestoreTestOut>,
    Error,
    string | null | undefined
  >({
    mutationFn: (backupName) => api.backupRestoreTest({ backup_name: backupName ?? undefined }),
    onSuccess: (response) => {
      if (response.data.ok) {
        notifySuccess("Teste de restauracao concluido com sucesso");
      } else {
        notifyError(new Error(`Teste de restauracao falhou: ${response.data.integrity_result}`));
      }
    },
    onError: (error) => notifyError(error),
  });

  const updateAutoConfigMutation = useMutation<
    SuccessResponse<BackupAutoConfigOut>,
    Error,
    BackupAutoConfigIn
  >({
    mutationFn: (payload) => api.backupUpdateAutoConfig(payload),
    onSuccess: (response) => {
      notifySuccess("Configuracao de backup automatico atualizada");
      queryClient.setQueryData(["backup-auto-config"], response);
      setAutoEnabledInput(null);
      setAutoHourInput(null);
      setAutoMinuteInput(null);
      setAutoRetentionInput(null);
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

  const backups = useMemo(() => backupsQuery.data?.data ?? [], [backupsQuery.data?.data]);
  const backupOptions = useMemo(
    () => backups.map((item) => ({ value: item.name, label: `${item.name} (${bytesToHuman(item.size)})` })),
    [backups]
  );

  const effectiveSelectedBackupName = useMemo(() => {
    if (selectedBackupName && backups.some((item) => item.name === selectedBackupName)) {
      return selectedBackupName;
    }
    return backups[0]?.name ?? null;
  }, [backups, selectedBackupName]);

  const selectedBackup = backups.find((item) => item.name === effectiveSelectedBackupName) || null;
  const currentValidation = validateCurrentQuery.data?.data;
  const autoConfig = autoConfigQuery.data?.data;
  const autoEnabled = autoEnabledInput ?? Boolean(autoConfig?.enabled ?? false);
  const autoHour = autoHourInput ?? Number(autoConfig?.hour ?? 18);
  const autoMinute = autoMinuteInput ?? Number(autoConfig?.minute ?? 0);
  const autoRetention = autoRetentionInput ?? String(autoConfig?.retention_days ?? 15);

  const persistState = useCallback(
    (nextScrollY = scrollY) => {
      saveTabState<BackupTabState>(BACKUP_TAB_ID, {
        selectedBackupName,
        scrollY: nextScrollY,
      });
    },
    [scrollY, selectedBackupName]
  );

  useEffect(() => {
    persistState();
  }, [persistState]);

  useEffect(() => {
    if (!persistedState.scrollY || persistedState.scrollY <= 0) return;
    const timer = window.setTimeout(() => {
      window.scrollTo({ top: persistedState.scrollY, behavior: "auto" });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [persistedState.scrollY]);

  useEffect(() => {
    let timeout: number | null = null;
    const onScroll = () => {
      if (timeout !== null) return;
      timeout = window.setTimeout(() => {
        setScrollY(window.scrollY);
        timeout = null;
      }, 180);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      if (timeout !== null) window.clearTimeout(timeout);
      window.removeEventListener("scroll", onScroll);
      persistState(window.scrollY);
    };
  }, [persistState]);

  const confirmRestore = () => {
    if (!effectiveSelectedBackupName) return;
    modals.openConfirmModal({
      title: "Restaurar backup",
      children: (
        <Text size="sm">
          Esta operacao vai substituir o banco atual pelo backup selecionado ({effectiveSelectedBackupName}). O sistema cria
          um backup de seguranca automaticamente antes da restauracao.
        </Text>
      ),
      labels: { confirm: "Restaurar agora", cancel: "Cancelar" },
      confirmProps: { color: "red" },
      onConfirm: () => restoreMutation.mutate(effectiveSelectedBackupName),
    });
  };

  const saveAutoConfig = () => {
    updateAutoConfigMutation.mutate({
      enabled: autoEnabled,
      hour: Number(autoHour ?? 0),
      minute: Number(autoMinute ?? 0),
      retention_days: Number(autoRetention),
    });
  };

  return (
    <Stack gap="lg">
      <PageHeader
        title="Backup"
        subtitle="Rotinas de seguranca, validacao de integridade e restauracao assistida."
        actions={(
          <>
            <Button
              variant="light"
              onClick={() => diagnosticsMutation.mutate()}
              loading={diagnosticsMutation.isPending}
            >
              Exportar diagnostico
            </Button>
            <Button
              variant="light"
              color="orange"
              onClick={() => restorePreUpdateMutation.mutate()}
              loading={restorePreUpdateMutation.isPending}
            >
              Restaurar pre-update
            </Button>
            <Button onClick={() => backupMutation.mutate()} loading={backupMutation.isPending}>
              Criar backup
            </Button>
          </>
        )}
      />

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
          <Title order={4}>Backup automatico agendado</Title>
          {autoConfigQuery.isLoading ? (
            <Loader size="sm" />
          ) : (
            <>
              <Group align="end" wrap="wrap">
                <Switch
                  label="Ativar backup diario"
                  checked={autoEnabled}
                  onChange={(event) => setAutoEnabledInput(event.currentTarget.checked)}
                />
                <NumberInput
                  label="Hora"
                  min={0}
                  max={23}
                  w={100}
                  value={autoHour}
                  onChange={(value) => setAutoHourInput(Number(value ?? 0))}
                />
                <NumberInput
                  label="Minuto"
                  min={0}
                  max={59}
                  w={100}
                  value={autoMinute}
                  onChange={(value) => setAutoMinuteInput(Number(value ?? 0))}
                />
                <Select
                  label="Retencao"
                  data={[
                    { value: "7", label: "7 dias" },
                    { value: "15", label: "15 dias" },
                    { value: "30", label: "30 dias" },
                  ]}
                  value={autoRetention}
                  onChange={(value) => setAutoRetentionInput(value || "15")}
                  w={140}
                />
                <Button onClick={saveAutoConfig} loading={updateAutoConfigMutation.isPending}>
                  Salvar agendamento
                </Button>
              </Group>

              {autoConfigQuery.data?.data && (
                <Text size="sm" c="dimmed">
                  Ultima execucao: {autoConfigQuery.data.data.last_run_date || "nunca"} | Resultado:{" "}
                  {autoConfigQuery.data.data.last_result || "sem execucoes"} | Ultimo arquivo:{" "}
                  {autoConfigQuery.data.data.last_backup_name || "-"}
                </Text>
              )}
            </>
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
                value={effectiveSelectedBackupName}
                onChange={(value) => {
                  setSelectedBackupName(value);
                  setSelectedValidation(null);
                }}
                searchable
              />

              <Group>
                <Button
                  variant="light"
                  disabled={!effectiveSelectedBackupName}
                  loading={validateSelectedMutation.isPending}
                  onClick={() =>
                    effectiveSelectedBackupName &&
                    validateSelectedMutation.mutate(effectiveSelectedBackupName)
                  }
                >
                  Validar backup selecionado
                </Button>
                <Button
                  variant="light"
                  disabled={!effectiveSelectedBackupName}
                  loading={restoreTestMutation.isPending}
                  onClick={() => restoreTestMutation.mutate(effectiveSelectedBackupName)}
                >
                  Testar restauracao
                </Button>
                <Button
                  color="red"
                  disabled={!effectiveSelectedBackupName}
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
          <DataTable minWidth={720}>
            <Table striped highlightOnHover withTableBorder>
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
                      <EmptyState message="Nenhum backup encontrado." />
                    </Table.Td>
                  </Table.Tr>
                )}
              </Table.Tbody>
            </Table>
          </DataTable>
        </Stack>
      </Card>
    </Stack>
  );
}
