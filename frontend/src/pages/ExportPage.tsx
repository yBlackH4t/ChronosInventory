import { Badge, Button, Card, Group, Stack, Text } from "@mantine/core";
import { useMutation } from "@tanstack/react-query";

import { api } from "../lib/apiClient";
import PageHeader from "../components/ui/PageHeader";
import { ApiError, type DownloadResponse } from "../lib/api";
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

  const stockOverviewMutation = useMutation<DownloadResponse, Error, void>({
    mutationFn: () => api.exportStockOverview(),
    onSuccess: (res) => {
      const filename = res.filename || "estoque_resumo.xlsx";
      downloadBlob(res.blob, filename);
      notifySuccess("Resumo visual de estoque gerado.");
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 404) {
        notifyError(
          new Error("O backend local ainda nao conhece esta exportacao. Atualize/recompile o backend do app e tente novamente."),
          "Backend local desatualizado."
        );
        return;
      }
      notifyError(error);
    },
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

      <Card withBorder>
        <Stack gap="md">
          <Group justify="space-between">
            <Text fw={600}>Resumo visual de estoque</Text>
            <Badge variant="outline" color="grape">
              XLSX formatado
            </Badge>
          </Group>
          <Text>
            Gera uma planilha mais apresentável, com aba de resumo, totais de Canoas, Passo Fundo,
            total global de peças e a listagem completa dos itens.
          </Text>
          <Button onClick={() => stockOverviewMutation.mutate()} loading={stockOverviewMutation.isPending}>
            Exportar resumo formatado
          </Button>
        </Stack>
      </Card>
    </Stack>
  );
}
