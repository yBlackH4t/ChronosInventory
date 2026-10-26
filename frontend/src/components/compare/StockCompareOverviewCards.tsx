import dayjs from "dayjs";
import StatusTile from "../ui/StatusTile";

import type {
  CompareServerStatusOut,
  RemoteCompareServerOut,
  StockCompareOut,
} from "../../lib/api";

type Props = {
  compareResult: StockCompareOut | null;
  compareServerStatus?: CompareServerStatusOut | null;
  remoteServerInfo?: RemoteCompareServerOut | null;
  localStatusConfirmedAt: string | null;
  remoteStatusCheckedAt: string | null;
  remoteSnapshotIsOlder: boolean;
};

export default function StockCompareOverviewCards({
  compareResult,
  compareServerStatus,
  remoteServerInfo,
  localStatusConfirmedAt,
  remoteStatusCheckedAt,
  remoteSnapshotIsOlder,
}: Props) {
  const localLatest =
    compareServerStatus?.local_snapshot?.manifest?.published_at;
  const remoteLatest = remoteServerInfo?.compare_manifest?.published_at;

  return (
    <div className="stat-grid">
      <StatusTile
        label="Cópia do estoque local"
        value={localLatest ? dayjs(localLatest).format("DD/MM/YYYY HH:mm") : "Não publicado"}
        tone={localLatest ? "success" : "neutral"}
        status={localLatest ? "Pronto para comparar" : "Sem cópia do estoque"}
        hint={`Confirmado em ${localStatusConfirmedAt || "—"}`}
      />
      <StatusTile
        label="Cópia do estoque remota"
        value={remoteLatest ? dayjs(remoteLatest).format("DD/MM/YYYY HH:mm") : "Não publicado"}
        tone={
          remoteSnapshotIsOlder
            ? "warning"
            : remoteServerInfo?.reachable
              ? "success"
              : "neutral"
        }
        status={
          remoteSnapshotIsOlder
            ? "Mais antigo que o local"
            : remoteServerInfo?.reachable
              ? "Servidor online"
              : remoteServerInfo
                ? "Sem cópia do estoque"
                : "Não consultado"
        }
        hint={`Consultado em ${remoteStatusCheckedAt || "—"}`}
      />
      <StatusTile
        label="Comparação carregada"
        value={compareResult ? `${compareResult.rows.length} itens` : "—"}
        tone={(compareResult?.summary.divergent_items ?? 0) > 0 ? "warning" : "neutral"}
        status={
          compareResult
            ? `${compareResult.summary.divergent_items} divergentes`
            : "Nenhuma comparação"
        }
        hint={`Só em uma das bases: ${(compareResult?.summary.only_left_items ?? 0) + (compareResult?.summary.only_right_items ?? 0)}`}
      />
      <StatusTile
        label="Histórico local"
        value={`${compareServerStatus?.history_items_count ?? 0} snapshots`}
        hint={`Mantém até ${compareServerStatus?.history_retention_limit ?? 10} · porta ${compareServerStatus?.server_port ?? "—"}`}
      />
    </div>
  );
}
