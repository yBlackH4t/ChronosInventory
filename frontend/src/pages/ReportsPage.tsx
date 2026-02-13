import { Button, Card, Stack, Text, Title } from "@mantine/core";
import { useMutation } from "@tanstack/react-query";

import { api } from "../lib/apiClient";
import type { DownloadResponse } from "../lib/api";
import { downloadBlob } from "../lib/download";
import { notifyError, notifySuccess } from "../lib/notify";

export default function ReportsPage() {
  const reportMutation = useMutation<DownloadResponse, Error, void>({
    mutationFn: () => api.reportStockPDF(),
    onSuccess: (res) => {
      const filename = res.filename || "relatorio.pdf";
      downloadBlob(res.blob, filename);
      notifySuccess("Relatorio gerado");
    },
    onError: (error) => notifyError(error),
  });

  return (
    <Stack gap="lg">
      <Title order={2}>Relatorios</Title>
      <Card withBorder>
        <Stack>
          <Text>Gera um PDF de estoque atual.</Text>
          <Button onClick={() => reportMutation.mutate()} loading={reportMutation.isPending}>
            Gerar relatorio PDF
          </Button>
        </Stack>
      </Card>
    </Stack>
  );
}
