import { useCallback, useEffect, useMemo, useState } from "react";
import { Stack, Text, Tabs } from "@mantine/core";
import { modals } from "@mantine/modals";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";

import { api } from "../lib/apiClient";
import { BackupDiagnosticsSection } from "../components/backup/BackupDiagnosticsSection";
import { BackupHome } from "../components/backup/BackupHome";
import { openRestorePicker } from "../components/backup/openRestorePicker";
import { AdvancedSection } from "../components/ui/SimpleScreen";
import { LocalBackupsSection } from "../components/backup/LocalBackupsSection";
import PageHeader from "../components/ui/PageHeader";
import { SecondFolderSection } from "../components/backup/SecondFolderSection";
import { useBackupAutoConfig } from "../hooks/useBackupAutoConfig";
import { useBackupOfficialBasePanel } from "../hooks/useBackupOfficialBasePanel";
import { bytesToHuman } from "../lib/bytes";
import { downloadBlob } from "../lib/download";
import { loadTabState, saveTabState } from "../state/tabStateCache";
import type {
  BackupListItemOut,
  BackupOut,
  BackupRecoverPhotosOut,
  BackupRestoreOut,
  BackupRestoreTestOut,
  BackupValidateOut,
  DownloadResponse,
  SuccessResponse,
} from "../lib/api";
import { notifyError, notifySuccess } from "../lib/notify";

type BackupTabState = {
  activeSection: "locais" | "diagnostico";
  selectedBackupName: string | null;
  scrollY: number;
  advancedOpen?: boolean;
};

const BACKUP_TAB_ID = "backup";
const DEFAULT_BACKUP_TAB_STATE: BackupTabState = {
  activeSection: "locais",
  selectedBackupName: null,
  scrollY: 0,
};

