import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Textarea,
  Switch,
  Table,
  Text,
  TextInput,
  Tabs,
  Title,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconTrash } from "@tabler/icons-react";
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
  CompareServerStatusOut,
  DownloadResponse,
  LocalShareServerOut,
  OfficialBaseApplyOut,
  OfficialBaseConfigIn,
  OfficialBaseDeleteOut,
  OfficialBaseHistoryItemOut,
  OfficialBasePublishOut,
  OfficialBaseRole,
  OfficialBaseStatusOut,
  RemoteShareStatusOut,
  SuccessResponse,
} from "../lib/api";
import { notifyError, notifySuccess } from "../lib/notify";
import { restartApplication } from "../lib/restartApp";

type BackupTabState = {
  activeSection: "locais" | "oficial" | "diagnostico";
  selectedBackupName: string | null;
  scrollY: number;
};

const BACKUP_TAB_ID = "backup";
const DEFAULT_BACKUP_TAB_STATE: BackupTabState = {
  activeSection: "locais",
  selectedBackupName: null,
  scrollY: 0,
};
const AUTO_SCHEDULE_MODE_OPTIONS = [
  { value: "DAILY", label: "Diario" },
  { value: "WEEKLY", label: "Semanal" },
] as const;
const AUTO_WEEKDAY_OPTIONS = [
  { value: "0", label: "Segunda-feira" },
  { value: "1", label: "Terca-feira" },
  { value: "2", label: "Quarta-feira" },
  { value: "3", label: "Quinta-feira" },
  { value: "4", label: "Sexta-feira" },
  { value: "5", label: "Sabado" },
  { value: "6", label: "Domingo" },
] as const;

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
  const [activeSection, setActiveSection] = useState<BackupTabState["activeSection"]>(persistedState.activeSection);
  const [selectedBackupName, setSelectedBackupName] = useState<string | null>(
    persistedState.selectedBackupName
  );
  const [selectedValidation, setSelectedValidation] = useState<BackupValidateOut | null>(null);
  const [scrollY, setScrollY] = useState(persistedState.scrollY);
  const [autoEnabledInput, setAutoEnabledInput] = useState<boolean | null>(null);
  const [autoHourInput, setAutoHourInput] = useState<number | null>(null);
  const [autoMinuteInput, setAutoMinuteInput] = useState<number | null>(null);
  const [autoRetentionInput, setAutoRetentionInput] = useState<string | null>(null);
  const [autoScheduleModeInput, setAutoScheduleModeInput] = useState<"DAILY" | "WEEKLY" | null>(null);
  const [autoWeekdayInput, setAutoWeekdayInput] = useState<string | null>(null);
  const [officialRoleInput, setOfficialRoleInput] = useState<OfficialBaseRole>("consumer");
  const [officialMachineLabelInput, setOfficialMachineLabelInput] = useState("");
  const [officialPublisherNameInput, setOfficialPublisherNameInput] = useState("");
  const [officialServerPortInput, setOfficialServerPortInput] = useState<number | null>(8765);
  const [officialRemoteServerUrlInput, setOfficialRemoteServerUrlInput] = useState("");
  const [officialNotesInput, setOfficialNotesInput] = useState("");
  const [remoteOfficialStatus, setRemoteOfficialStatus] = useState<RemoteShareStatusOut | null>(null);
  const [serverStatusRefreshUntil, setServerStatusRefreshUntil] = useState(0);

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

  const officialBaseStatusQuery = useQuery<SuccessResponse<OfficialBaseStatusOut>>({
    queryKey: ["official-base-status"],
    queryFn: ({ signal }) => api.officialBaseStatus({ signal }),
    refetchInterval: (query) => {
      if (activeSection !== "oficial") return false;
      const response = query.state.data as SuccessResponse<OfficialBaseStatusOut> | undefined;
      const status = response?.data;
      const shouldPoll =
        Boolean(status?.server_enabled) ||
        Boolean(status?.server_running) ||
        Date.now() < serverStatusRefreshUntil;
      return shouldPoll ? 5_000 : false;
    },
  });

  const officialBaseHistoryQuery = useQuery<SuccessResponse<OfficialBaseHistoryItemOut[]>>({
    queryKey: ["official-base-server-history"],
    queryFn: ({ signal }) => api.officialBaseServerHistory({ limit: 8 }, { signal }),
    enabled: true,
    staleTime: 30_000,
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
      setAutoScheduleModeInput(null);
      setAutoWeekdayInput(null);
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

  const officialBaseConfigMutation = useMutation<
    SuccessResponse<OfficialBaseStatusOut>,
    Error,
    OfficialBaseConfigIn
  >({
    mutationFn: (payload) => api.officialBaseUpdateConfig(payload),
    onSuccess: (response) => {
      notifySuccess("Configuracao da base oficial salva.");
      queryClient.setQueryData(["official-base-status"], response);
      queryClient.invalidateQueries({ queryKey: ["official-base-server-history"] });
    },
    onError: (error) => notifyError(error),
  });

  const officialBaseTestDirectoryMutation = useMutation<
    SuccessResponse<RemoteShareStatusOut>,
    Error,
    void
  >({
    mutationFn: () =>
      api.officialBaseServerRemoteStatus({ server_url: officialRemoteServerUrlInput.trim() || undefined }),
    onSuccess: (response) => {
      setRemoteOfficialStatus(response.data);
      notifySuccess(response.data.message);
    },
    onError: (error) => notifyError(error),
  });

  const officialBasePublishMutation = useMutation<
    SuccessResponse<OfficialBasePublishOut>,
    Error,
    { notes?: string | null }
  >({
    mutationFn: (payload) => api.officialBaseServerPublish(payload),
    onSuccess: (response) => {
      notifySuccess(`Base oficial publicada em ${dayjs(response.data.published_at).format("DD/MM/YYYY HH:mm")}.`);
      setOfficialNotesInput("");
      queryClient.invalidateQueries({ queryKey: ["official-base-status"] });
      queryClient.invalidateQueries({ queryKey: ["official-base-server-history"] });
    },
    onError: (error) => notifyError(error),
  });

  const officialBaseDeleteMutation = useMutation<
    SuccessResponse<OfficialBaseDeleteOut>,
    Error,
    { manifestPath?: string | null; deleteLatest?: boolean }
  >({
    mutationFn: (payload) =>
      api.officialBaseServerDeletePublication({
        manifest_path: payload.manifestPath ?? undefined,
        delete_latest: payload.deleteLatest ?? false,
      }),
    onSuccess: (response) => {
      notifySuccess(response.data.message);
      queryClient.invalidateQueries({ queryKey: ["official-base-status"] });
      queryClient.invalidateQueries({ queryKey: ["official-base-server-history"] });
    },
    onError: (error) => notifyError(error),
  });

  const officialBaseApplyMutation = useMutation<SuccessResponse<OfficialBaseApplyOut>, Error, void>({
    mutationFn: () =>
      api.officialBaseServerApply({ server_url: officialRemoteServerUrlInput.trim() || undefined }),
    onSuccess: async (response) => {
      notifySuccess("Base oficial aplicada com sucesso.");
      queryClient.invalidateQueries({ queryKey: ["official-base-status"] });
      queryClient.invalidateQueries({ queryKey: ["official-base-server-history"] });
      queryClient.invalidateQueries({ queryKey: ["backup-list"] });
      queryClient.invalidateQueries({ queryKey: ["backup-validate-current"] });
      if (!response.data.restart_required) return;

      try {
        await restartApplication();
      } catch (error) {
        notifyError(error, "Base aplicada. Reinicie o aplicativo manualmente para concluir.");
      }
    },
    onError: (error) => notifyError(error),
  });

  const patchServerStatusCache = useCallback(
    (payload: LocalShareServerOut) => {
      queryClient.setQueryData<SuccessResponse<OfficialBaseStatusOut>>(
        ["official-base-status"],
        (current) =>
          current
            ? {
                ...current,
                data: {
                  ...current.data,
                  server_enabled: payload.enabled,
                  server_running: payload.running,
                  server_port: payload.port,
                  server_urls: payload.urls,
                  machine_label: payload.machine_label || current.data.machine_label,
                  publisher_name: payload.publisher_name ?? current.data.publisher_name,
                },
              }
            : current
      );

      queryClient.setQueryData<SuccessResponse<CompareServerStatusOut>>(
        ["compare-server-status"],
        (current) =>
          current
            ? {
                ...current,
                data: {
                  ...current.data,
                  server_running: payload.running,
                  server_port: payload.port,
                  server_urls: payload.urls,
                  machine_label: payload.machine_label || current.data.machine_label,
                },
              }
            : current
      );
    },
    [queryClient]
  );

  const confirmServerStatus = useCallback(
    async (expectedRunning: boolean) => {
      const refreshed = await officialBaseStatusQuery.refetch();
      await queryClient.invalidateQueries({ queryKey: ["compare-server-status"] });
      const running = Boolean(refreshed.data?.data?.server_running);
      if (running !== expectedRunning) {
        notifyError(
          new Error(
            expectedRunning
              ? "Servidor nao confirmou inicializacao. Verifique a porta ou o firewall."
              : "Servidor ainda aparece ativo. Aguarde alguns segundos ou verifique se o processo foi encerrado."
          )
        );
        return false;
      }
      return true;
    },
    [officialBaseStatusQuery, queryClient]
  );

  const officialBaseServerStartMutation = useMutation<SuccessResponse<LocalShareServerOut>, Error, void>({
    mutationFn: () => api.officialBaseServerStart(),
    onSuccess: async (response) => {
      patchServerStatusCache(response.data);
      const confirmed = await confirmServerStatus(true);
      if (confirmed) {
        notifySuccess("Servidor local iniciado.");
      }
    },
    onError: (error) => notifyError(error),
  });

  const officialBaseServerStopMutation = useMutation<SuccessResponse<LocalShareServerOut>, Error, void>({
    mutationFn: () => api.officialBaseServerStop(),
    onSuccess: async (response) => {
      patchServerStatusCache(response.data);
      const confirmed = await confirmServerStatus(false);
      if (confirmed) {
        notifySuccess("Servidor local parado.");
      }
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
  const officialBaseStatus = officialBaseStatusQuery.data?.data;
  const autoEnabled = autoEnabledInput ?? Boolean(autoConfig?.enabled ?? false);
  const autoHour = autoHourInput ?? Number(autoConfig?.hour ?? 18);
  const autoMinute = autoMinuteInput ?? Number(autoConfig?.minute ?? 0);
  const autoRetention = autoRetentionInput ?? String(autoConfig?.retention_days ?? 15);
  const autoScheduleMode = autoScheduleModeInput ?? autoConfig?.schedule_mode ?? "DAILY";
  const autoWeekday = autoWeekdayInput ?? String(autoConfig?.weekday ?? 0);
  const latestOfficialManifest = officialBaseStatus?.server_latest_manifest;
  const officialBaseHistory = officialBaseHistoryQuery.data?.data ?? [];
  const serverToggleBusy = officialBaseServerStartMutation.isPending || officialBaseServerStopMutation.isPending;
  const serverIsRunning = Boolean(officialBaseStatus?.server_running);
  const serverSwitchLabel = officialBaseServerStartMutation.isPending
    ? "Ligando servidor..."
    : officialBaseServerStopMutation.isPending
      ? "Desligando servidor..."
      : "Servidor local";

  useEffect(() => {
    if (!officialBaseStatus) return;
    setOfficialRoleInput(officialBaseStatus.role);
    setOfficialMachineLabelInput(officialBaseStatus.machine_label || "");
    setOfficialPublisherNameInput(officialBaseStatus.publisher_name || "");
    setOfficialServerPortInput(officialBaseStatus.server_port ?? 8765);
    setOfficialRemoteServerUrlInput(officialBaseStatus.remote_server_url || "");
  }, [
    officialBaseStatus?.role,
    officialBaseStatus?.machine_label,
    officialBaseStatus?.publisher_name,
    officialBaseStatus?.server_port,
    officialBaseStatus?.remote_server_url,
  ]);

  const persistState = useCallback(
    (nextScrollY = scrollY) => {
      saveTabState<BackupTabState>(BACKUP_TAB_ID, {
        activeSection,
        selectedBackupName,
        scrollY: nextScrollY,
      });
    },
    [activeSection, scrollY, selectedBackupName]
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
      schedule_mode: autoScheduleMode,
      weekday: Number(autoWeekday),
    });
  };

  const saveOfficialBaseConfig = () => {
    officialBaseConfigMutation.mutate({
      role: officialRoleInput,
      official_base_dir: officialBaseStatus?.official_base_dir ?? null,
      machine_label: officialMachineLabelInput.trim() || null,
      publisher_name: officialPublisherNameInput.trim() || null,
      server_port: officialServerPortInput ?? undefined,
      remote_server_url: officialRemoteServerUrlInput.trim() || null,
      server_enabled: officialBaseStatus?.server_enabled ?? false,
    });
  };

  const toggleLocalServer = (nextChecked: boolean) => {
    setServerStatusRefreshUntil(Date.now() + 15_000);
    if (nextChecked) {
      officialBaseServerStartMutation.mutate();
      return;
    }
    officialBaseServerStopMutation.mutate();
  };

  const confirmPublishOfficialBase = () => {
    modals.openConfirmModal({
      title: "Publicar base oficial",
      children: (
        <Text size="sm">
          Esta operacao vai gerar uma copia oficial da base atual e deixar essa base disponivel no servidor local desta
          maquina. Use isso somente na maquina que representa a fonte oficial do estoque.
        </Text>
      ),
      labels: { confirm: "Publicar agora", cancel: "Cancelar" },
      onConfirm: () =>
        officialBasePublishMutation.mutate({
          notes: officialNotesInput.trim() || undefined,
        }),
    });
  };

  const confirmApplyOfficialBase = () => {
    modals.openConfirmModal({
      title: "Atualizar minha base local",
      children: (
        <Text size="sm">
          O sistema vai criar um backup automatico do banco atual, baixar a base oficial do servidor remoto informado
          e reiniciar o aplicativo ao final.
        </Text>
      ),
      labels: { confirm: "Atualizar base", cancel: "Cancelar" },
      confirmProps: { color: "orange" },
      onConfirm: () => officialBaseApplyMutation.mutate(),
    });
  };

  const confirmDeleteLatestOfficialBase = () => {
    modals.openConfirmModal({
      title: "Excluir base oficial atual",
      children: (
        <Text size="sm">
          Isso vai remover a base oficial mais recente publicada neste servidor local. Os snapshots do historico
          continuam existentes, mas os outros computadores nao vao mais encontrar uma base atual para baixar.
        </Text>
      ),
      labels: { confirm: "Excluir base atual", cancel: "Cancelar" },
      confirmProps: { color: "red" },
      onConfirm: () => officialBaseDeleteMutation.mutate({ deleteLatest: true }),
    });
  };

  const confirmDeleteOfficialBaseHistoryItem = (item: OfficialBaseHistoryItemOut) => {
    modals.openConfirmModal({
      title: "Excluir publicacao historica",
      children: (
        <Text size="sm">
          Isso vai remover este snapshot do historico publicado em{" "}
          {dayjs(item.manifest.published_at).format("DD/MM/YYYY HH:mm")}. Essa acao nao altera a base local ativa.
        </Text>
      ),
      labels: { confirm: "Excluir snapshot", cancel: "Cancelar" },
      confirmProps: { color: "red" },
      onConfirm: () => officialBaseDeleteMutation.mutate({ manifestPath: item.manifest_path }),
    });
  };

  return (
    <Stack gap="lg">
      <PageHeader
        title="Backup"
        subtitle="Rotinas de seguranca, validacao de integridade e restauracao assistida."
        actions={(
          <Button onClick={() => backupMutation.mutate()} loading={backupMutation.isPending}>
            Criar backup
          </Button>
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

      <Tabs value={activeSection} onChange={(value) => setActiveSection((value as BackupTabState["activeSection"]) || "locais")}>
        <Tabs.List>
          <Tabs.Tab value="locais">Backups locais</Tabs.Tab>
          <Tabs.Tab value="oficial">Base oficial</Tabs.Tab>
          <Tabs.Tab value="diagnostico">Diagnostico</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="oficial" pt="md">

      <Card withBorder>
        <Stack>
          <Title order={4}>Base oficial compartilhada</Title>
          {officialBaseStatusQuery.isLoading ? (
            <Loader size="sm" />
          ) : officialBaseStatusQuery.error instanceof Error ? (
            <EmptyState
              message={officialBaseStatusQuery.error.message}
              actionLabel="Tentar novamente"
              onAction={() => void officialBaseStatusQuery.refetch()}
            />
          ) : (
            <>
              <Alert color={officialBaseStatus?.server_running ? "blue" : "orange"} variant="light">
                {officialBaseStatus?.server_running
                  ? "Servidor local ativo. Quem estiver na rede pode usar o endereco abaixo para baixar a base oficial ou comparar snapshots."
                  : "Ligue o servidor local desta maquina para distribuir a base oficial sem depender de pasta compartilhada."}
              </Alert>

              <Group gap="sm" wrap="wrap">
                <Badge variant="light" color={officialBaseStatus?.role === "publisher" ? "blue" : "gray"}>
                  Papel: {officialBaseStatus?.role === "publisher" ? "Publisher" : "Consumer"}
                </Badge>
                <Badge variant="light" color={officialBaseStatus?.server_running ? "green" : "orange"}>
                  Servidor {officialBaseStatus?.server_running ? "ativo" : "parado"}
                </Badge>
                <Badge variant="light" color={officialBaseStatus?.server_latest_available ? "green" : "gray"}>
                  {officialBaseStatus?.server_latest_available ? "Base oficial local publicada" : "Sem base oficial local"}
                </Badge>
                <Badge variant="light" color={officialBaseStatus?.remote_server_url ? "indigo" : "gray"}>
                  {officialBaseStatus?.remote_server_url ? "Servidor remoto configurado" : "Sem servidor remoto"}
                </Badge>
                {officialBaseStatus?.app_compatible_with_server_latest === false && (
                  <Badge variant="light" color="red">
                    App local incompativel com a ultima base
                  </Badge>
                )}
              </Group>

              <Group align="end" wrap="wrap">
                <Select
                  label="Papel desta maquina"
                  data={[
                    { value: "consumer", label: "Consumer" },
                    { value: "publisher", label: "Publisher" },
                  ]}
                  value={officialRoleInput}
                  onChange={(value) => setOfficialRoleInput((value as OfficialBaseRole) || "consumer")}
                  w={160}
                  allowDeselect={false}
                />
                <TextInput
                  label="Identificacao da maquina"
                  value={officialMachineLabelInput}
                  onChange={(event) => setOfficialMachineLabelInput(event.currentTarget.value)}
                  w={220}
                />
                <TextInput
                  label="Nome do publicador"
                  value={officialPublisherNameInput}
                  onChange={(event) => setOfficialPublisherNameInput(event.currentTarget.value)}
                  w={220}
                />
                <NumberInput
                  label="Porta do servidor"
                  value={officialServerPortInput ?? undefined}
                  onChange={(value) => setOfficialServerPortInput(typeof value === "number" ? value : null)}
                  min={1024}
                  max={65535}
                  w={160}
                />
                <TextInput
                  label="Servidor remoto"
                  placeholder="http://192.168.0.15:8765"
                  value={officialRemoteServerUrlInput}
                  onChange={(event) => setOfficialRemoteServerUrlInput(event.currentTarget.value)}
                  w={320}
                />
                <Button onClick={saveOfficialBaseConfig} loading={officialBaseConfigMutation.isPending}>
                  Salvar configuracao
                </Button>
                <Switch
                  label={serverSwitchLabel}
                  description={serverIsRunning ? "Servidor ativo nesta maquina" : "Servidor parado nesta maquina"}
                  checked={serverIsRunning}
                  onChange={(event) => toggleLocalServer(event.currentTarget.checked)}
                  disabled={serverToggleBusy}
                  size="md"
                  onLabel="ON"
                  offLabel="OFF"
                />
                <Button
                  variant="light"
                  onClick={() => officialBaseTestDirectoryMutation.mutate()}
                  loading={officialBaseTestDirectoryMutation.isPending}
                  disabled={!officialRemoteServerUrlInput.trim()}
                >
                  Testar servidor remoto
                </Button>
              </Group>

              <Text size="sm" c="dimmed">
                Config local: {officialBaseStatus?.config_path || "-"}
              </Text>

              {officialBaseStatus?.server_urls?.length ? (
                <Alert
                  color={officialBaseStatus?.server_running ? "green" : "gray"}
                  variant="light"
                >
                  <Stack gap={4}>
                    <Text size="sm">
                      Enderecos desta maquina: {officialBaseStatus.server_urls.join(" | ")}
                    </Text>
                  </Stack>
                </Alert>
              ) : null}

              {remoteOfficialStatus && (
                <Alert color={remoteOfficialStatus.official_available ? "green" : "orange"} variant="light">
                  <Stack gap={4}>
                    <Text size="sm">{remoteOfficialStatus.message}</Text>
                    <Text size="sm">
                      Servidor: {remoteOfficialStatus.server_url} | Maquina: {remoteOfficialStatus.machine_label || "-"}
                    </Text>
                    {remoteOfficialStatus.official_manifest && (
                      <Text size="sm">
                        Base remota: {dayjs(remoteOfficialStatus.official_manifest.published_at).format("DD/MM/YYYY HH:mm")} | Produtos:{" "}
                        {remoteOfficialStatus.official_manifest.products_count ?? 0}
                      </Text>
                    )}
                  </Stack>
                </Alert>
              )}

              <Card withBorder bg="var(--surface-muted)">
                <Stack gap="xs">
                  <Text fw={600}>Base ativa desta maquina</Text>
                  <Text size="sm">Banco em uso: {officialBaseStatus?.current_database_path || "-"}</Text>
                  <Group gap="sm" wrap="wrap">
                    <Badge variant="light" color="blue">
                      Produtos: {officialBaseStatus?.current_products_count ?? 0}
                    </Badge>
                    <Badge variant="light" color="teal">
                      Com estoque: {officialBaseStatus?.current_products_with_stock_count ?? 0}
                    </Badge>
                    <Badge variant="light" color="grape">
                      Movimentacoes: {officialBaseStatus?.current_movements_count ?? 0}
                    </Badge>
                    <Badge variant="light" color="gray">
                      Tamanho: {bytesToHuman(officialBaseStatus?.current_database_size ?? 0)}
                    </Badge>
                  </Group>
                  {(officialBaseStatus?.current_products_count ?? 0) === 0 && (
                    <Alert color="red" variant="light">
                      Esta base esta vazia. Se voce publicar agora, vai distribuir um estoque zerado.
                      Se estiver em modo dev, confirme se o app esta apontando para o banco certo antes de publicar.
                    </Alert>
                  )}
                </Stack>
              </Card>

              {latestOfficialManifest ? (
                <Card withBorder bg="var(--surface-muted)">
                  <Stack gap="xs">
                    <Group justify="space-between" wrap="wrap">
                  <Text fw={600}>Ultima base publicada neste servidor</Text>
                      <Group gap="xs">
                        <Text size="sm" c="dimmed">
                          {dayjs(latestOfficialManifest.published_at).format("DD/MM/YYYY HH:mm")}
                        </Text>
                        {officialRoleInput === "publisher" && (
                          <Button
                            size="xs"
                            color="red"
                            variant="light"
                            onClick={confirmDeleteLatestOfficialBase}
                            loading={officialBaseDeleteMutation.isPending}
                          >
                            Excluir base atual
                          </Button>
                        )}
                      </Group>
                    </Group>
                    <Text size="sm">
                      Publicada por: {latestOfficialManifest.publisher_name || latestOfficialManifest.publisher_machine}
                    </Text>
                    <Text size="sm">
                      App minimo: {latestOfficialManifest.min_app_version} | Banco: {latestOfficialManifest.db_version}
                    </Text>
                    <Text size="sm">Notas: {latestOfficialManifest.notes || "Sem observacoes."}</Text>
                    <Group gap="sm" wrap="wrap">
                      <Badge variant="light" color="blue">
                        Produtos: {latestOfficialManifest.products_count ?? 0}
                      </Badge>
                      <Badge variant="light" color="teal">
                        Com estoque: {latestOfficialManifest.products_with_stock_count ?? 0}
                      </Badge>
                      <Badge variant="light" color="grape">
                        Movimentacoes: {latestOfficialManifest.movements_count ?? 0}
                      </Badge>
                      <Badge variant="light" color="gray">
                        Tamanho: {bytesToHuman(latestOfficialManifest.database_size ?? 0)}
                      </Badge>
                    </Group>
                  </Stack>
                </Card>
              ) : (
                <Text size="sm" c="dimmed">
                  Nenhuma base oficial publicada neste servidor ainda.
                </Text>
              )}

              {latestOfficialManifest && (
                <SimpleGrid cols={{ base: 1, md: 2 }}>
                  <Card withBorder>
                    <Stack gap={4}>
                      <Text fw={600}>Comparativo rapido</Text>
                      <Text size="sm">
                        Produtos locais: {officialBaseStatus?.current_products_count ?? 0} | publicados:{" "}
                        {latestOfficialManifest.products_count ?? 0}
                      </Text>
                      <Text size="sm">
                        Com estoque local: {officialBaseStatus?.current_products_with_stock_count ?? 0} | publicados:{" "}
                        {latestOfficialManifest.products_with_stock_count ?? 0}
                      </Text>
                      <Text size="sm">
                        Movimentacoes locais: {officialBaseStatus?.current_movements_count ?? 0} | publicadas:{" "}
                        {latestOfficialManifest.movements_count ?? 0}
                      </Text>
                    </Stack>
                  </Card>
                  <Card withBorder>
                    <Stack gap={4}>
                      <Text fw={600}>Leitura operacional</Text>
                      <Text size="sm">
                        Se estes numeros divergirem muito, confira antes de publicar ou aplicar a base.
                      </Text>
                      <Text size="sm" c="dimmed">
                        Isso ajuda a evitar sobrescrever o colega com uma base errada ou desatualizada.
                      </Text>
                    </Stack>
                  </Card>
                </SimpleGrid>
              )}

              {officialRoleInput === "publisher" && (
                <Textarea
                  label="Observacao da publicacao"
                  placeholder="Ex: base conferida apos inventario de Canoas"
                  minRows={2}
                  value={officialNotesInput}
                  onChange={(event) => setOfficialNotesInput(event.currentTarget.value)}
                />
              )}

              <Group>
                {officialRoleInput === "publisher" && (
                  <Button
                    onClick={confirmPublishOfficialBase}
                    loading={officialBasePublishMutation.isPending}
                    disabled={(officialBaseStatus?.current_products_count ?? 0) === 0}
                  >
                    Publicar base oficial neste servidor
                  </Button>
                )}
                <Button
                  variant="light"
                  color="orange"
                  onClick={confirmApplyOfficialBase}
                  loading={officialBaseApplyMutation.isPending}
                  disabled={!officialRemoteServerUrlInput.trim()}
                >
                  Baixar base oficial do servidor remoto
                </Button>
              </Group>

              <Card withBorder>
                <Stack gap="sm">
                  <Group justify="space-between" wrap="wrap">
                    <Text fw={600}>Historico recente de publicacoes</Text>
                    {officialBaseHistoryQuery.isFetching && <Loader size="xs" />}
                  </Group>
                  {officialBaseHistory.length === 0 ? (
                    <Text size="sm" c="dimmed">
                      Nenhuma publicacao historica encontrada no servidor local.
                    </Text>
                  ) : (
                    <DataTable minWidth={880}>
                      <Table striped highlightOnHover withTableBorder>
                        <Table.Thead>
                          <Table.Tr>
                            <Table.Th>Publicado em</Table.Th>
                            <Table.Th>Origem</Table.Th>
                            <Table.Th>App</Table.Th>
                            <Table.Th>Produtos</Table.Th>
                            <Table.Th>Movs</Table.Th>
                            <Table.Th>Notas</Table.Th>
                            <Table.Th>Acoes</Table.Th>
                          </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                          {officialBaseHistory.map((item) => (
                            <Table.Tr key={item.manifest_path}>
                              <Table.Td>{dayjs(item.manifest.published_at).format("DD/MM/YYYY HH:mm")}</Table.Td>
                              <Table.Td>{item.manifest.publisher_name || item.manifest.publisher_machine}</Table.Td>
                              <Table.Td>{item.manifest.app_version}</Table.Td>
                              <Table.Td>{item.manifest.products_count ?? "-"}</Table.Td>
                              <Table.Td>{item.manifest.movements_count ?? "-"}</Table.Td>
                              <Table.Td>{item.manifest.notes || "-"}</Table.Td>
                              <Table.Td>
                                {officialRoleInput === "publisher" ? (
                                  <ActionIcon
                                    color="red"
                                    variant="light"
                                    onClick={() => confirmDeleteOfficialBaseHistoryItem(item)}
                                    loading={officialBaseDeleteMutation.isPending}
                                    aria-label="Excluir publicacao"
                                  >
                                    <IconTrash size={16} />
                                  </ActionIcon>
                                ) : (
                                  "-"
                                )}
                              </Table.Td>
                            </Table.Tr>
                          ))}
                        </Table.Tbody>
                      </Table>
                    </DataTable>
                  )}
                </Stack>
              </Card>
            </>
          )}
        </Stack>
      </Card>

        </Tabs.Panel>
        <Tabs.Panel value="locais" pt="md">

      <Card withBorder>
        <Stack>
          <Title order={4}>Backup automatico agendado</Title>
          {autoConfigQuery.isLoading ? (
            <Loader size="sm" />
          ) : (
            <>
              <Group align="end" wrap="wrap">
                <Switch
                  label="Ativar backup automatico"
                  checked={autoEnabled}
                  onChange={(event) => setAutoEnabledInput(event.currentTarget.checked)}
                />
                <Select
                  label="Frequencia"
                  data={AUTO_SCHEDULE_MODE_OPTIONS.map((item) => ({ value: item.value, label: item.label }))}
                  value={autoScheduleMode}
                  onChange={(value) => setAutoScheduleModeInput((value as "DAILY" | "WEEKLY") || "DAILY")}
                  w={150}
                  allowDeselect={false}
                />
                <Select
                  label="Dia da semana"
                  data={AUTO_WEEKDAY_OPTIONS.map((item) => ({ value: item.value, label: item.label }))}
                  value={autoWeekday}
                  onChange={(value) => setAutoWeekdayInput(value || "0")}
                  w={170}
                  disabled={autoScheduleMode !== "WEEKLY"}
                  allowDeselect={false}
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
                  Frequencia: {autoConfigQuery.data.data.schedule_mode === "WEEKLY" ? "semanal" : "diaria"}
                  {autoConfigQuery.data.data.schedule_mode === "WEEKLY"
                    ? ` (${AUTO_WEEKDAY_OPTIONS[autoConfigQuery.data.data.weekday]?.label || "Segunda-feira"})`
                    : ""}
                  {" | "}
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

        </Tabs.Panel>
        <Tabs.Panel value="diagnostico" pt="md">
          <Stack gap="lg">
            <Card withBorder>
              <Stack gap="md">
                <Title order={4}>Diagnostico e suporte</Title>
                <Text size="sm" c="dimmed">
                  Gere um pacote tecnico para suporte e use o restore pre-update quando uma atualizacao nao sobe corretamente.
                </Text>
                <Group>
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
                </Group>
              </Stack>
            </Card>

            <Card withBorder>
              <Stack gap="xs">
                <Title order={4}>Quando usar</Title>
                <Text size="sm" c="dimmed">
                  `Exportar diagnostico` ajuda a enviar logs e informacoes do ambiente para suporte. `Restaurar pre-update` funciona como rollback rapido depois de uma atualizacao com problema.
                </Text>
              </Stack>
            </Card>
          </Stack>
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
