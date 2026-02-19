import { Badge, Button, Card, Group, Stack, Text } from "@mantine/core";
import { useMutation } from "@tanstack/react-query";

import { api } from "../lib/apiClient";
import PageHeader from "../components/ui/PageHeader";
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
      <PageHeader
        title="Relatorios"
        subtitle="Gere documentos para conferencia interna e compartilhamento com a operacao."
      />

      <Card withBorder>
        <Stack gap="md">
          <Group justify="space-between">
            <Text fw={600}>Relatorio de estoque</Text>
            <Badge variant="outline" color="gray">
              Formato PDF
            </Badge>
          </Group>
          <Text>Gera um PDF com o estoque atual e informacoes principais dos produtos.</Text>
          <Button onClick={() => reportMutation.mutate()} loading={reportMutation.isPending}>
            Gerar relatorio PDF
          </Button>
        </Stack>
      </Card>
    </Stack>
  );
}
