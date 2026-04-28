import { useEffect, useMemo, useState } from "react";
import { Stack, Text } from "@mantine/core";
import { modals } from "@mantine/modals";
import { useMutation, useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";

import StockCompareManualSection from "../components/compare/StockCompareManualSection";
import StockCompareOverviewCards from "../components/compare/StockCompareOverviewCards";
import StockCompareResults from "../components/compare/StockCompareResults";
import StockCompareServerSection from "../components/compare/StockCompareServerSection";
import PageHeader from "../components/ui/PageHeader";
import type {
  CompareServerStatusOut,
  PublishedCompareBaseOut,
  PublishedCompareDeleteOut,
  RemoteCompareServerOut,
  StockCompareOut,
  StockProfilesStateOut,
  SuccessResponse,
} from "../lib/api";
import { api } from "../lib/apiClient";
import { notifyError, notifySuccess } from "../lib/notify";
import { isTauri } from "../lib/tauri";
import { loadTabState, saveTabState } from "../state/tabStateCache";

type CompareFilter =
  | "DIFFERENT"
  | "ALL"
  | "CANOAS"
  | "PF"
  | "ONLY_LEFT"
  | "ONLY_RIGHT"
  | "NAME"
  | "ACTIVE"
  | "IDENTICAL";

type CompareTabState = {
  leftPath: string;
  rightPath: string;
  leftLabel: string;
  rightLabel: string;
  filter: CompareFilter;
  search: string;
  remoteServerUrl: string;
};

type CompareSessionCache = {
  compareResult: StockCompareOut | null;
  remoteServerInfo: RemoteCompareServerOut | null;
  remoteCheckedAt: string | null;
  remoteCheckError: string | null;
  remoteReachable: boolean | null;
};

const STOCK_COMPARE_TAB_ID = "stock-compare";
const DEFAULT_COMPARE_STATE: CompareTabState = {
  leftPath: "",
  rightPath: "",
  leftLabel: "Minha base",
  rightLabel: "Base colega",
  filter: "DIFFERENT",
  search: "",
  remoteServerUrl: "",
};
const DEFAULT_COMPARE_SESSION_CACHE: CompareSessionCache = {
  compareResult: null,
  remoteServerInfo: null,
  remoteCheckedAt: null,
  remoteCheckError: null,
  remoteReachable: null,
};
let compareSessionCache: CompareSessionCache = DEFAULT_COMPARE_SESSION_CACHE;

function remoteServerErrorMessage(serverUrl: string, error: unknown): string {
  const fallback = error instanceof Error ? error.message : "Falha ao consultar servidor remoto.";
  if (!serverUrl.trim()) return fallback;
  return `${fallback} Verifique o endereco, a porta e se o servidor remoto esta ligado.`;
}

function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size < 1024) return `${size || 0} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}


export default function StockComparePage() {
  const persistedState = useMemo(
    () => loadTabState<CompareTabState>(STOCK_COMPARE_TAB_ID) ?? DEFAULT_COMPARE_STATE,
    []
  );
  const [leftPath, setLeftPath] = useState(persistedState.leftPath);
  const [rightPath, setRightPath] = useState(persistedState.rightPath);
  const [leftLabel, setLeftLabel] = useState(persistedState.leftLabel);
  const [rightLabel, setRightLabel] = useState(persistedState.rightLabel);
  const [filter, setFilter] = useState<CompareFilter>(persistedState.filter);
  const [search, setSearch] = useState(persistedState.search);
  const [remoteServerUrl, setRemoteServerUrl] = useState(persistedState.remoteServerUrl);
  const [compareResult, setCompareResult] = useState<StockCompareOut | null>(
    compareSessionCache.compareResult
  );
  const [remoteServerInfo, setRemoteServerInfo] = useState<RemoteCompareServerOut | null>(
    compareSessionCache.remoteServerInfo
  );
  const [remoteCheckedAt, setRemoteCheckedAt] = useState<string | null>(compareSessionCache.remoteCheckedAt);
  const [remoteCheckError, setRemoteCheckError] = useState<string | null>(compareSessionCache.remoteCheckError);
  const [remoteReachable, setRemoteReachable] = useState<boolean | null>(compareSessionCache.remoteReachable);
  const [compareStatusRefreshUntil, setCompareStatusRefreshUntil] = useState(0);

  const stockProfilesQuery = useQuery<SuccessResponse<StockProfilesStateOut>>({
    queryKey: ["stock-profiles"],
    queryFn: ({ signal }) => api.listStockProfiles({ signal }),
    staleTime: 30_000,
  });

  const compareServerStatusQuery = useQuery<SuccessResponse<CompareServerStatusOut>>({
    queryKey: ["compare-server-status"],
    queryFn: ({ signal }) => api.getCompareServerStatus({ signal }),
    staleTime: 15_000,
    refetchInterval: (query) => {
      const response = query.state.data as SuccessResponse<CompareServerStatusOut> | undefined;
      const status = response?.data;
      const shouldPoll = Boolean(status?.server_running) || Date.now() < compareStatusRefreshUntil;
      return shouldPoll ? 5_000 : false;
    },
  });

  const compareServerHistoryQuery = useQuery<SuccessResponse<PublishedCompareBaseOut[]>>({
    queryKey: ["compare-server-history"],
    queryFn: ({ signal }) => api.listCompareServerHistory({ limit: 10 }, { signal }),
    staleTime: 15_000,
  });

  useEffect(() => {
    saveTabState<CompareTabState>(STOCK_COMPARE_TAB_ID, {
      leftPath,
      rightPath,
      leftLabel,
      rightLabel,
      filter,
      search,
      remoteServerUrl,
    });
  }, [filter, leftLabel, leftPath, remoteServerUrl, rightLabel, rightPath, search]);

  useEffect(() => {
    compareSessionCache = {
      compareResult,
      remoteServerInfo,
      remoteCheckedAt,
      remoteCheckError,
      remoteReachable,
    };
  }, [compareResult, remoteCheckError, remoteCheckedAt, remoteReachable, remoteServerInfo]);

  useEffect(() => {
    const currentPath = stockProfilesQuery.data?.data?.current_database_path || "";
    if (!currentPath || leftPath.trim()) return;
    setLeftPath(currentPath);
  }, [leftPath, stockProfilesQuery.data?.data?.current_database_path]);

  useEffect(() => {
    const configuredRemote = compareServerStatusQuery.data?.data?.remote_server_url || "";
    if (!configuredRemote || remoteServerUrl.trim()) return;
    setRemoteServerUrl(configuredRemote);
  }, [compareServerStatusQuery.data?.data?.remote_server_url, remoteServerUrl]);

  useEffect(() => {
    if (!remoteServerInfo) return;
    if (remoteServerInfo.server_url.trim() === remoteServerUrl.trim()) return;
    setRemoteServerInfo(null);
    setRemoteCheckedAt(null);
    setRemoteCheckError(null);
    setRemoteReachable(null);
  }, [remoteServerInfo, remoteServerUrl]);

  const compareMutation = useMutation<SuccessResponse<StockCompareOut>, Error>({
    mutationFn: () =>
      api.compareStockDatabases({
        left_path: leftPath.trim(),
        right_path: rightPath.trim(),
        left_label: leftLabel.trim() || "Base A",
        right_label: rightLabel.trim() || "Base B",
      }),
    onSuccess: (response) => {
      setCompareResult(response.data);
      notifySuccess("Comparativo concluido.");
    },
    onError: (error) => notifyError(error),
  });

  const publishSnapshotMutation = useMutation<SuccessResponse<unknown>, Error>({
    mutationFn: () => api.publishCompareServerSnapshot(),
    onSuccess: async () => {
      notifySuccess("Snapshot local publicado para comparacao.");
      setCompareStatusRefreshUntil(Date.now() + 15_000);
      await compareServerStatusQuery.refetch();
      await compareServerHistoryQuery.refetch();
    },
    onError: (error) => notifyError(error),
  });

  const inspectRemoteServerMutation = useMutation<SuccessResponse<RemoteCompareServerOut>, Error>({
    mutationFn: () => api.inspectRemoteCompareServer(remoteServerUrl.trim()),
    onSuccess: (response) => {
      setRemoteServerInfo(response.data);
      setRemoteCheckedAt(new Date().toISOString());
      setRemoteCheckError(null);
      setRemoteReachable(true);
      notifySuccess(response.data.message);
    },
    onError: (error) => {
      setRemoteServerInfo(null);
      setRemoteCheckedAt(new Date().toISOString());
      setRemoteCheckError(remoteServerErrorMessage(remoteServerUrl, error));
      setRemoteReachable(false);
      notifyError(error);
    },
  });

  const comparePublishedMutation = useMutation<SuccessResponse<StockCompareOut>, Error>({
    mutationFn: () => api.compareWithRemoteServer(remoteServerUrl.trim()),
    onSuccess: (response) => {
      setCompareResult(response.data);
      setRemoteCheckedAt(new Date().toISOString());
      setRemoteCheckError(null);
      setRemoteReachable(true);
      notifySuccess("Comparativo com servidor remoto concluido.");
    },
    onError: (error) => {
      setRemoteCheckedAt(new Date().toISOString());
      setRemoteCheckError(remoteServerErrorMessage(remoteServerUrl, error));
      setRemoteReachable(false);
      notifyError(error);
    },
  });

  const deleteLatestSnapshotMutation = useMutation<
    SuccessResponse<PublishedCompareDeleteOut>,
    Error,
    void
  >({
    mutationFn: () => api.deleteCompareServerPublication({ delete_latest: true }),
    onSuccess: async (response) => {
      notifySuccess(response.data.message);
      setCompareStatusRefreshUntil(Date.now() + 10_000);
      await compareServerStatusQuery.refetch();
      await compareServerHistoryQuery.refetch();
    },
    onError: (error) => notifyError(error),
  });

  const deleteHistorySnapshotMutation = useMutation<
    SuccessResponse<PublishedCompareDeleteOut>,
    Error,
    string
  >({
    mutationFn: (manifestPath) => api.deleteCompareServerPublication({ manifest_path: manifestPath }),
    onSuccess: async (response) => {
      notifySuccess(response.data.message);
      await compareServerHistoryQuery.refetch();
      await compareServerStatusQuery.refetch();
    },
    onError: (error) => notifyError(error),
  });

  const chooseDatabaseFile = async (target: "left" | "right") => {
    if (!isTauri()) {
      notifyError(
        new Error("Selecao de arquivo integrada disponivel apenas no app desktop. Digite o caminho manualmente.")
      );
      return;
    }
    try {
      const { open } = await import("@tauri-apps/api/dialog");
      const selected = await open({
        multiple: false,
        filters: [{ name: "Banco SQLite", extensions: ["db", "sqlite", "sqlite3"] }],
      });
      if (typeof selected !== "string" || !selected.trim()) return;
      if (target === "left") {
        setLeftPath(selected);
      } else {
        setRightPath(selected);
      }
    } catch (error) {
      notifyError(error, "Nao foi possivel selecionar o arquivo.");
    }
  };

  const startManualCompare = () => {
    if (!leftPath.trim() || !rightPath.trim()) {
      notifyError(new Error("Informe as duas bases para comparar."));
      return;
    }
    compareMutation.mutate();
  };

  const inspectRemoteServer = () => {
    if (!remoteServerUrl.trim()) {
      notifyError(new Error("Informe o endereco do servidor remoto."));
      return;
    }
    inspectRemoteServerMutation.mutate();
  };

  const startPublishedCompare = () => {
    if (!remoteServerUrl.trim()) {
      notifyError(new Error("Informe o endereco do servidor remoto para comparar."));
      return;
    }
    comparePublishedMutation.mutate();
  };

  const confirmDeleteLatestSnapshot = () => {
    modals.openConfirmModal({
      title: "Excluir snapshot atual",
      children: (
        <Text size="sm">
          Vamos excluir o snapshot de comparacao atualmente publicado nesta maquina. O historico continua preservado.
        </Text>
      ),
      labels: { confirm: "Excluir snapshot", cancel: "Cancelar" },
      confirmProps: { color: "red" },
      onConfirm: () => deleteLatestSnapshotMutation.mutate(),
    });
  };

  const confirmDeleteHistorySnapshot = (manifestPath: string) => {
    modals.openConfirmModal({
      title: "Excluir snapshot do historico",
      children: (
        <Text size="sm">
          Esse snapshot historico sera removido do servidor local. A base local atual nao sera alterada.
        </Text>
      ),
      labels: { confirm: "Excluir historico", cancel: "Cancelar" },
      confirmProps: { color: "red" },
      onConfirm: () => deleteHistorySnapshotMutation.mutate(manifestPath),
    });
  };

  const rows = useMemo(() => {
    const source = compareResult?.rows ?? [];
    const query = search.trim().toUpperCase();
    return source.filter((row) => {
      const matchesFilter =
        filter === "ALL"
          ? true
          : filter === "DIFFERENT"
            ? row.has_difference
            : filter === "IDENTICAL"
              ? !row.has_difference
              : row.statuses.includes(filter);

      if (!matchesFilter) return false;
      if (!query) return true;

      return (
        String(row.product_id).includes(query) ||
        (row.display_name || "").toUpperCase().includes(query) ||
        (row.left_name || "").toUpperCase().includes(query) ||
        (row.right_name || "").toUpperCase().includes(query)
      );
    });
  }, [compareResult?.rows, filter, search]);

  const currentDbPath = stockProfilesQuery.data?.data?.current_database_path || "";
  const activeProfileName = stockProfilesQuery.data?.data?.active_profile_name || "Atual";
  const compareServerStatus = compareServerStatusQuery.data?.data;
  const compareServerHistory = compareServerHistoryQuery.data?.data ?? [];
  const localStatusConfirmedAt = compareServerStatusQuery.dataUpdatedAt
    ? dayjs(compareServerStatusQuery.dataUpdatedAt).format("DD/MM/YYYY HH:mm:ss")
    : null;
  const remoteStatusCheckedAt = remoteCheckedAt ? dayjs(remoteCheckedAt).format("DD/MM/YYYY HH:mm:ss") : null;
  const localLatestPublishedAt = compareServerStatus?.local_snapshot?.manifest?.published_at ?? null;
  const remoteLatestPublishedAt = remoteServerInfo?.compare_manifest?.published_at ?? null;
  const remoteSnapshotIsOlder = Boolean(
    localLatestPublishedAt &&
      remoteLatestPublishedAt &&
      dayjs(remoteLatestPublishedAt).isBefore(dayjs(localLatestPublishedAt))
  );

  return (
    <Stack gap="lg">
      <PageHeader
        title="Comparar estoques"
        subtitle="Publique um snapshot nesta maquina e compare com outro computador usando apenas o endereco do servidor local."
      />

      <StockCompareOverviewCards
        compareResult={compareResult}
        compareServerStatus={compareServerStatus}
        remoteServerInfo={remoteServerInfo}
        localStatusConfirmedAt={localStatusConfirmedAt}
        remoteStatusCheckedAt={remoteStatusCheckedAt}
        remoteSnapshotIsOlder={remoteSnapshotIsOlder}
      />

      <StockCompareServerSection
        currentDbPath={currentDbPath}
        activeProfileName={activeProfileName}
        compareServerStatus={compareServerStatus}
        compareServerHistory={compareServerHistory}
        historyLoading={compareServerHistoryQuery.isLoading}
        onRefreshHistory={() => void compareServerHistoryQuery.refetch()}
        localStatusConfirmedAt={localStatusConfirmedAt}
        remoteServerUrl={remoteServerUrl}
        onRemoteServerUrlChange={setRemoteServerUrl}
        remoteStatusCheckedAt={remoteStatusCheckedAt}
        remoteServerInfo={remoteServerInfo}
        remoteReachable={remoteReachable}
        remoteCheckError={remoteCheckError}
        remoteSnapshotIsOlder={remoteSnapshotIsOlder}
        onInspectRemoteServer={inspectRemoteServer}
        inspectRemoteLoading={inspectRemoteServerMutation.isPending}
        onCompareRemote={startPublishedCompare}
        compareRemoteLoading={comparePublishedMutation.isPending}
        onPublishSnapshot={() => publishSnapshotMutation.mutate()}
        publishSnapshotLoading={publishSnapshotMutation.isPending}
        onDeleteLatestSnapshot={confirmDeleteLatestSnapshot}
        deleteLatestSnapshotLoading={deleteLatestSnapshotMutation.isPending}
        onDeleteHistorySnapshot={confirmDeleteHistorySnapshot}
        deleteHistorySnapshotLoading={deleteHistorySnapshotMutation.isPending}
        deletingHistoryManifestPath={deleteHistorySnapshotMutation.variables ?? null}
        formatBytes={formatBytes}
      />

      <StockCompareManualSection
        leftLabel={leftLabel}
        onLeftLabelChange={setLeftLabel}
        leftPath={leftPath}
        onLeftPathChange={setLeftPath}
        rightLabel={rightLabel}
        onRightLabelChange={setRightLabel}
        rightPath={rightPath}
        onRightPathChange={setRightPath}
        currentDbPath={currentDbPath}
        onUseCurrentDatabase={() => setLeftPath(currentDbPath)}
        onChooseLeftFile={() => void chooseDatabaseFile("left")}
        onChooseRightFile={() => void chooseDatabaseFile("right")}
        onCompareManual={startManualCompare}
        compareManualLoading={compareMutation.isPending}
      />

      <StockCompareResults
        compareResult={compareResult}
        rows={rows}
        filter={filter}
        search={search}
        onFilterChange={setFilter}
        onSearchChange={setSearch}
        onResetFilters={() => {
          setFilter("DIFFERENT");
          setSearch("");
        }}
      />
    </Stack>
  );
}
