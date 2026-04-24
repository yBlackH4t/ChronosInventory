import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../lib/apiClient";
import type { BackupAutoConfigIn, BackupAutoConfigOut, SuccessResponse } from "../lib/api";
import { notifyError, notifySuccess } from "../lib/notify";

export const AUTO_SCHEDULE_MODE_OPTIONS = [
  { value: "DAILY", label: "Diario" },
  { value: "WEEKLY", label: "Semanal" },
] as const;

export const AUTO_WEEKDAY_OPTIONS = [
  { value: "0", label: "Segunda-feira" },
  { value: "1", label: "Terca-feira" },
  { value: "2", label: "Quarta-feira" },
  { value: "3", label: "Quinta-feira" },
  { value: "4", label: "Sexta-feira" },
  { value: "5", label: "Sabado" },
  { value: "6", label: "Domingo" },
] as const;

export function useBackupAutoConfig() {
  const queryClient = useQueryClient();
  const [autoEnabledInput, setAutoEnabledInput] = useState<boolean | null>(null);
  const [autoHourInput, setAutoHourInput] = useState<number | null>(null);
  const [autoMinuteInput, setAutoMinuteInput] = useState<number | null>(null);
  const [autoRetentionInput, setAutoRetentionInput] = useState<string | null>(null);
  const [autoScheduleModeInput, setAutoScheduleModeInput] = useState<"DAILY" | "WEEKLY" | null>(null);
  const [autoWeekdayInput, setAutoWeekdayInput] = useState<string | null>(null);

  const autoConfigQuery = useQuery<SuccessResponse<BackupAutoConfigOut>>({
    queryKey: ["backup-auto-config"],
    queryFn: ({ signal }) => api.backupAutoConfig({ signal }),
  });

  const updateAutoConfigMutation = useMutation<
    SuccessResponse<BackupAutoConfigOut>,
    Error,
    BackupAutoConfigIn
  >({
    mutationFn: (payload) => api.backupUpdateAutoConfig(payload),
    onSuccess: (response) => {
      notifySuccess("Configuracao de backup automatico atualizada");
      queryClient.setQueryData(["backup-auto-config"], response);
      setAutoEnabledInput(null);
      setAutoHourInput(null);
      setAutoMinuteInput(null);
      setAutoRetentionInput(null);
      setAutoScheduleModeInput(null);
      setAutoWeekdayInput(null);
    },
    onError: (error) => notifyError(error),
  });

  const autoConfig = autoConfigQuery.data?.data;
  const autoEnabled = autoEnabledInput ?? Boolean(autoConfig?.enabled ?? false);
  const autoHour = autoHourInput ?? Number(autoConfig?.hour ?? 18);
  const autoMinute = autoMinuteInput ?? Number(autoConfig?.minute ?? 0);
  const autoRetention = autoRetentionInput ?? String(autoConfig?.retention_days ?? 15);
  const autoScheduleMode = autoScheduleModeInput ?? autoConfig?.schedule_mode ?? "DAILY";
  const autoWeekday = autoWeekdayInput ?? String(autoConfig?.weekday ?? 0);

  const saveAutoConfig = () => {
    updateAutoConfigMutation.mutate({
      enabled: autoEnabled,
      hour: Number(autoHour ?? 0),
      minute: Number(autoMinute ?? 0),
      retention_days: Number(autoRetention),
      schedule_mode: autoScheduleMode,
      weekday: Number(autoWeekday),
    });
  };

  return {
    autoConfig,
    autoConfigLoading: autoConfigQuery.isLoading,
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
    scheduleOptions: AUTO_SCHEDULE_MODE_OPTIONS.map((item) => ({ value: item.value, label: item.label })),
    weekdayOptions: AUTO_WEEKDAY_OPTIONS.map((item) => ({ value: item.value, label: item.label })),
    saveAutoConfig,
    saveAutoConfigLoading: updateAutoConfigMutation.isPending,
  };
}
