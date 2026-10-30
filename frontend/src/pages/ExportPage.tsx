import type { ReactNode } from "react";
import { Button, Group, SimpleGrid, Stack, Text } from "@mantine/core";
import {
  IconDownload,
  IconReportAnalytics,
  IconTable,
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
        title="Exportar"
        subtitle="Planilhas para auditoria, análise e envio externo."
      />

      {/* Duas planilhas lado a lado, cada uma com o seu botão grande. */}
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
        <ExportCard
          icon={<IconTable size={18} stroke={1.5} />}
          title="Produtos e estoques"
          description="Todos os produtos com o estoque atual de cada filial. Formato bruto, bom para reimportar ou cruzar dados."
          loading={exportMutation.isPending}
          onDownload={() => exportMutation.mutate()}
        />
        <ExportCard
          icon={<IconReportAnalytics size={18} stroke={1.5} />}
          title="Resumo de estoque formatado"
          description="Planilha apresentável com aba de resumo, totais por filial, total global de peças e a lista completa."
          loading={stockOverviewMutation.isPending}
          onDownload={() => stockOverviewMutation.mutate()}
        />
      </SimpleGrid>
    </Stack>
  );
}

function ExportCard({
  icon,
  title,
  description,
  loading,
  onDownload,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  loading: boolean;
  onDownload: () => void;
}) {
  return (
    <Stack className="surface-panel" gap="md" p="lg" justify="space-between">
      <Group gap="sm" wrap="nowrap" align="flex-start">
        <span className="settings-item-icon">{icon}</span>
        <div>
          <Text size="sm" fw={600}>
            {title}
          </Text>
          <Text size="xs" c="dimmed">
            {description}
          </Text>
        </div>
      </Group>
      <Button size="md" fullWidth leftSection={<IconDownload size={18} stroke={1.5} />} onClick={onDownload} loading={loading}>
        Baixar planilha
      </Button>
    </Stack>
  );
}
