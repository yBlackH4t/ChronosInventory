import { useRef, useState } from "react";
import {
  Badge,
  Button,
  Group,
  Progress,
  SimpleGrid,
  Stack,
  Table,
  Text,
} from "@mantine/core";
import { Dropzone, IMAGE_MIME_TYPE } from "@mantine/dropzone";
import {
  IconAlertTriangle,
  IconFolderOpen,
  IconPhoto,
  IconPhotoPlus,
  IconUpload,
  IconX,
} from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";

import { api } from "../../lib/apiClient";
import { notifyError, notifySuccess } from "../../lib/notify";
import type { PhotoBatchItem, PhotoBatchStatus } from "../../types/api";
import Panel from "../ui/Panel";
import StatTile from "../ui/StatTile";

type Planned = { file: File; item: PhotoBatchItem };

type Tally = {
  added: number;
  already: number;
  limit: number;
  failed: string[];
};

const STATUS_LABEL: Record<Exclude<PhotoBatchStatus, "ok">, string> = {
  sem_produto: "nenhum produto com esse código",
  sem_codigo: "nome do arquivo sem código",
  nao_e_imagem: "não é foto (use JPG, PNG ou WEBP)",
  muitos_produtos: "código em muitos produtos (parece de kit)",
};

const EMPTY_TALLY: Tally = { added: 0, already: 0, limit: 0, failed: [] };

// "178045.jpg" antes de "178045_2.jpg": a primeira foto de um produto sem foto vira a principal.
const byCodeThenNumber = (a: Planned, b: Planned) =>
  a.item.codigo.localeCompare(b.item.codigo) || a.item.numero - b.item.numero;

