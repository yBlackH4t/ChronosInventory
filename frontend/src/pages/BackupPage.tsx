import { Button, Card, Stack, Text, Title } from "@mantine/core";
import { useMutation } from "@tanstack/react-query";
import dayjs from "dayjs";

import { api } from "../lib/apiClient";
import type { BackupOut, SuccessResponse } from "../lib/api";
import { notifyError, notifySuccess } from "../lib/notify";

export default function BackupPage() {
  const backupMutation = useMutation<SuccessResponse<BackupOut>, Error, void>({
    mutationFn: () => api.backupCreate(),
    onSuccess: () => {
      notifySuccess("Backup criado");
    },
    onError: (error) => notifyError(error),
  });

  const data = backupMutation.data?.data;

  return (
    <Stack gap="lg">
      <Title order={2}>Backup</Title>
      <Card withBorder>
        <Stack>
          <Text>Cria um backup automatico do banco local.</Text>
          <Button onClick={() => backupMutation.mutate()} loading={backupMutation.isPending}>
            Criar backup
          </Button>
        </Stack>
      </Card>

      {data && (
        <Card withBorder>
          <Title order={4}>Backup criado</Title>
          <Text>Arquivo: {data.path}</Text>
          <Text>Tamanho: {data.size} bytes</Text>
          <Text>Data: {dayjs(data.created_at).format("DD/MM/YYYY HH:mm")}</Text>
        </Card>
      )}

      <Card withBorder>
        <Text c="dimmed">Restaurar backup: em breve</Text>
      </Card>
    </Stack>
  );
}