export default function BackupPage() {
  const persistedState = useMemo(
    () =>
      loadTabState<BackupTabState>(BACKUP_TAB_ID) ?? DEFAULT_BACKUP_TAB_STATE,
    [],
  );
  const queryClient = useQueryClient();
  const [activeSection, setActiveSection] = useState<
    BackupTabState["activeSection"]
  >(
    // A Base oficial e o Catálogo saíram daqui (2.7.26): aba antiga guardada volta para Cópias.
    persistedState.activeSection === "diagnostico" ? "diagnostico" : "locais",
  );
  const [selectedBackupName, setSelectedBackupName] = useState<string | null>(
    persistedState.selectedBackupName,
  );
  const [selectedValidation, setSelectedValidation] =
    useState<BackupValidateOut | null>(null);
  const [scrollY, setScrollY] = useState(persistedState.scrollY);
  const [advancedOpen, setAdvancedOpen] = useState(
    persistedState.advancedOpen ?? false,
  );
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
  const officialBasePanel = useBackupOfficialBasePanel(false);

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

  const validateSelectedMutation = useMutation<
    SuccessResponse<BackupValidateOut>,
    Error,
    string
  >({
    mutationFn: (backupName) => api.backupValidate(backupName),
    onSuccess: (response) => {
      setSelectedValidation(response.data);
      notifySuccess("Validação concluída");
    },
    onError: (error) => notifyError(error),
  });

  const restoreMutation = useMutation<
    SuccessResponse<BackupRestoreOut>,
    Error,
    string
  >({
    mutationFn: (backupName) => api.backupRestore({ backup_name: backupName }),
    onSuccess: () => {
      notifySuccess("Backup restaurado com sucesso");
      queryClient.invalidateQueries({ queryKey: ["backup-list"] });
      queryClient.invalidateQueries({ queryKey: ["backup-validate-current"] });
      setSelectedValidation(null);
    },
    onError: (error) => notifyError(error),
  });

  const recoverPhotosMutation = useMutation<
    SuccessResponse<BackupRecoverPhotosOut>,
    Error,
    string
  >({
    mutationFn: (backupName) =>
      api.backupRecoverPhotos({ backup_name: backupName }),
    onSuccess: (response) => {
      const data = response.data;
      if (data.produtos_recuperados > 0) {
        notifySuccess(
          `${data.fotos_copiadas} foto(s) recuperada(s) em ${data.produtos_recuperados} produto(s).`,
        );
      } else {
        notifySuccess(
          "Nenhuma foto para recuperar: os produtos deste backup já têm foto ou não existem mais.",
        );
      }
      queryClient.invalidateQueries({ queryKey: ["produtos"] });
      queryClient.invalidateQueries({ queryKey: ["produto-imagens"] });
      queryClient.invalidateQueries({ queryKey: ["backup-list"] });
    },
    onError: (error) => notifyError(error),
  });

  const restorePreUpdateMutation = useMutation<
    SuccessResponse<BackupRestoreOut>,
    Error,
    void
  >({
    mutationFn: () => api.backupRestorePreUpdate(),
    onSuccess: () => {
      notifySuccess("Dados de antes da atualização restaurados");
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
    mutationFn: (backupName) =>
      api.backupRestoreTest({ backup_name: backupName ?? undefined }),
    onSuccess: (response) => {
      if (response.data.ok) {
        notifySuccess("Teste de restauração concluído com sucesso");
      } else {
        notifyError(
          new Error(
            `Teste de restauração falhou: ${response.data.integrity_result}`,
          ),
        );
      }
    },
    onError: (error) => notifyError(error),
  });

  const diagnosticsMutation = useMutation<DownloadResponse, Error, void>({
    mutationFn: () => api.backupDiagnostics(),
    onSuccess: ({ blob, filename }) => {
      downloadBlob(
        blob,
        filename || `diagnostico_${dayjs().format("YYYYMMDD_HHmmss")}.zip`,
      );
      notifySuccess("Diagnóstico exportado");
    },
    onError: (error) => notifyError(error),
  });

  const backups = useMemo(
    () => backupsQuery.data?.data ?? [],
    [backupsQuery.data?.data],
  );
  const backupOptions = useMemo(
    () =>
      backups.map((item) => ({
        value: item.name,
        label: `${item.name} (${bytesToHuman(item.size)})`,
      })),
    [backups],
  );

  const effectiveSelectedBackupName = useMemo(() => {
    if (
      selectedBackupName &&
      backups.some((item) => item.name === selectedBackupName)
    ) {
      return selectedBackupName;
    }
    return backups[0]?.name ?? null;
  }, [backups, selectedBackupName]);

  const selectedBackup =
    backups.find((item) => item.name === effectiveSelectedBackupName) || null;
  const currentValidation = validateCurrentQuery.data?.data;

  const persistState = useCallback(
    (nextScrollY = scrollY) => {
      saveTabState<BackupTabState>(BACKUP_TAB_ID, {
        activeSection,
        selectedBackupName,
        scrollY: nextScrollY,
        advancedOpen,
      });
    },
    [activeSection, advancedOpen, scrollY, selectedBackupName],
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
          Esta operacao vai substituir o banco atual pelo backup selecionado (
          {effectiveSelectedBackupName}). O sistema cria um backup de seguranca
          automaticamente antes da restauracao.
        </Text>
      ),
      labels: { confirm: "Restaurar agora", cancel: "Cancelar" },
      confirmProps: { color: "danger" },
      onConfirm: () => restoreMutation.mutate(effectiveSelectedBackupName),
    });
  };

  const confirmRecoverPhotos = () => {
    if (!effectiveSelectedBackupName) return;
    modals.openConfirmModal({
      title: "Recuperar fotos do backup",
      children: (
        <Text size="sm">
          As fotos do backup {effectiveSelectedBackupName} voltam para os
          produtos que hoje estao sem foto. O resto do banco (estoque,
          movimentacoes, cadastros) nao muda.
        </Text>
      ),
      labels: { confirm: "Recuperar fotos", cancel: "Cancelar" },
      onConfirm: () =>
        recoverPhotosMutation.mutate(effectiveSelectedBackupName),
    });
  };

  return (
    <Stack gap="lg">
      <PageHeader
        title="Backup e segurança"
        subtitle="Cópias dos dados deste computador."
      />

      <BackupHome
        backups={backups}
        autoConfig={autoConfig}
        currentValidation={currentValidation}
        officialStatus={officialBasePanel.officialBaseStatus}
        onBackupNow={() => backupMutation.mutate()}
        backupNowLoading={backupMutation.isPending}
        onRestore={() =>
          openRestorePicker(backups, (name) => restoreMutation.mutate(name))
        }
        restoreLoading={restoreMutation.isPending}
        onApplyOfficial={officialBasePanel.confirmApplyOfficialBase}
        applyLoading={officialBasePanel.applyLoading}
        onPublishOfficial={officialBasePanel.confirmPublishOfficialBase}
        publishLoading={officialBasePanel.publishLoading}
      />

      <AdvancedSection
        hint="Horário da cópia automática, lista de arquivos, outro disco e diagnóstico. Só para quem configura."
        defaultOpen={persistedState.advancedOpen}
        onToggle={setAdvancedOpen}
      >
        <Tabs
          value={activeSection}
          onChange={(value) =>
            setActiveSection(
              (value as BackupTabState["activeSection"]) || "locais",
            )
          }
        >
          <Tabs.List>
            <Tabs.Tab value="locais">Cópias</Tabs.Tab>
            <Tabs.Tab value="diagnostico">Problemas</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="locais" pt="md">
            <Stack gap="md">
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
                    validateSelectedMutation.mutate(
                      effectiveSelectedBackupName,
                    );
                  }
                }}
                validateSelectedLoading={validateSelectedMutation.isPending}
                onTestRestore={() =>
                  restoreTestMutation.mutate(effectiveSelectedBackupName)
                }
                restoreTestLoading={restoreTestMutation.isPending}
                onRestore={confirmRestore}
                restoreLoading={restoreMutation.isPending}
                onRecoverPhotos={confirmRecoverPhotos}
                recoverPhotosLoading={recoverPhotosMutation.isPending}
                selectedBackup={selectedBackup}
                formatBytes={bytesToHuman}
                selectedValidation={selectedValidation}
                backups={backups}
              />
              <SecondFolderSection />
            </Stack>
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
      </AdvancedSection>
    </Stack>
  );
}