export default function PhotoBatchImport() {
  const folderInput = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const [planned, setPlanned] = useState<Planned[]>([]);
  const [skipped, setSkipped] = useState<PhotoBatchItem[]>([]);
  const [productCount, setProductCount] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);
  const [done, setDone] = useState(0);
  const [running, setRunning] = useState(false);
  const [tally, setTally] = useState<Tally | null>(null);

  const analyze = async (files: File[]) => {
    if (!files.length) return;
    setAnalyzing(true);
    setTally(null);
    setDone(0);
    try {
      const res = await api.previewPhotoBatch(files.map((f) => f.name));
      const items = res.data.itens;
      const ok: Planned[] = [];
      const rest: PhotoBatchItem[] = [];
      items.forEach((item, i) => {
        if (item.status === "ok") ok.push({ file: files[i], item });
        else rest.push(item);
      });
      setPlanned(ok.sort(byCodeThenNumber));
      setSkipped(rest.filter((item) => item.status !== "nao_e_imagem"));
      setProductCount(res.data.produtos);
    } catch (error) {
      notifyError(error, "Falha ao ler as fotos");
    } finally {
      setAnalyzing(false);
    }
  };

  const runImport = async () => {
    setRunning(true);
    setDone(0);
    const result: Tally = { ...EMPTY_TALLY, failed: [] };
    for (const [i, { file }] of planned.entries()) {
      try {
        const res = await api.importPhotoBatchFile(file);
        for (const r of res.data.resultados) {
          if (r.resultado === "adicionada") result.added += 1;
          else if (r.resultado === "ja_tinha") result.already += 1;
          else result.limit += 1;
        }
      } catch {
        result.failed.push(file.name);
      }
      setDone(i + 1);
    }
    setTally(result);
    setRunning(false);
    queryClient.invalidateQueries({ queryKey: ["produtos"] });
    queryClient.invalidateQueries({ queryKey: ["produto"] });
    notifySuccess(`${result.added} fotos colocadas nos produtos`);
  };

  const reset = () => {
    setPlanned([]);
    setSkipped([]);
    setProductCount(0);
    setTally(null);
    setDone(0);
  };

  const hasSelection = planned.length > 0 || skipped.length > 0;
  const percent = planned.length ? Math.round((done / planned.length) * 100) : 0;

  return (
    <Stack gap="md" maw={960}>
      <Text size="sm" c="dimmed">
        O nome de cada arquivo é o código da peça: <b>178045.jpg</b> é a foto principal e{" "}
        <b>178045_2.jpg</b>, <b>178045_3.jpg</b>... são as extras. A foto vai para os produtos
        que têm esse código no nome. Foto que o produto já tem não entra de novo, e cada produto
        guarda até 5 fotos.
      </Text>

      {!hasSelection && (
        <>
          <Dropzone
            onDrop={analyze}
            accept={IMAGE_MIME_TYPE}
            multiple
            loading={analyzing}
            radius="lg"
          >
            <Group justify="center" gap="md" mih={150} style={{ pointerEvents: "none" }}>
              <Dropzone.Accept>
                <IconUpload size={36} stroke={1.5} color="var(--accent)" />
              </Dropzone.Accept>
              <Dropzone.Reject>
                <IconX size={36} stroke={1.5} color="var(--danger)" />
              </Dropzone.Reject>
              <Dropzone.Idle>
                <IconPhoto size={36} stroke={1.5} color="var(--text-subtle)" />
              </Dropzone.Idle>
              <div>
                <Text size="md" fw={600}>
                  Arraste as fotos aqui ou clique para escolher
                </Text>
                <Text size="sm" c="dimmed">
                  Selecione todas com Ctrl+A dentro da pasta
                </Text>
              </div>
            </Group>
          </Dropzone>
          <Group>
            <Button
              variant="default"
              leftSection={<IconFolderOpen size={16} />}
              loading={analyzing}
              onClick={() => folderInput.current?.click()}
            >
              Escolher a pasta inteira
            </Button>
            <input
              ref={folderInput}
              type="file"
              hidden
              multiple
              // A pasta inteira de uma vez (Chrome/WebView2).
              {...{ webkitdirectory: "", directory: "" }}
              onChange={(e) => {
                analyze(Array.from(e.currentTarget.files ?? []));
                e.currentTarget.value = "";
              }}
            />
          </Group>
        </>
      )}

      {hasSelection && (
        <>
          <SimpleGrid cols={{ base: 1, sm: 3 }}>
            <StatTile label="Fotos que vão entrar" value={planned.length} />
            <StatTile label="Produtos" value={productCount} />
            <StatTile label="Sem produto" value={skipped.length} />
          </SimpleGrid>

          {(running || tally) && (
            <Progress value={percent} radius="xl" size="lg" animated={running} />
          )}

          {tally && (
            <Panel title="Pronto">
              <Stack gap={4}>
                <Text size="sm">{tally.added} fotos colocadas nos produtos.</Text>
                {tally.already > 0 && (
                  <Text size="sm" c="dimmed">
                    {tally.already} o produto já tinha (não duplicou).
                  </Text>
                )}
                {tally.limit > 0 && (
                  <Text size="sm" c="dimmed">
                    {tally.limit} ficaram de fora porque o produto já tem 5 fotos.
                  </Text>
                )}
                {tally.failed.length > 0 && (
                  <Text size="sm" c="var(--danger)">
                    Não consegui abrir: {tally.failed.join(", ")}
                  </Text>
                )}
              </Stack>
            </Panel>
          )}

          <Group>
            <Button
              leftSection={<IconPhotoPlus size={16} />}
              onClick={runImport}
              loading={running}
              disabled={!planned.length || Boolean(tally)}
            >
              Colocar {planned.length} fotos
            </Button>
            <Button variant="default" onClick={reset} disabled={running}>
              {tally ? "Importar outra pasta" : "Escolher outras fotos"}
            </Button>
          </Group>

          {skipped.length > 0 && (
            <Panel
              title={`${skipped.length} ${skipped.length === 1 ? "foto" : "fotos"} sem produto`}
              subtitle="Confira o código no nome do arquivo ou no cadastro do produto."
            >
              <Stack gap={6} mah={220} style={{ overflowY: "auto" }}>
                {skipped.map((item) => (
                  <Group key={item.arquivo} gap="xs" wrap="nowrap">
                    <IconAlertTriangle size={14} stroke={1.75} color="var(--warning)" />
                    <Text size="sm" ff="monospace">
                      {item.arquivo}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {STATUS_LABEL[item.status as Exclude<PhotoBatchStatus, "ok">]}
                    </Text>
                  </Group>
                ))}
              </Stack>
            </Panel>
          )}

          {planned.length > 0 && (
            <Panel title="Para onde vai cada foto" flush>
              <div style={{ maxHeight: 360, overflowY: "auto" }}>
                <Table striped>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Arquivo</Table.Th>
                      <Table.Th>Produto</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {planned.map(({ item }) => (
                      <Table.Tr key={item.arquivo}>
                        <Table.Td>
                          <Group gap="xs" wrap="nowrap">
                            <Text size="sm" ff="monospace">
                              {item.arquivo}
                            </Text>
                            {item.numero === 1 && (
                              <Badge size="xs" variant="light">
                                foto 1
                              </Badge>
                            )}
                          </Group>
                        </Table.Td>
                        <Table.Td>
                          {item.produtos.map((p) => (
                            <Text key={p.id} size="sm">
                              #{p.id} · {p.nome}
                            </Text>
                          ))}
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </div>
            </Panel>
          )}
        </>
      )}
    </Stack>
  );
}
