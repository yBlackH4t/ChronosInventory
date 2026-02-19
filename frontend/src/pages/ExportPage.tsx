import { Badge, Button, Card, Group, Stack, Text } from "@mantine/core";
import { useMutation } from "@tanstack/react-query";

import { api } from "../lib/apiClient";
import PageHeader from "../components/ui/PageHeader";
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
      <PageHeader
        title="Exportar produtos"
        subtitle="Gere uma planilha consolidada para auditoria, analise e envio externo."
      />

      <Card withBorder>
        <Stack gap="md">
          <Group justify="space-between">
            <Text fw={600}>Arquivo de saida</Text>
            <Badge variant="outline" color="gray">
              Formato XLSX
            </Badge>
          </Group>
          <Text>Gera um arquivo XLSX com todos os produtos e seus estoques atuais.</Text>
          <Button onClick={() => exportMutation.mutate()} loading={exportMutation.isPending}>
            Exportar XLSX
          </Button>
        </Stack>
      </Card>
    </Stack>
  );
}
