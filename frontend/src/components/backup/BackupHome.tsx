import { useQuery } from "@tanstack/react-query";
import {
  IconAlertTriangle,
  IconCloudDownload,
  IconCloudUpload,
  IconDatabasePlus,
  IconHistory,
  IconShieldCheck,
} from "@tabler/icons-react";
import dayjs from "dayjs";

import { api } from "../../lib/apiClient";
import type {
  BackupAutoConfigOut,
  BackupListItemOut,
  BackupValidateOut,
  OfficialBaseStatusOut,
} from "../../lib/api";
import { friendlyDate } from "../../lib/backupLabels";
import { ActionGrid, ActionTile, StatusPanel } from "../ui/SimpleScreen";

const WEEKDAYS = [
  "segunda",
  "terça",
  "quarta",
  "quinta",
  "sexta",
  "sábado",
  "domingo",
];

type Props = {
  backups: BackupListItemOut[];
  autoConfig?: BackupAutoConfigOut | null;
  currentValidation?: BackupValidateOut | null;
  officialStatus?: OfficialBaseStatusOut | null;
  onBackupNow: () => void;
  backupNowLoading: boolean;
  onRestore: () => void;
  restoreLoading: boolean;
  onApplyOfficial: () => void;
  applyLoading: boolean;
  onPublishOfficial: () => void;
  publishLoading: boolean;
};

function scheduleText(config?: BackupAutoConfigOut | null): string {
  if (!config?.enabled) return "desligada";
  const time = `${String(config.hour).padStart(2, "0")}:${String(config.minute).padStart(2, "0")}`;
  if (config.schedule_mode === "WEEKLY")
    return `toda ${WEEKDAYS[config.weekday] ?? "semana"} às ${time}`;
  return `todo dia às ${time}`;
}

/** O que a maioria das pessoas precisa no Backup: a situação e três botões. */
export function BackupHome({
  backups,
  autoConfig,
  currentValidation,
  officialStatus,
  onBackupNow,
  backupNowLoading,
  onRestore,
  restoreLoading,
  onApplyOfficial,
  applyLoading,
  onPublishOfficial,
  publishLoading,
}: Props) {
  const secondFolder = useQuery({
    queryKey: ["backup-segunda-pasta"],
    queryFn: ({ signal }) => api.backupSecondFolder({ signal }),
  }).data?.data;

  const latest = backups[0] ?? null;
  const latestIsRecent = latest
    ? dayjs().diff(dayjs(latest.created_at), "day") < 2
    : false;
  const databaseOk = currentValidation ? currentValidation.ok : true;
  const allGood = latestIsRecent && databaseOk;

  let title = "Seus dados estão guardados";
  if (!databaseOk) title = "Atenção: o banco de dados precisa de revisão";
  else if (!latest) title = "Ainda não há nenhuma cópia dos dados";
  else if (!latestIsRecent) title = "Faz tempo que não é feita uma cópia";

  const isPrincipal = officialStatus?.role === "publisher";
  // "Pegar a base" só aparece quando este PC já está ligado a uma principal; sem isso o quadro
  // apagado só confundia.

  return (
    <>
      <StatusPanel
        tone={allGood ? "ok" : "atencao"}
        icon={allGood ? IconShieldCheck : IconAlertTriangle}
        title={title}
        lines={[
          <>
            Última cópia:{" "}
            <b>{latest ? friendlyDate(latest.created_at) : "nenhuma"}</b>
          </>,
          <>
            Cópia automática: <b>{scheduleText(autoConfig)}</b>
          </>,
          <>
            Cópia em outro disco:{" "}
            <b>{secondFolder?.ativo ? "ligada" : "desligada"}</b>
          </>,
        ]}
      />

      <ActionGrid>
        <ActionTile
          icon={IconDatabasePlus}
          title="Fazer uma cópia agora"
          text="Guarda os dados de hoje. Use antes de mexer em muita coisa."
          onClick={onBackupNow}
          loading={backupNowLoading}
        />
        <ActionTile
          icon={IconHistory}
          title="Voltar uma cópia"
          text="Traz de volta os dados de um dia anterior, se algo deu errado."
          onClick={onRestore}
          loading={restoreLoading}
          tone="perigo"
        />
        {isPrincipal ? (
          <ActionTile
            icon={IconCloudUpload}
            title="Enviar a base para os outros"
            text="Deixa a base deste computador pronta para os outros computadores pegarem."
            onClick={onPublishOfficial}
            loading={publishLoading}
          />
        ) : officialStatus?.remote_server_url ? (
          <ActionTile
            icon={IconCloudDownload}
            title="Pegar a base da principal"
            text="Atualiza este computador com o estoque da máquina principal."
            onClick={onApplyOfficial}
            loading={applyLoading}
          />
        ) : null}
      </ActionGrid>
    </>
  );
}
