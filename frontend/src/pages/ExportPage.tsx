import { Button, Divider, Group, Stack, Text } from "@mantine/core";
import {
  IconDownload,
  IconReportAnalytics,
  IconTable,
  IconFileExport,
} from "@tabler/icons-react";
import { useMutation } from "@tanstack/react-query";

import { api } from "../lib/apiClient";
import PageHeader from "../components/ui/PageHeader";
import { ApiError, type DownloadResponse } from "../lib/api";
import { downloadBlob } from "../lib/download";
import { OUTDATED_APP_MESSAGE, notifyError, notifySuccess } from "../lib/notify";

export default function ExportPage() {
  const exportMutation = useMutation<DownloadResponse, Error, void>({
    mutationFn: () => api.exportProducts(),
    onSuccess: (res) => {
      const filename = res.filename || "export.xlsx";
      downloadBlob(res.blob, filename);
      notifySuccess("Exportação concluída");
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
          new Error(
            OUTDATED_APP_MESSAGE,
          ),
          "Chronos desatualizado",
        );
        return;
      }
      notifyError(error);
    },
  });

  return (
    <Stack gap="lg">
      <PageHeader
        icon={IconFileExport}
        title="Exportar"
        subtitle="Planilhas para auditoria, análise e envio externo."
      />

      <div className="surface-panel" style={{ overflow: "hidden", maxWidth: 860 }}>
        <Group justify="space-between" wrap="wrap" gap="sm" px="lg" py="md">
          <Group gap="sm" wrap="nowrap" flex={1} miw={260}>
            <span className="settings-item-icon">
              <IconTable size={18} stroke={1.5} />
            </span>
            <div>
              <Text size="sm" fw={600}>
                Produtos e estoques
              </Text>
              <Text size="xs" c="dimmed">
                Todos os produtos com o estoque atual de cada filial. Formato bruto, bom para reimportar ou cruzar dados.
              </Text>
            </div>
          </Group>
          <Button
            variant="default"
            leftSection={<IconDownload size={16} stroke={1.5} />}
            onClick={() => exportMutation.mutate()}
            loading={exportMutation.isPending}
          >
            Baixar XLSX
          </Button>
        </Group>
        <Divider color="var(--border)" />
        <Group justify="space-between" wrap="wrap" gap="sm" px="lg" py="md">
          <Group gap="sm" wrap="nowrap" flex={1} miw={260}>
            <span className="settings-item-icon">
              <IconReportAnalytics size={18} stroke={1.5} />
            </span>
            <div>
              <Text size="sm" fw={600}>
                Resumo de estoque formatado
              </Text>
              <Text size="xs" c="dimmed">
                Planilha apresentável com aba de resumo, totais por filial, total global de peças e a lista completa.
              </Text>
            </div>
          </Group>
          <Button
            variant="default"
            leftSection={<IconDownload size={16} stroke={1.5} />}
            onClick={() => stockOverviewMutation.mutate()}
            loading={stockOverviewMutation.isPending}
          >
            Baixar XLSX
          </Button>
        </Group>
      </div>
    </Stack>
  );
}
