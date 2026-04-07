import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, Group, NumberInput, Select, Stack, Text } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { useMutation } from "@tanstack/react-query";
import dayjs from "dayjs";

import { api } from "../lib/apiClient";
import PageHeader from "../components/ui/PageHeader";
import { downloadBlob } from "../lib/download";
import { loadTabState, saveTabState } from "../state/tabStateCache";
import type { DownloadResponse } from "../lib/api";
import { notifyError, notifySuccess } from "../lib/notify";

type ReportsTabState = {
  salesDateFrom: string | null;
  salesDateTo: string | null;
  salesScope: "AMBOS" | "CANOAS" | "PF";
  inactiveDays: number;
  inactiveDateTo: string | null;
  inactiveScope: "AMBOS" | "CANOAS" | "PF";
};

const REPORTS_TAB_ID = "reports";
const DEFAULT_REPORTS_TAB_STATE: ReportsTabState = {
  salesDateFrom: dayjs().startOf("month").format("YYYY-MM-DD"),
  salesDateTo: dayjs().format("YYYY-MM-DD"),
  salesScope: "AMBOS",
  inactiveDays: 30,
  inactiveDateTo: dayjs().format("YYYY-MM-DD"),
  inactiveScope: "AMBOS",
};

const SCOPE_OPTIONS = [
  { value: "AMBOS", label: "Ambos" },
  { value: "CANOAS", label: "Canoas" },
  { value: "PF", label: "Passo Fundo" },
] as const;

