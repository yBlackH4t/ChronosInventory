import { useState } from "react";
import { Badge, Button, Card, Group, Stack, Text, Title, FileInput } from "@mantine/core";
import { useMutation } from "@tanstack/react-query";

import { api } from "../lib/apiClient";
import PageHeader from "../components/ui/PageHeader";
import type { ImportSummary, SuccessResponse } from "../lib/api";
import { notifyError, notifySuccess } from "../lib/notify";

const MAX_SIZE_BYTES = 50 * 1024 * 1024;

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportSummary | null>(null);

  const importMutation = useMutation<SuccessResponse<ImportSummary>, Error, File>({
    mutationFn: (payload: File) => api.importExcel(payload),
    onSuccess: (res) => {
      setResult(res.data);
      notifySuccess("Importacao concluida");
    },
    onError: (error) => {
      notifyError(error);
    },
  });

  const handleImport = () => {
    if (!file) return;
    if (file.size > MAX_SIZE_BYTES) {
      notifyError(new Error("Arquivo excede 50MB"));
      return;
    }
    importMutation.mutate(file);
  };

  return (
    <Stack gap="lg">
      <PageHeader
        title="Importar Excel"
        subtitle="Atualize o estoque em lote com validacao automatica e resumo de processamento."
      />

      <Card withBorder>
        <Stack gap="md">
          <Group justify="space-between">
            <Text fw={600}>Arquivo de importacao</Text>
            <Badge variant="outline" color="gray">
              Limite: 50 MB
            </Badge>
          </Group>
          <FileInput
            label="Arquivo Excel"
            placeholder="Selecione .xlsx/.xls"
            value={file}
            onChange={setFile}
            accept=".xlsx,.xls"
          />
          <Button onClick={handleImport} loading={importMutation.isPending} disabled={!file}>
            Importar
          </Button>
        </Stack>
      </Card>

      {result && (
        <Card withBorder>
          <Stack gap="xs">
            <Title order={4}>Resultado</Title>
            <Text>Importados: {result.imported}</Text>
            <Text>Atualizados: {result.updated}</Text>
            <Text>Ignorados: {result.skipped}</Text>
            {result.errors?.length > 0 && (
              <Text c="red">Erros: {result.errors.join(", ")}</Text>
            )}
            {result.message && <Text c="dimmed">{result.message}</Text>}
          </Stack>
        </Card>
      )}
    </Stack>
  );
}
