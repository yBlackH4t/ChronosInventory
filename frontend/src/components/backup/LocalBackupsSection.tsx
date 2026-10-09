import {
  Button,
  Group,
  Loader,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
} from "@mantine/core";
import dayjs from "dayjs";

import type {
  BackupAutoConfigOut,
  BackupListItemOut,
  BackupValidateOut,
} from "../../lib/api";
import { BackupFilesTable } from "./BackupFilesTable";
import Panel from "../ui/Panel";
import StatusDot from "../ui/StatusDot";

type Option = { value: string; label: string };

type LocalBackupsSectionProps = {
  autoConfigLoading: boolean;
  autoEnabled: boolean;
  onAutoEnabledChange: (value: boolean) => void;
  autoScheduleMode: "DAILY" | "WEEKLY";
  onAutoScheduleModeChange: (value: "DAILY" | "WEEKLY") => void;
  autoWeekday: string;
  onAutoWeekdayChange: (value: string) => void;
  autoHour: number;
  onAutoHourChange: (value: number) => void;
  autoMinute: number;
  onAutoMinuteChange: (value: number) => void;
  autoRetention: string;
  onAutoRetentionChange: (value: string) => void;
  scheduleOptions: Option[];
  weekdayOptions: Option[];
  onSaveAutoConfig: () => void;
  saveAutoConfigLoading: boolean;
  autoConfig: BackupAutoConfigOut | null | undefined;
  backupsLoading: boolean;
  backupOptions: Option[];
  selectedBackupName: string | null;
  onSelectedBackupChange: (value: string | null) => void;
  onValidateSelected: () => void;
  validateSelectedLoading: boolean;
  onTestRestore: () => void;
  restoreTestLoading: boolean;
  onRestore: () => void;
  restoreLoading: boolean;
  selectedBackup: BackupListItemOut | null;
  formatBytes: (size: number) => string;
  selectedValidation: BackupValidateOut | null;
  backups: BackupListItemOut[];
};

export function LocalBackupsSection({
  autoConfigLoading,
  autoEnabled,
  onAutoEnabledChange,
  autoScheduleMode,
  onAutoScheduleModeChange,
  autoWeekday,
  onAutoWeekdayChange,
  autoHour,
  onAutoHourChange,
  autoMinute,
  onAutoMinuteChange,
  autoRetention,
  onAutoRetentionChange,
  scheduleOptions,
  weekdayOptions,
  onSaveAutoConfig,
  saveAutoConfigLoading,
  autoConfig,
  backupsLoading,
  backupOptions,
  selectedBackupName,
  onSelectedBackupChange,
  onValidateSelected,
  validateSelectedLoading,
  onTestRestore,
  restoreTestLoading,
  onRestore,
  restoreLoading,
  selectedBackup,
  formatBytes,
  selectedValidation,
  backups,
}: LocalBackupsSectionProps) {
  return (
    <Stack gap="md">
      <Panel
        title="Backup automático"
        subtitle={
          autoConfig
            ? `Última execução: ${autoConfig.last_run_date || "nunca"} · ${autoConfig.last_result || "sem execuções"}`
            : "Cópia agendada do banco de dados"
        }
        actions={
          <Switch
            aria-label="Ativar backup automático"
            checked={autoEnabled}
            onChange={(event) => onAutoEnabledChange(event.currentTarget.checked)}
            disabled={autoConfigLoading}
          />
        }
      >
        {autoConfigLoading ? (
          <Loader size="sm" />
        ) : (
          <Stack gap="md">
            <SimpleGrid cols={{ base: 2, sm: 5 }} spacing="sm">
              <Select
                label="Frequência"
                data={scheduleOptions}
                value={autoScheduleMode}
                onChange={(value) =>
                  onAutoScheduleModeChange(
                    (value as "DAILY" | "WEEKLY") || "DAILY",
                  )
                }
                allowDeselect={false}
                disabled={!autoEnabled}
              />
              <Select
                label="Dia da semana"
                data={weekdayOptions}
                value={autoWeekday}
                onChange={(value) => onAutoWeekdayChange(value || "0")}
                disabled={!autoEnabled || autoScheduleMode !== "WEEKLY"}
                allowDeselect={false}
              />
              <NumberInput
                label="Hora"
                min={0}
                max={23}
                value={autoHour}
                onChange={(value) => onAutoHourChange(Number(value ?? 0))}
                disabled={!autoEnabled}
              />
              <NumberInput
                label="Minuto"
                min={0}
                max={59}
                value={autoMinute}
                onChange={(value) => onAutoMinuteChange(Number(value ?? 0))}
                disabled={!autoEnabled}
              />
              <Select
                label="Manter por"
                data={[
                  { value: "7", label: "7 dias" },
                  { value: "15", label: "15 dias" },
                  { value: "30", label: "30 dias" },
                ]}
                value={autoRetention}
                onChange={(value) => onAutoRetentionChange(value || "15")}
                allowDeselect={false}
                disabled={!autoEnabled}
              />
            </SimpleGrid>
            <Group justify="space-between" wrap="wrap">
              <Text size="xs" c="dimmed">
                {autoConfig?.last_backup_name
                  ? `Último arquivo: ${autoConfig.last_backup_name}`
                  : "Nenhum arquivo gerado pelo agendamento ainda."}
              </Text>
              <Button
                variant="default"
                onClick={onSaveAutoConfig}
                loading={saveAutoConfigLoading}
              >
                Salvar agendamento
              </Button>
            </Group>
          </Stack>
        )}
      </Panel>

      <Panel
        title="Restaurar backup"
        subtitle="Valide ou teste antes de restaurar. A restauração substitui o banco atual."
      >
        {backupsLoading ? (
          <Loader size="sm" />
        ) : (
          <Stack gap="sm">
            <Group align="flex-end" wrap="wrap" gap="sm">
              <Select
                label="Backup"
                placeholder={
                  backupOptions.length > 0
                    ? "Selecione o backup"
                    : "Nenhum backup disponível"
                }
                data={backupOptions}
                value={selectedBackupName}
                onChange={onSelectedBackupChange}
                searchable
                style={{ flex: 1, minWidth: 260 }}
              />
              <Button
                variant="default"
                disabled={!selectedBackupName}
                loading={validateSelectedLoading}
                onClick={onValidateSelected}
              >
                Validar
              </Button>
              <Button
                variant="default"
                disabled={!selectedBackupName}
                loading={restoreTestLoading}
                onClick={onTestRestore}
              >
                Testar
              </Button>
              <Button
                color="red"
                variant="light"
                disabled={!selectedBackupName}
                loading={restoreLoading}
                onClick={onRestore}
              >
                Restaurar
              </Button>
            </Group>

            {(selectedBackup || selectedValidation) && (
              <Group gap="lg" wrap="wrap">
                {selectedBackup && (
                  <Text size="xs" c="dimmed" className="num">
                    {formatBytes(selectedBackup.size)} ·{" "}
                    {dayjs(selectedBackup.created_at).format("DD/MM/YYYY HH:mm")}
                  </Text>
                )}
                {selectedValidation && (
                  <StatusDot tone={selectedValidation.ok ? "success" : "danger"} size="xs">
                    {selectedValidation.ok ? "Backup válido" : "Backup inválido"} ·{" "}
                    {selectedValidation.result}
                  </StatusDot>
                )}
              </Group>
            )}
          </Stack>
        )}
      </Panel>

      <Panel flush title="Arquivos" subtitle={`${backups.length} backups nesta máquina`}>
        <BackupFilesTable backups={backups} />
      </Panel>
    </Stack>
  );
}
