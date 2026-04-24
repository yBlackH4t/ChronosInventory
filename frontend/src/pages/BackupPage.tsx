import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Stack,
  Text,
  Tabs,
  Title,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";

import { api } from "../lib/apiClient";
import { BackupDiagnosticsSection } from "../components/backup/BackupDiagnosticsSection";
import { LocalBackupsSection } from "../components/backup/LocalBackupsSection";
import PageHeader from "../components/ui/PageHeader";
import { OfficialBaseSection } from "../components/backup/OfficialBaseSection";
import { useBackupAutoConfig } from "../hooks/useBackupAutoConfig";
import { downloadBlob } from "../lib/download";
import { loadTabState, saveTabState } from "../state/tabStateCache";
import type {
  BackupListItemOut,
  BackupOut,
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
  const [officialRoleInput, setOfficialRoleInput] = useState<OfficialBaseRole>("consumer");
  const [officialMachineLabelInput, setOfficialMachineLabelInput] = useState("");
  const [officialPublisherNameInput, setOfficialPublisherNameInput] = useState("");
  const [officialServerPortInput, setOfficialServerPortInput] = useState<number | null>(8765);
  const [officialRemoteServerUrlInput, setOfficialRemoteServerUrlInput] = useState("");
  const [officialNotesInput, setOfficialNotesInput] = useState("");
  const [remoteOfficialStatus, setRemoteOfficialStatus] = useState<RemoteShareStatusOut | null>(null);
  const [serverStatusRefreshUntil, setServerStatusRefreshUntil] = useState(0);
  const {
    autoConfig,
    autoConfigLoading,
    autoEnabled,
    setAutoEnabledInput,
    autoHour,
    setAutoHourInput,
    autoMinute,
    setAutoMinuteInput,
    autoRetention,
    setAutoRetentionInput,
    autoScheduleMode,
    setAutoScheduleModeInput,
    autoWeekday,
    setAutoWeekdayInput,
    scheduleOptions,
    weekdayOptions,
    saveAutoConfig,
    saveAutoConfigLoading,
  } = useBackupAutoConfig();

  const backupsQuery = useQuery<SuccessResponse<BackupListItemOut[]>>({
    queryKey: ["backup-list"],
    queryFn: ({ signal }) => api.backupList({ signal }),
  });

  const validateCurrentQuery = useQuery<SuccessResponse<BackupValidateOut>>({
    queryKey: ["backup-validate-current"],
    queryFn: ({ signal }) => api.backupValidate(undefined, { signal }),
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
              ? `Servidor nao confirmou inicializacao. Verifique se a porta ${refreshed.data?.data?.server_port ?? officialServerPortInput ?? 8765} esta livre e se o firewall permitiu o acesso local.`
              : "Servidor ainda aparece ativo. Aguarde alguns segundos e, se persistir, verifique se o processo foi encerrado corretamente."
          )
        );
        return false;
      }
      return true;
    },
    [officialBaseStatusQuery, officialServerPortInput, queryClient]
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
  const officialBaseStatus = officialBaseStatusQuery.data?.data;
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
          <OfficialBaseSection
            loading={officialBaseStatusQuery.isLoading}
            errorMessage={officialBaseStatusQuery.error instanceof Error ? officialBaseStatusQuery.error.message : null}
            onRetry={() => void officialBaseStatusQuery.refetch()}
            status={officialBaseStatus}
            roleInput={officialRoleInput}
            onRoleChange={setOfficialRoleInput}
            machineLabelInput={officialMachineLabelInput}
            onMachineLabelChange={setOfficialMachineLabelInput}
            publisherNameInput={officialPublisherNameInput}
            onPublisherNameChange={setOfficialPublisherNameInput}
            serverPortInput={officialServerPortInput}
            onServerPortChange={setOfficialServerPortInput}
            remoteServerUrlInput={officialRemoteServerUrlInput}
            onRemoteServerUrlChange={setOfficialRemoteServerUrlInput}
            onSaveConfig={saveOfficialBaseConfig}
            saveConfigLoading={officialBaseConfigMutation.isPending}
            serverSwitchLabel={serverSwitchLabel}
            serverIsRunning={serverIsRunning}
            serverToggleBusy={serverToggleBusy}
            onToggleServer={toggleLocalServer}
            onTestRemoteServer={() => officialBaseTestDirectoryMutation.mutate()}
            testRemoteLoading={officialBaseTestDirectoryMutation.isPending}
            remoteStatus={remoteOfficialStatus}
            notesInput={officialNotesInput}
            onNotesChange={setOfficialNotesInput}
            onPublish={confirmPublishOfficialBase}
            publishLoading={officialBasePublishMutation.isPending}
            onApply={confirmApplyOfficialBase}
            applyLoading={officialBaseApplyMutation.isPending}
            formatBytes={bytesToHuman}
            historyItems={officialBaseHistory}
            historyLoading={officialBaseHistoryQuery.isFetching}
            canDeleteHistory={officialRoleInput === "publisher"}
            deletePending={officialBaseDeleteMutation.isPending}
            onDeleteHistory={confirmDeleteOfficialBaseHistoryItem}
            onDeleteLatest={confirmDeleteLatestOfficialBase}
          />

        </Tabs.Panel>
        <Tabs.Panel value="locais" pt="md">
          <LocalBackupsSection
            autoConfigLoading={autoConfigLoading}
            autoEnabled={autoEnabled}
            onAutoEnabledChange={setAutoEnabledInput}
            autoScheduleMode={autoScheduleMode}
            onAutoScheduleModeChange={setAutoScheduleModeInput}
            autoWeekday={autoWeekday}
            onAutoWeekdayChange={setAutoWeekdayInput}
            autoHour={autoHour}
            onAutoHourChange={setAutoHourInput}
            autoMinute={autoMinute}
            onAutoMinuteChange={setAutoMinuteInput}
            autoRetention={autoRetention}
            onAutoRetentionChange={setAutoRetentionInput}
            scheduleOptions={scheduleOptions}
            weekdayOptions={weekdayOptions}
            onSaveAutoConfig={saveAutoConfig}
            saveAutoConfigLoading={saveAutoConfigLoading}
            autoConfig={autoConfig}
            backupsLoading={backupsQuery.isLoading}
            backupOptions={backupOptions}
            selectedBackupName={effectiveSelectedBackupName}
            onSelectedBackupChange={(value) => {
              setSelectedBackupName(value);
              setSelectedValidation(null);
            }}
            onValidateSelected={() => {
              if (effectiveSelectedBackupName) {
                validateSelectedMutation.mutate(effectiveSelectedBackupName);
              }
            }}
            validateSelectedLoading={validateSelectedMutation.isPending}
            onTestRestore={() => restoreTestMutation.mutate(effectiveSelectedBackupName)}
            restoreTestLoading={restoreTestMutation.isPending}
            onRestore={confirmRestore}
            restoreLoading={restoreMutation.isPending}
            selectedBackup={selectedBackup}
            formatBytes={bytesToHuman}
            selectedValidation={selectedValidation}
            backups={backups}
          />

        </Tabs.Panel>
        <Tabs.Panel value="diagnostico" pt="md">
          <BackupDiagnosticsSection
            onExportDiagnostics={() => diagnosticsMutation.mutate()}
            exportLoading={diagnosticsMutation.isPending}
            onRestorePreUpdate={() => restorePreUpdateMutation.mutate()}
            restorePreUpdateLoading={restorePreUpdateMutation.isPending}
          />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
