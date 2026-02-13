import { Button, Card, Stack, Text, Title } from "@mantine/core";
import { useMutation } from "@tanstack/react-query";

import { api } from "../lib/apiClient";
import type { DownloadResponse } from "../lib/api";
import { downloadBlob } from "../lib/download";
import { notifyError, notifySuccess } from "../lib/notify";

export default function ExportPage() {
  const exportMutation = useMutation<DownloadResponse, Error, void>({
    mutationFn: () => api.exportProducts(),
    onSuccess: (res) => {
      const filename = res.filename || "export.xlsx";
      downloadBlob(res.blob, filename);
      notifySuccess("Exportacao concluida");
    },
    onError: (error) => notifyError(error),
  });

  return (
    <Stack gap="lg">
      <Title order={2}>Exportar produtos</Title>
      <Card withBorder>
        <Stack>
          <Text>Gera um arquivo XLSX com todos os produtos.</Text>
          <Button onClick={() => exportMutation.mutate()} loading={exportMutation.isPending}>
            Exportar XLSX
          </Button>
        </Stack>
      </Card>
    </Stack>
  );
}
