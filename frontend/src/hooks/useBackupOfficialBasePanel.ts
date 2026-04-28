import { useCallback, useEffect, useState } from "react";
import { modals } from "@mantine/modals";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";

import { api } from "../lib/apiClient";
import type {
  CompareServerStatusOut,
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

type BackupSection = "locais" | "oficial" | "diagnostico";

export function useBackupOfficialBasePanel(activeSection: BackupSection) {
  const queryClient = useQueryClient();
  const [officialRoleInput, setOfficialRoleInput] = useState<OfficialBaseRole>("consumer");
  const [officialMachineLabelInput, setOfficialMachineLabelInput] = useState("");
  const [officialPublisherNameInput, setOfficialPublisherNameInput] = useState("");
  const [officialServerPortInput, setOfficialServerPortInput] = useState<number | null>(8765);
  const [officialRemoteServerUrlInput, setOfficialRemoteServerUrlInput] = useState("");
  const [officialNotesInput, setOfficialNotesInput] = useState("");
  const [remoteOfficialStatus, setRemoteOfficialStatus] = useState<RemoteShareStatusOut | null>(null);
  const [serverStatusRefreshUntil, setServerStatusRefreshUntil] = useState(0);

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
    staleTime: 30_000,
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

  const saveOfficialBaseConfig = useCallback(() => {
    officialBaseConfigMutation.mutate({
      role: officialRoleInput,
      official_base_dir: officialBaseStatus?.official_base_dir ?? null,
      machine_label: officialMachineLabelInput.trim() || null,
      publisher_name: officialPublisherNameInput.trim() || null,
      server_port: officialServerPortInput ?? undefined,
      remote_server_url: officialRemoteServerUrlInput.trim() || null,
      server_enabled: officialBaseStatus?.server_enabled ?? false,
    });
  }, [
    officialBaseConfigMutation,
    officialBaseStatus?.official_base_dir,
    officialBaseStatus?.server_enabled,
    officialMachineLabelInput,
    officialPublisherNameInput,
    officialRemoteServerUrlInput,
    officialRoleInput,
    officialServerPortInput,
  ]);

  const toggleLocalServer = useCallback(
    (nextChecked: boolean) => {
      setServerStatusRefreshUntil(Date.now() + 15_000);
      if (nextChecked) {
        officialBaseServerStartMutation.mutate();
        return;
      }
      officialBaseServerStopMutation.mutate();
    },
    [officialBaseServerStartMutation, officialBaseServerStopMutation]
  );

  const confirmPublishOfficialBase = useCallback(() => {
    modals.openConfirmModal({
      title: "Publicar base oficial",
      children: "Esta operacao vai gerar uma copia oficial da base atual e deixar essa base disponivel no servidor local desta maquina. Use isso somente na maquina que representa a fonte oficial do estoque.",
      labels: { confirm: "Publicar agora", cancel: "Cancelar" },
      onConfirm: () =>
        officialBasePublishMutation.mutate({
          notes: officialNotesInput.trim() || undefined,
        }),
    });
  }, [officialBasePublishMutation, officialNotesInput]);

  const confirmApplyOfficialBase = useCallback(() => {
    modals.openConfirmModal({
      title: "Atualizar minha base local",
      children:
        "O sistema vai criar um backup automatico do banco atual, baixar a base oficial do servidor remoto informado e reiniciar o aplicativo ao final.",
      labels: { confirm: "Atualizar base", cancel: "Cancelar" },
      confirmProps: { color: "orange" },
      onConfirm: () => officialBaseApplyMutation.mutate(),
    });
  }, [officialBaseApplyMutation]);

  const confirmDeleteLatestOfficialBase = useCallback(() => {
    modals.openConfirmModal({
      title: "Excluir base oficial atual",
      children:
        "Isso vai remover a base oficial mais recente publicada neste servidor local. Os snapshots do historico continuam existentes, mas os outros computadores nao vao mais encontrar uma base atual para baixar.",
      labels: { confirm: "Excluir base atual", cancel: "Cancelar" },
      confirmProps: { color: "red" },
      onConfirm: () => officialBaseDeleteMutation.mutate({ deleteLatest: true }),
    });
  }, [officialBaseDeleteMutation]);

  const confirmDeleteOfficialBaseHistoryItem = useCallback(
    (item: OfficialBaseHistoryItemOut) => {
      modals.openConfirmModal({
        title: "Excluir publicacao historica",
        children: `Isso vai remover este snapshot do historico publicado em ${dayjs(item.manifest.published_at).format("DD/MM/YYYY HH:mm")}. Essa acao nao altera a base local ativa.`,
        labels: { confirm: "Excluir snapshot", cancel: "Cancelar" },
        confirmProps: { color: "red" },
        onConfirm: () => officialBaseDeleteMutation.mutate({ manifestPath: item.manifest_path }),
      });
    },
    [officialBaseDeleteMutation]
  );

  return {
    officialBaseHistory,
    officialBaseHistoryLoading: officialBaseHistoryQuery.isFetching,
    officialBaseStatus,
    officialBaseStatusLoading: officialBaseStatusQuery.isLoading,
    officialBaseStatusErrorMessage:
      officialBaseStatusQuery.error instanceof Error ? officialBaseStatusQuery.error.message : null,
    officialNotesInput,
    officialPublisherNameInput,
    officialRemoteServerUrlInput,
    officialRoleInput,
    officialServerPortInput,
    officialMachineLabelInput,
    remoteOfficialStatus,
    saveConfigLoading: officialBaseConfigMutation.isPending,
    publishLoading: officialBasePublishMutation.isPending,
    applyLoading: officialBaseApplyMutation.isPending,
    deletePending: officialBaseDeleteMutation.isPending,
    testRemoteLoading: officialBaseTestDirectoryMutation.isPending,
    serverIsRunning,
    serverSwitchLabel,
    serverToggleBusy,
    setOfficialMachineLabelInput,
    setOfficialNotesInput,
    setOfficialPublisherNameInput,
    setOfficialRemoteServerUrlInput,
    setOfficialRoleInput,
    setOfficialServerPortInput,
    saveOfficialBaseConfig,
    toggleLocalServer,
    testRemoteServer: () => officialBaseTestDirectoryMutation.mutate(),
    confirmPublishOfficialBase,
    confirmApplyOfficialBase,
    confirmDeleteLatestOfficialBase,
    confirmDeleteOfficialBaseHistoryItem,
    retryStatus: () => officialBaseStatusQuery.refetch(),
  };
}
