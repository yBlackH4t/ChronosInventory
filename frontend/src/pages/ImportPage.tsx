import { useState } from "react";
import {
  Badge,
  Button,
  Card,
  Group,
  Stack,
  Text,
  Title,
  FileInput,
  Stepper,
  Select,
  Table,
  Radio,
  Switch,
  TextInput,
} from "@mantine/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "../lib/apiClient";
import PageHeader from "../components/ui/PageHeader";
import type { ImportSummary } from "../lib/api";
import { notifyError, notifySuccess } from "../lib/notify";
import { useLocations } from "../hooks/useLocations";

const MAX_SIZE_BYTES = 50 * 1024 * 1024;

export default function ImportPage() {
  const [activeStep, setActiveStep] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [analysisData, setAnalysisData] = useState<{
    file_id: string;
    headers: string[];
    preview: any[];
  } | null>(null);
  const [matchBy, setMatchBy] = useState<string>("name");
  const [nameCol, setNameCol] = useState<string | null>(null);
  const [idCol, setIdCol] = useState<string | null>(null);
  const [locMappings, setLocMappings] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ImportSummary | null>(null);

  // New UX state
  const [importObjective, setImportObjective] = useState<"new" | "update">(
    "new",
  );
  const [updateStock, setUpdateStock] = useState<boolean>(true);
  const [motivo, setMotivo] = useState<string>(
    "Ajuste via Importação de Planilha",
  );

  const { activeLocations } = useLocations();
  const queryClient = useQueryClient();

  const analyzeMutation = useMutation({
    mutationFn: (payload: File) => api.analyzeImportFile(payload),
    onSuccess: (res) => {
      setAnalysisData(res.data);
      setActiveStep(1);
    },
    onError: (error) => notifyError(error, "Falha ao analisar arquivo"),
  });

  const executeMutation = useMutation({
    mutationFn: () => {
      if (!analysisData || !nameCol)
        throw new Error("Faltam dados de mapeamento.");
      return api.executeImport({
        file_id: analysisData.file_id,
        match_by: importObjective === "new" ? "name" : matchBy,
        name_col: nameCol,
        id_col: idCol || undefined,
        location_mappings: updateStock ? locMappings : {},
        update_stock: importObjective === "new" ? true : updateStock,
        motivo: importObjective === "new" ? "Criado via Importação" : motivo,
      });
    },
    onSuccess: (res) => {
      setResult(res.data);
      setActiveStep(2);
      notifySuccess("Importacao concluida com sucesso");
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
    },
    onError: (error) => notifyError(error, "Falha na importacao"),
  });

  const handleAnalyze = () => {
    if (!file) return;
    if (file.size > MAX_SIZE_BYTES) {
      notifyError(new Error("Arquivo excede 50MB"));
      return;
    }
    analyzeMutation.mutate(file);
  };

  const handleExecute = () => {
    if (!nameCol) {
      notifyError(new Error("Mapeie a coluna Nome do Produto"));
      return;
    }
    if (importObjective === "update" && matchBy === "id" && !idCol) {
      notifyError(new Error("Mapeie a coluna ID para buscar pelo ID"));
      return;
    }
    executeMutation.mutate();
  };

  const reset = () => {
    setFile(null);
    setAnalysisData(null);
    setResult(null);
    setMatchBy("name");
    setNameCol(null);
    setIdCol(null);
    setLocMappings({});
    setActiveStep(0);
    setImportObjective("new");
    setUpdateStock(true);
    setMotivo("Ajuste via Importação de Planilha");
  };

  const headerOptions =
    analysisData?.headers.map((h) => ({ value: h, label: h })) || [];

  return (
    <Stack gap="lg">
      <PageHeader
        title="Assistente de Importacao Inteligente"
        subtitle="Importe qualquer planilha Excel e mapeie as colunas para o seu estoque dinamicamente."
      />

      <Card withBorder>
        <Stepper
          active={activeStep}
          onStepClick={setActiveStep}
          allowNextStepsSelect={false}
        >
          <Stepper.Step label="Upload" description="Envie o arquivo">
            <Stack gap="md" mt="xl">
              <Group justify="space-between">
                <Text fw={600}>Arquivo de Importacao (.xlsx ou .csv)</Text>
                <Badge variant="outline" color="gray">
                  Limite: 50 MB
                </Badge>
              </Group>
              <FileInput
                label="Selecione sua planilha"
                placeholder="Clique aqui para selecionar"
                value={file}
                onChange={setFile}
                accept=".xlsx,.xls,.csv"
                size="md"
              />
              <Group justify="flex-end">
                <Button
                  onClick={handleAnalyze}
                  loading={analyzeMutation.isPending}
                  disabled={!file}
                >
                  Avançar e Analisar
                </Button>
              </Group>
            </Stack>
          </Stepper.Step>

          <Stepper.Step label="Mapeamento" description="Faça o De/Para">
            {analysisData && (
              <Stack gap="lg" mt="xl">
                <Card withBorder bg="dark.7">
                  <Title order={5} mb="md">
                    Qual o objetivo principal desta importação?
                  </Title>
                  <Radio.Group
                    value={importObjective}
                    onChange={(val: any) => setImportObjective(val)}
                  >
                    <Stack gap="sm">
                      <Radio
                        value="new"
                        label="Cadastrar Novos Produtos (Começar do Zero / Planilha Nova)"
                        description="O sistema vai criar todos os produtos como novos e injetar o estoque."
                      />
                      <Radio
                        value="update"
                        label="Atualizar Produtos Existentes"
                        description="Atualizar nomes ou estoque de produtos que já existem no sistema (produtos novos também serão criados se não existirem)."
                      />
                    </Stack>
                  </Radio.Group>
                </Card>

                {importObjective === "update" && (
                  <Card withBorder bg="dark.6">
                    <Title order={5} mb="md">
                      Como devemos cruzar os dados da planilha com o sistema?
                    </Title>
                    <Select
                      label="Chave de Busca"
                      description="Selecione qual campo o sistema usará para encontrar o produto no banco."
                      data={[
                        {
                          value: "name",
                          label:
                            "Pelo Nome do Produto (Recomendado se os IDs da planilha estiverem incorretos)",
                        },
                        { value: "id", label: "Pelo ID Interno" },
                      ]}
                      value={matchBy}
                      onChange={(val) => setMatchBy(val || "name")}
                    />
                  </Card>
                )}

                <Card withBorder>
                  <Title order={5} mb="md">
                    Mapeamento de Dados Básicos
                  </Title>
                  <Stack gap="sm">
                    <Select
                      label="Coluna: ID do Produto"
                      description={
                        importObjective === "new"
                          ? "Se a planilha tiver IDs, selecione. Se deixar em branco, criaremos IDs numéricos automáticos."
                          : "Coluna onde estão os IDs na planilha."
                      }
                      placeholder="Ignorar (Deixar em branco)"
                      data={[
                        { value: "", label: "Ignorar (Deixar em branco)" },
                        ...headerOptions,
                      ]}
                      value={idCol}
                      onChange={setIdCol}
                      clearable
                      required={
                        importObjective === "update" && matchBy === "id"
                      }
                    />
                    <Select
                      label="Coluna: Nome do Produto"
                      placeholder="Selecione a coluna"
                      data={headerOptions}
                      value={nameCol}
                      onChange={setNameCol}
                      required
                    />
                  </Stack>
                </Card>

                {importObjective === "update" && (
                  <Card withBorder bg="dark.6">
                    <Group justify="space-between" mb="xs">
                      <Title order={5}>Atualizar Saldos?</Title>
                      <Switch
                        checked={updateStock}
                        onChange={(e) =>
                          setUpdateStock(e.currentTarget.checked)
                        }
                        size="md"
                        color="blue"
                        onLabel="SIM"
                        offLabel="NÃO"
                      />
                    </Group>
                    <Text c="dimmed" size="sm" mb="md">
                      Ative esta opção se você quiser que as quantidades da
                      planilha sejam inseridas/atualizadas no sistema como um
                      ajuste de inventário.
                    </Text>
                    {updateStock && (
                      <TextInput
                        label="Motivo da Atualização de Saldo"
                        description="Este texto aparecerá no Histórico de Movimentações para auditoria."
                        value={motivo}
                        onChange={(e) => setMotivo(e.currentTarget.value)}
                      />
                    )}
                  </Card>
                )}

                {(importObjective === "new" || updateStock) && (
                  <Card withBorder>
                    <Title order={5} mb="md">
                      Mapeamento de Estoque por Local
                    </Title>
                    <Text c="dimmed" size="sm" mb="md">
                      Selecione qual coluna do seu Excel contém as quantidades
                      para cada um dos seus locais ativos.
                    </Text>
                    <Stack gap="sm">
                      {activeLocations && activeLocations.length > 0 ? (
                        activeLocations.map((loc: any) => (
                          <Select
                            key={loc.id}
                            label={`Estoque em: ${loc.label || loc.name}`}
                            placeholder="Ignorar (Deixar Zerado)"
                            data={[
                              { value: "", label: "Ignorar (Deixar Zerado)" },
                              ...headerOptions,
                            ]}
                            value={locMappings[String(loc.id)] || ""}
                            onChange={(val) =>
                              setLocMappings((prev) => ({
                                ...prev,
                                [String(loc.id)]: val || "",
                              }))
                            }
                            clearable
                          />
                        ))
                      ) : (
                        <Text c="dimmed">
                          Nenhum local ativo encontrado no sistema. Por favor,
                          cadastre um local primeiro.
                        </Text>
                      )}
                    </Stack>
                  </Card>
                )}

                <Card withBorder>
                  <Title order={5} mb="xs">
                    Pre-visualizacao (Primeiras 5 linhas)
                  </Title>
                  <Table striped highlightOnHover>
                    <Table.Thead>
                      <Table.Tr>
                        {analysisData.headers.map((h) => (
                          <Table.Th key={h}>{h}</Table.Th>
                        ))}
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {analysisData.preview.map((row, i) => (
                        <Table.Tr key={i}>
                          {analysisData.headers.map((h) => (
                            <Table.Td key={h}>{row[h]}</Table.Td>
                          ))}
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Card>

                <Group justify="space-between">
                  <Button variant="default" onClick={() => setActiveStep(0)}>
                    Voltar
                  </Button>
                  <Button
                    onClick={handleExecute}
                    loading={executeMutation.isPending}
                    disabled={
                      !nameCol ||
                      (importObjective === "update" &&
                        matchBy === "id" &&
                        !idCol)
                    }
                  >
                    Executar Importacao
                  </Button>
                </Group>
              </Stack>
            )}
          </Stepper.Step>

          <Stepper.Step label="Resultado" description="Resumo da operacao">
            {result && (
              <Stack gap="md" mt="xl">
                <Card withBorder bg="green.9">
                  <Title order={3} c="white">
                    Importacao Finalizada!
                  </Title>
                  <Text c="white">{result.message}</Text>
                </Card>
                <Group grow>
                  <Card withBorder>
                    <Text size="xl" fw={700} c="green">
                      {result.imported}
                    </Text>
                    <Text>Novos produtos criados</Text>
                  </Card>
                  <Card withBorder>
                    <Text size="xl" fw={700} c="blue">
                      {result.updated}
                    </Text>
                    <Text>Produtos atualizados</Text>
                  </Card>
                  <Card withBorder>
                    <Text size="xl" fw={700} c="orange">
                      {result.skipped}
                    </Text>
                    <Text>Linhas ignoradas</Text>
                  </Card>
                </Group>

                {result.errors?.length > 0 && (
                  <Card withBorder bg="dark.7">
                    <Title order={5} c="red" mb="xs">
                      Ocorreram alguns alertas:
                    </Title>
                    <Stack gap={4}>
                      {result.errors.map((err, i) => (
                        <Text key={i} size="sm" c="red.3">
                          • {err}
                        </Text>
                      ))}
                    </Stack>
                  </Card>
                )}

                <Group justify="center" mt="xl">
                  <Button onClick={reset} size="lg">
                    Fazer nova importacao
                  </Button>
                </Group>
              </Stack>
            )}
          </Stepper.Step>
        </Stepper>
      </Card>
    </Stack>
  );
}
