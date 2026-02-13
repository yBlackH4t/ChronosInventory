import { useState } from "react";
import { Button, Stack, Text, Title, FileInput, Card } from "@mantine/core";
import { useMutation } from "@tanstack/react-query";

import { api } from "../lib/apiClient";
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
      <Title order={2}>Importar Excel</Title>
      <Card withBorder>
        <Stack>
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
          <Title order={4}>Resultado</Title>
          <Text>Importados: {result.imported}</Text>
          <Text>Atualizados: {result.updated}</Text>
          <Text>Ignorados: {result.skipped}</Text>
          {result.errors?.length > 0 && (
            <Text c="red">Erros: {result.errors.join(", ")}</Text>
          )}
          {result.message && <Text c="dimmed">{result.message}</Text>}
        </Card>
      )}
    </Stack>
  );
}
