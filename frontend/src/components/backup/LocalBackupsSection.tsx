import { Badge, Button, Card, Group, Loader, NumberInput, Select, Stack, Switch, Text, Title } from "@mantine/core";
import dayjs from "dayjs";

import type { BackupAutoConfigOut, BackupListItemOut, BackupValidateOut } from "../../lib/api";
import { BackupFilesTable } from "./BackupFilesTable";

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
    <Stack gap="lg">
      <Card withBorder>
        <Stack>
          <Title order={4}>Backup automatico agendado</Title>
          {autoConfigLoading ? (
            <Loader size="sm" />
          ) : (
            <>
              <Group align="end" wrap="wrap">
                <Switch
                  label="Ativar backup automatico"
                  checked={autoEnabled}
                  onChange={(event) => onAutoEnabledChange(event.currentTarget.checked)}
                />
                <Select
                  label="Frequencia"
                  data={scheduleOptions}
                  value={autoScheduleMode}
                  onChange={(value) => onAutoScheduleModeChange((value as "DAILY" | "WEEKLY") || "DAILY")}
                  w={150}
                  allowDeselect={false}
                />
                <Select
                  label="Dia da semana"
                  data={weekdayOptions}
                  value={autoWeekday}
                  onChange={(value) => onAutoWeekdayChange(value || "0")}
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
                  onChange={(value) => onAutoHourChange(Number(value ?? 0))}
                />
                <NumberInput
                  label="Minuto"
                  min={0}
                  max={59}
                  w={100}
                  value={autoMinute}
                  onChange={(value) => onAutoMinuteChange(Number(value ?? 0))}
                />
                <Select
                  label="Retencao"
                  data={[
                    { value: "7", label: "7 dias" },
                    { value: "15", label: "15 dias" },
                    { value: "30", label: "30 dias" },
                  ]}
                  value={autoRetention}
                  onChange={(value) => onAutoRetentionChange(value || "15")}
                  w={140}
                />
                <Button onClick={onSaveAutoConfig} loading={saveAutoConfigLoading}>
                  Salvar agendamento
                </Button>
              </Group>

              {autoConfig && (
                <Text size="sm" c="dimmed">
                  Frequencia: {autoConfig.schedule_mode === "WEEKLY" ? "semanal" : "diaria"}
                  {autoConfig.schedule_mode === "WEEKLY"
                    ? ` (${weekdayOptions[autoConfig.weekday]?.label || "Segunda-feira"})`
                    : ""}
                  {" | "}
                  Ultima execucao: {autoConfig.last_run_date || "nunca"} | Resultado: {autoConfig.last_result || "sem execucoes"} | Ultimo arquivo:{" "}
                  {autoConfig.last_backup_name || "-"}
                </Text>
              )}
            </>
          )}
        </Stack>
      </Card>

      <Card withBorder>
        <Stack>
          <Title order={4}>Restaurar backup</Title>
          {backupsLoading ? (
            <Loader size="sm" />
          ) : (
            <>
              <Select
                label="Backup"
                placeholder={backupOptions.length > 0 ? "Selecione o backup" : "Nenhum backup disponivel"}
                data={backupOptions}
                value={selectedBackupName}
                onChange={onSelectedBackupChange}
                searchable
              />

              <Group>
                <Button variant="light" disabled={!selectedBackupName} loading={validateSelectedLoading} onClick={onValidateSelected}>
                  Validar backup selecionado
                </Button>
                <Button variant="light" disabled={!selectedBackupName} loading={restoreTestLoading} onClick={onTestRestore}>
                  Testar restauracao
                </Button>
                <Button color="red" disabled={!selectedBackupName} loading={restoreLoading} onClick={onRestore}>
                  Restaurar backup
                </Button>
              </Group>

              {selectedBackup && (
                <Text size="sm" c="dimmed">
                  Selecionado: {selectedBackup.name} | {formatBytes(selectedBackup.size)} |{" "}
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
          <BackupFilesTable backups={backups} />
        </Stack>
      </Card>
    </Stack>
  );
}
