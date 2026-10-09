import dayjs from "dayjs";

import type {
  BackupAutoConfigOut,
  BackupListItemOut,
  BackupValidateOut,
  OfficialBaseStatusOut,
} from "../../lib/api";
import StatusTile from "../ui/StatusTile";

type Props = {
  currentValidation?: BackupValidateOut | null;
  backups: BackupListItemOut[];
  autoConfig?: BackupAutoConfigOut | null;
  officialBaseStatus?: OfficialBaseStatusOut | null;
  formatBytes: (size: number) => string;
};

export function BackupOverviewCards({
  currentValidation,
  backups,
  autoConfig,
  officialBaseStatus,
  formatBytes,
}: Props) {
  const latestBackup = backups[0] ?? null;
  const latestOfficial = officialBaseStatus?.server_latest_manifest;

  return (
    <div className="stat-grid">
      <StatusTile
        label="Integridade do banco"
        tone={currentValidation?.ok ? "success" : currentValidation ? "danger" : "neutral"}
        status={currentValidation?.ok ? "Íntegro" : currentValidation ? "Com erro" : "Aguardando validação"}
        value={`${officialBaseStatus?.current_products_count ?? 0} produtos`}
        hint={`${officialBaseStatus?.current_products_with_stock_count ?? 0} com estoque · ${currentValidation?.result || "sem validação recente"}`}
      />
      <StatusTile
        label="Backups locais"
        tone={autoConfig?.enabled ? "success" : "neutral"}
        status={autoConfig?.enabled ? "Backup automático ativo" : "Backup automático desligado"}
        value={`${backups.length} ${backups.length === 1 ? "arquivo" : "arquivos"}`}
        hint={
          latestBackup
            ? `Último: ${dayjs(latestBackup.created_at).format("DD/MM/YYYY HH:mm")} · ${formatBytes(latestBackup.size)}`
            : "Nenhum backup criado ainda"
        }
      />
      <StatusTile
        label="Base oficial"
        tone={latestOfficial ? "success" : "neutral"}
        status={latestOfficial ? "Publicada" : "Não publicada"}
        value={
          latestOfficial
            ? dayjs(latestOfficial.published_at).format("DD/MM/YYYY HH:mm")
            : "—"
        }
        hint={
          latestOfficial
            ? `Por ${latestOfficial.publisher_name || latestOfficial.publisher_machine}`
            : "Publique para distribuir a referência do estoque"
        }
      />
      <StatusTile
        label="Servidor local"
        tone={officialBaseStatus?.server_running ? "success" : "neutral"}
        status={officialBaseStatus?.server_running ? "Ativo" : "Parado"}
        value={
          officialBaseStatus?.server_running
            ? `Porta ${officialBaseStatus.server_port ?? "—"}`
            : "Desligado"
        }
        hint={
          officialBaseStatus?.remote_server_url
            ? `Remoto: ${officialBaseStatus.remote_server_url}`
            : "Sem servidor remoto configurado"
        }
      />
    </div>
  );
}
