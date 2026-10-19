import { useState } from "react";
import {
  Badge,
  Button,
  Grid,
  Group,
  SegmentedControl,
  Select,
  Stack,
  Stepper,
  Switch,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { Dropzone } from "@mantine/dropzone";
import {
  IconAlertTriangle,
  IconArrowRight,
  IconCircleCheck,
  IconFileSpreadsheet,
  IconUpload,
  IconX,
} from "@tabler/icons-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "../lib/apiClient";
import PageHeader from "../components/ui/PageHeader";
import Panel from "../components/ui/Panel";
import StatTile from "../components/ui/StatTile";
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
    preview: Record<string, unknown>[];
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
      notifySuccess("Importação concluída com sucesso");
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
    },
    onError: (error) => notifyError(error, "Falha na importação"),
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
        title="Importar planilha"
        subtitle="Envie um Excel ou CSV, indique o que é cada coluna e importe produtos e saldos."
      />

      <Stepper
        size="sm"
        active={activeStep}
        onStepClick={setActiveStep}
        allowNextStepsSelect={false}
      >
        <Stepper.Step label="Arquivo" description="Envie a planilha">
          <Stack gap="md" mt="lg" maw={720}>
            <Dropzone
              onDrop={(files) => setFile(files[0] ?? null)}
              accept={[
                "text/csv",
                "application/vnd.ms-excel",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
              ]}
              maxFiles={1}
              multiple={false}
              radius="lg"
            >
              <Group justify="center" gap="md" mih={160} style={{ pointerEvents: "none" }}>
                <Dropzone.Accept>
                  <IconUpload size={36} stroke={1.5} color="var(--accent)" />
                </Dropzone.Accept>
                <Dropzone.Reject>
                  <IconX size={36} stroke={1.5} color="var(--danger)" />
                </Dropzone.Reject>
                <Dropzone.Idle>
                  <IconFileSpreadsheet size={36} stroke={1.5} color="var(--text-subtle)" />
                </Dropzone.Idle>
                <div>
                  <Text size="md" fw={600}>
                    {file ? file.name : "Arraste a planilha aqui ou clique para escolher"}
                  </Text>
                  <Text size="sm" c="dimmed">
                    {file
                      ? `${(file.size / 1024).toFixed(0)} KB · clique para trocar`
                      : "Arquivos .xlsx, .xls ou .csv de até 50 MB"}
                  </Text>
                </div>
              </Group>
            </Dropzone>
            <Group justify="flex-end">
              <Button
                onClick={handleAnalyze}
                loading={analyzeMutation.isPending}
                disabled={!file}
                rightSection={<IconArrowRight size={16} />}
              >
                Analisar planilha
              </Button>
            </Group>
          </Stack>
        </Stepper.Step>

        <Stepper.Step label="Mapeamento" description="Indique as colunas">
          {analysisData && (
            <Grid gap="lg" mt="lg">
              <Grid.Col span={{ base: 12, lg: 5 }}>
                <Stack gap="md">
                  <Panel title="Objetivo">
                    <Stack gap="sm">
                      <SegmentedControl
                        fullWidth
                        value={importObjective}
                        onChange={(val) => setImportObjective(val as typeof importObjective)}
                        data={[
                          { value: "new", label: "Cadastrar novos" },
                          { value: "update", label: "Atualizar existentes" },
                        ]}
                      />
                      <Text size="xs" c="dimmed">
                        {importObjective === "new"
                          ? "Todos os produtos da planilha serão criados como novos, com o estoque informado."
                          : "Atualiza nomes ou estoque de produtos que já existem. Produtos que não existirem serão criados."}
                      </Text>
                      {importObjective === "update" && (
                        <Select
                          label="Encontrar produto por"
                          data={[
                            { value: "name", label: "Nome do produto (recomendado)" },
                            { value: "id", label: "ID interno" },
                          ]}
                          value={matchBy}
                          onChange={(val) => setMatchBy(val || "name")}
                          allowDeselect={false}
                        />
                      )}
                    </Stack>
                  </Panel>

                  <Panel title="Colunas do produto">
                    <Stack gap="sm">
                      <Select
                        label="Nome do produto"
                        placeholder="Selecione a coluna"
                        data={headerOptions}
                        value={nameCol}
                        onChange={setNameCol}
                        required
                      />
                      <Select
                        label="ID do produto"
                        description={
                          importObjective === "new"
                            ? "Opcional. Sem coluna, os IDs são gerados automaticamente."
                            : "Coluna com os IDs da planilha."
                        }
                        placeholder="Ignorar"
                        data={[{ value: "", label: "Ignorar" }, ...headerOptions]}
                        value={idCol}
                        onChange={setIdCol}
                        clearable
                        required={importObjective === "update" && matchBy === "id"}
                      />
                    </Stack>
                  </Panel>

                  {importObjective === "update" && (
                    <Panel
                      title="Atualizar saldos"
                      subtitle="Grava as quantidades da planilha como ajuste de inventário."
                      actions={
                        <Switch
                          aria-label="Atualizar saldos"
                          checked={updateStock}
                          onChange={(e) => setUpdateStock(e.currentTarget.checked)}
                        />
                      }
                    >
                      {updateStock ? (
                        <TextInput
                          label="Motivo"
                          description="Aparece no histórico de movimentações."
                          value={motivo}
                          onChange={(e) => setMotivo(e.currentTarget.value)}
                        />
                      ) : (
                        <Text size="xs" c="dimmed">
                          Desligado: apenas os nomes serão atualizados.
                        </Text>
                      )}
                    </Panel>
                  )}

                  {(importObjective === "new" || updateStock) && (
                    <Panel title="Estoque por filial" subtitle="Coluna com a quantidade de cada local.">
                      <Stack gap="sm">
                        {activeLocations && activeLocations.length > 0 ? (
                          activeLocations.map((loc) => (
                            <Select
                              key={loc.id}
                              label={loc.label || loc.name}
                              placeholder="Ignorar (fica zerado)"
                              data={[{ value: "", label: "Ignorar (fica zerado)" }, ...headerOptions]}
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
                          <Text size="sm" c="dimmed">
                            Nenhum local ativo. Cadastre um local antes de importar estoque.
                          </Text>
                        )}
                      </Stack>
                    </Panel>
                  )}
                </Stack>
              </Grid.Col>

              <Grid.Col span={{ base: 12, lg: 7 }}>
                <Stack gap="md">
                  <Panel flush title="Pré-visualização" subtitle={`Primeiras linhas de ${file?.name ?? "planilha"}`}>
                    <Table.ScrollContainer minWidth={480}>
                      <Table verticalSpacing="xs">
                        <Table.Thead>
                          <Table.Tr>
                            {analysisData.headers.map((h) => {
                              const role =
                                h === nameCol
                                  ? "Nome"
                                  : h === idCol
                                    ? "ID"
                                    : Object.entries(locMappings).find(([, col]) => col === h)
                                      ? "Estoque"
                                      : null;
                              return (
                                <Table.Th key={h}>
                                  {h}
                                  {role && (
                                    <Badge size="xs" variant="light" ml={6}>
                                      {role}
                                    </Badge>
                                  )}
                                </Table.Th>
                              );
                            })}
                          </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                          {analysisData.preview.map((row, i) => (
                            <Table.Tr key={i}>
                              {analysisData.headers.map((h) => (
                                <Table.Td key={h}>{String(row[h] ?? "")}</Table.Td>
                              ))}
                            </Table.Tr>
                          ))}
                        </Table.Tbody>
                      </Table>
                    </Table.ScrollContainer>
                  </Panel>

                  <Group justify="space-between">
                    <Button variant="default" onClick={() => setActiveStep(0)}>
                      Voltar
                    </Button>
                    <Button
                      onClick={handleExecute}
                      loading={executeMutation.isPending}
                      disabled={
                        !nameCol ||
                        (importObjective === "update" && matchBy === "id" && !idCol)
                      }
                    >
                      Importar
                    </Button>
                  </Group>
                </Stack>
              </Grid.Col>
            </Grid>
          )}
        </Stepper.Step>

        <Stepper.Step label="Resultado" description="Resumo">
          {result && (
            <Stack gap="md" mt="lg" maw={860}>
              <Group gap="sm">
                <IconCircleCheck size={22} stroke={1.5} color="var(--success)" />
                <div>
                  <Text fw={650}>Importação finalizada</Text>
                  <Text size="sm" c="dimmed">
                    {result.message}
                  </Text>
                </div>
              </Group>

              <div className="stat-grid">
                <StatTile label="Produtos criados" value={result.imported} />
                <StatTile label="Produtos atualizados" value={result.updated} />
                <StatTile label="Linhas ignoradas" value={result.skipped} />
              </div>

              {result.errors?.length > 0 && (
                <Panel
                  title={`${result.errors.length} alertas`}
                  subtitle="Linhas que precisaram de atenção durante a importação."
                >
                  <Stack gap={6} mah={260} style={{ overflowY: "auto" }}>
                    {result.errors.map((err, i) => (
                      <Group key={i} gap="xs" wrap="nowrap" align="flex-start">
                        <IconAlertTriangle
                          size={14}
                          stroke={1.75}
                          color="var(--warning)"
                          style={{ flexShrink: 0, marginTop: 3 }}
                        />
                        <Text size="sm">{err}</Text>
                      </Group>
                    ))}
                  </Stack>
                </Panel>
              )}

              <Group>
                <Button variant="default" onClick={reset}>
                  Nova importação
                </Button>
              </Group>
            </Stack>
          )}
        </Stepper.Step>
      </Stepper>
    </Stack>
  );
}
