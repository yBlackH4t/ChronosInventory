import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  Stack,
  Text,
  Tabs,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";

import { api } from "../lib/apiClient";
import { BackupDiagnosticsSection } from "../components/backup/BackupDiagnosticsSection";
import { BackupOverviewCards } from "../components/backup/BackupOverviewCards";
import { LocalBackupsSection } from "../components/backup/LocalBackupsSection";
import PageHeader from "../components/ui/PageHeader";
import { OfficialBaseSection } from "../components/backup/OfficialBaseSection";
import { useBackupAutoConfig } from "../hooks/useBackupAutoConfig";
import { useBackupOfficialBasePanel } from "../hooks/useBackupOfficialBasePanel";
import { downloadBlob } from "../lib/download";
import { loadTabState, saveTabState } from "../state/tabStateCache";
import type {
  BackupListItemOut,
  BackupOut,
  BackupRestoreOut,
  BackupRestoreTestOut,
  BackupValidateOut,
  DownloadResponse,
  SuccessResponse,
} from "../lib/api";
import { notifyError, notifySuccess } from "../lib/notify";

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
  const officialBasePanel = useBackupOfficialBasePanel(activeSection);

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

  return (
    <Stack gap="lg">
      <PageHeader
        title="Backup"
        subtitle="Backups locais, base oficial compartilhada e diagnostico operacional em um unico lugar."
        actions={(
          <Button onClick={() => backupMutation.mutate()} loading={backupMutation.isPending}>
            Criar backup
          </Button>
        )}
      />

      <BackupOverviewCards
        currentValidation={currentValidation}
        backups={backups}
        autoConfig={autoConfig}
        officialBaseStatus={officialBasePanel.officialBaseStatus}
        formatBytes={bytesToHuman}
      />

      <Tabs value={activeSection} onChange={(value) => setActiveSection((value as BackupTabState["activeSection"]) || "locais")}>
        <Tabs.List>
          <Tabs.Tab value="locais">Backups locais</Tabs.Tab>
          <Tabs.Tab value="oficial">Base oficial / servidor</Tabs.Tab>
          <Tabs.Tab value="diagnostico">Diagnostico e restore</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="oficial" pt="md">
          <OfficialBaseSection
            loading={officialBasePanel.officialBaseStatusLoading}
            errorMessage={officialBasePanel.officialBaseStatusErrorMessage}
            onRetry={() => void officialBasePanel.retryStatus()}
            status={officialBasePanel.officialBaseStatus}
            roleInput={officialBasePanel.officialRoleInput}
            onRoleChange={officialBasePanel.setOfficialRoleInput}
            machineLabelInput={officialBasePanel.officialMachineLabelInput}
            onMachineLabelChange={officialBasePanel.setOfficialMachineLabelInput}
            publisherNameInput={officialBasePanel.officialPublisherNameInput}
            onPublisherNameChange={officialBasePanel.setOfficialPublisherNameInput}
            serverPortInput={officialBasePanel.officialServerPortInput}
            onServerPortChange={officialBasePanel.setOfficialServerPortInput}
            remoteServerUrlInput={officialBasePanel.officialRemoteServerUrlInput}
            onRemoteServerUrlChange={officialBasePanel.setOfficialRemoteServerUrlInput}
            onSaveConfig={officialBasePanel.saveOfficialBaseConfig}
            saveConfigLoading={officialBasePanel.saveConfigLoading}
            serverSwitchLabel={officialBasePanel.serverSwitchLabel}
            serverIsRunning={officialBasePanel.serverIsRunning}
            serverToggleBusy={officialBasePanel.serverToggleBusy}
            onToggleServer={officialBasePanel.toggleLocalServer}
            onTestRemoteServer={officialBasePanel.testRemoteServer}
            testRemoteLoading={officialBasePanel.testRemoteLoading}
            remoteStatus={officialBasePanel.remoteOfficialStatus}
            notesInput={officialBasePanel.officialNotesInput}
            onNotesChange={officialBasePanel.setOfficialNotesInput}
            onPublish={officialBasePanel.confirmPublishOfficialBase}
            publishLoading={officialBasePanel.publishLoading}
            onApply={officialBasePanel.confirmApplyOfficialBase}
            applyLoading={officialBasePanel.applyLoading}
            formatBytes={bytesToHuman}
            historyItems={officialBasePanel.officialBaseHistory}
            historyLoading={officialBasePanel.officialBaseHistoryLoading}
            canDeleteHistory={officialBasePanel.officialRoleInput === "publisher"}
            deletePending={officialBasePanel.deletePending}
            onDeleteHistory={officialBasePanel.confirmDeleteOfficialBaseHistoryItem}
            onDeleteLatest={officialBasePanel.confirmDeleteLatestOfficialBase}
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