export default function ReportsPage() {
  const persistedState = useMemo(
    () => loadTabState<ReportsTabState>(REPORTS_TAB_ID) ?? DEFAULT_REPORTS_TAB_STATE,
    []
  );

  const [salesDateFrom, setSalesDateFrom] = useState<Date | null>(
    persistedState.salesDateFrom ? dayjs(persistedState.salesDateFrom).toDate() : dayjs().startOf("month").toDate()
  );
  const [salesDateTo, setSalesDateTo] = useState<Date | null>(
    persistedState.salesDateTo ? dayjs(persistedState.salesDateTo).toDate() : dayjs().toDate()
  );
  const [salesScope, setSalesScope] = useState<"AMBOS" | "CANOAS" | "PF">(persistedState.salesScope);
  const [inactiveDays, setInactiveDays] = useState<number>(persistedState.inactiveDays);
  const [inactiveDateTo, setInactiveDateTo] = useState<Date | null>(
    persistedState.inactiveDateTo ? dayjs(persistedState.inactiveDateTo).toDate() : dayjs().toDate()
  );
  const [inactiveScope, setInactiveScope] = useState<"AMBOS" | "CANOAS" | "PF">(persistedState.inactiveScope);

  useEffect(() => {
    saveTabState<ReportsTabState>(REPORTS_TAB_ID, {
      salesDateFrom: salesDateFrom ? dayjs(salesDateFrom).format("YYYY-MM-DD") : null,
      salesDateTo: salesDateTo ? dayjs(salesDateTo).format("YYYY-MM-DD") : null,
      salesScope,
      inactiveDays,
      inactiveDateTo: inactiveDateTo ? dayjs(inactiveDateTo).format("YYYY-MM-DD") : null,
      inactiveScope,
    });
  }, [inactiveDateTo, inactiveDays, inactiveScope, salesDateFrom, salesDateTo, salesScope]);

  const stockReportMutation = useMutation<DownloadResponse, Error, void>({
    mutationFn: () => api.reportStockPDF(),
    onSuccess: (res) => {
      const filename = res.filename || "Relatorio_Estoque.pdf";
      downloadBlob(res.blob, filename);
      notifySuccess("Relatorio de estoque gerado.");
    },
    onError: (error) => notifyError(error),
  });

  const salesReportMutation = useMutation<DownloadResponse, Error, void>({
    mutationFn: () =>
      api.reportRealSalesPDF({
        date_from: dayjs(salesDateFrom || new Date()).format("YYYY-MM-DD"),
        date_to: dayjs(salesDateTo || new Date()).format("YYYY-MM-DD"),
        scope: salesScope,
      }),
    onSuccess: (res) => {
      downloadBlob(res.blob, res.filename || "Relatorio_Vendas_Reais.pdf");
      notifySuccess("Relatorio de vendas reais gerado.");
    },
    onError: (error) => notifyError(error),
  });

  const inactiveReportMutation = useMutation<DownloadResponse, Error, void>({
    mutationFn: () =>
      api.reportInactiveStockPDF({
        days: inactiveDays,
        date_to: dayjs(inactiveDateTo || new Date()).format("YYYY-MM-DD"),
        scope: inactiveScope,
      }),
    onSuccess: (res) => {
      downloadBlob(res.blob, res.filename || "Relatorio_Estoque_Parado.pdf");
      notifySuccess("Relatorio de estoque parado gerado.");
    },
    onError: (error) => notifyError(error),
  });

  const resetView = () => {
    setSalesDateFrom(dayjs().startOf("month").toDate());
    setSalesDateTo(dayjs().toDate());
    setSalesScope("AMBOS");
    setInactiveDays(30);
    setInactiveDateTo(dayjs().toDate());
    setInactiveScope("AMBOS");
    saveTabState(REPORTS_TAB_ID, DEFAULT_REPORTS_TAB_STATE);
  };

  return (
    <Stack gap="lg">
      <PageHeader
        title="Relatorios"
        subtitle="Documentos prontos para conferencia interna, vendas reais e itens parados."
        actions={(
          <>
            <Badge variant="light">Filtros salvos nesta sessao</Badge>
            <Button size="xs" variant="subtle" onClick={resetView}>
              Resetar visao
            </Button>
          </>
        )}
      />

      <Card withBorder>
        <Stack gap="md">
          <Group justify="space-between">
            <Text fw={600}>Relatorio de estoque</Text>
            <Badge variant="outline" color="gray">
              PDF
            </Badge>
          </Group>
          <Text size="sm" c="dimmed">
            Lista os itens ativos com saldo atual por local. Ideal para conferencia rapida do estoque visivel no sistema.
          </Text>
          <Button
            onClick={() => stockReportMutation.mutate()}
            loading={stockReportMutation.isPending}
          >
            Gerar relatorio de estoque
          </Button>
        </Stack>
      </Card>

      <Card withBorder>
        <Stack gap="md">
          <Group justify="space-between">
            <Text fw={600}>Relatorio de vendas reais</Text>
            <Badge variant="outline" color="blue">
              SAIDA + OPERACAO_NORMAL
            </Badge>
          </Group>
          <Text size="sm" c="dimmed">
            Mostra apenas vendas reais. Transferencia externa, ajuste e devolucao ficam fora deste documento.
          </Text>
          <Group align="end" wrap="wrap">
            <DatePickerInput
              label="De"
              value={salesDateFrom}
              onChange={(value) => setSalesDateFrom(value as Date | null)}
              w={180}
            />
            <DatePickerInput
              label="Ate"
              value={salesDateTo}
              onChange={(value) => setSalesDateTo(value as Date | null)}
              w={180}
            />
            <Select
              label="Escopo"
              data={SCOPE_OPTIONS.map((item) => ({ value: item.value, label: item.label }))}
              value={salesScope}
              onChange={(value) => setSalesScope((value as "AMBOS" | "CANOAS" | "PF") || "AMBOS")}
              allowDeselect={false}
              w={180}
            />
            <Button
              onClick={() => salesReportMutation.mutate()}
              loading={salesReportMutation.isPending}
              disabled={!salesDateFrom || !salesDateTo}
            >
              Gerar relatorio de vendas
            </Button>
          </Group>
        </Stack>
      </Card>

      <Card withBorder>
        <Stack gap="md">
          <Group justify="space-between">
            <Text fw={600}>Relatorio de estoque parado</Text>
            <Badge variant="outline" color="orange">
              Sem giro
            </Badge>
          </Group>
          <Text size="sm" c="dimmed">
            Mostra itens ativos com estoque atual e sem movimentacao no periodo definido. Bom para revisao de itens encalhados.
          </Text>
          <Group align="end" wrap="wrap">
            <NumberInput
              label="Dias sem movimentacao"
              min={1}
              max={365}
              value={inactiveDays}
              onChange={(value) => setInactiveDays(Number(value || 30))}
              w={180}
            />
            <DatePickerInput
              label="Data base"
              value={inactiveDateTo}
              onChange={(value) => setInactiveDateTo(value as Date | null)}
              w={180}
            />
            <Select
              label="Escopo"
              data={SCOPE_OPTIONS.map((item) => ({ value: item.value, label: item.label }))}
              value={inactiveScope}
              onChange={(value) => setInactiveScope((value as "AMBOS" | "CANOAS" | "PF") || "AMBOS")}
              allowDeselect={false}
              w={180}
            />
            <Button
              onClick={() => inactiveReportMutation.mutate()}
              loading={inactiveReportMutation.isPending}
              disabled={!inactiveDateTo}
            >
              Gerar relatorio de estoque parado
            </Button>
          </Group>
        </Stack>
      </Card>
    </Stack>
  );
}
