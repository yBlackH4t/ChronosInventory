import { useRef, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  List,
  Loader,
  Paper,
  ScrollArea,
  SimpleGrid,
  Stack,
  Table,
  Text,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { IconBuildingStore, IconDownload, IconTrash, IconUpload } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { api } from "../../lib/apiClient";
import { notifyError, notifySuccess } from "../../lib/notify";
import type { CompanyRegisterPreview, CompanyRegisterReview } from "../../types/api";

const count = (value?: number) => (value ?? 0).toLocaleString("pt-BR");

function Figure({ label, value }: { label: string; value: number | string }) {
  return (
    <Stack gap={2}>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text fw={600}>{typeof value === "number" ? value.toLocaleString("pt-BR") : value}</Text>
    </Stack>
  );
}

const REVIEW_REASON: Record<CompanyRegisterReview["motivo"], string> = {
  OUTRA_PECA: "Mesmo número, outra peça",
  PARECIDO: "Mesmo código, outro número",
};

/** Lista "Para conferir" como planilha (abre no Excel com ; e acentos). */
function downloadReview(rows: CompanyRegisterReview[]) {
  const cell = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
  const lines = [
    ["Número no sistema", "Nome no arquivo", "Id no Chronos", "Nome no Chronos", "Saldo", "Movimentações", "Motivo"],
    ...rows.map((r) => [
      r.cd_material,
      r.nome_arquivo,
      r.produto_id,
      r.nome_chronos,
      r.saldo,
      r.movimentacoes,
      REVIEW_REASON[r.motivo],
    ]),
  ].map((line) => line.map(cell).join(";"));
  const blob = new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "cadastro_para_conferir.csv";
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * "Cadastro da empresa": importa o arquivo de produtos do sistema da loja (produtos_completos.csv).
 * Mostra antes o que vai mudar; depois cadastra os produtos que faltam (saldo zero) e guarda as
 * aplicações como fichas que o assistente usa.
 */
export function CompanyRegisterSection() {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<CompanyRegisterPreview | null>(null);
  const [createProducts, setCreateProducts] = useState(true);

  const statusQuery = useQuery({
    queryKey: ["cadastro-empresa"],
    queryFn: ({ signal }) => api.getCompanyRegister({ signal }),
  });
  const status = statusQuery.data?.data;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["cadastro-empresa"] });
    queryClient.invalidateQueries({ queryKey: ["catalogo-status"] });
    queryClient.invalidateQueries({ queryKey: ["produto-catalogo"] });
    queryClient.invalidateQueries({ queryKey: ["produtos"] });
  };

  const previewMutation = useMutation({
    mutationFn: (picked: File) => api.previewCompanyRegister(picked),
    onSuccess: (response) => setPreview(response.data),
    onError: (error) => {
      setFile(null);
      notifyError(error, "Não foi possível ler o arquivo.");
    },
  });

  const importMutation = useMutation({
    mutationFn: () => api.importCompanyRegister(file as File, createProducts),
    onSuccess: (response) => {
      const result = response.data;
      notifySuccess(
        `Cadastro importado: ${result.nomes_trocados} nomes e ${result.ids_trocados} números acertados, ` +
          `${result.produtos_criados} produtos novos e ${result.fichas} fichas com aplicações.`,
      );
      setFile(null);
      setPreview(null);
      refresh();
    },
    onError: (error) => notifyError(error, "Não foi possível importar o cadastro."),
  });

  const removeMutation = useMutation({
    mutationFn: () => api.removeCompanyRegister(),
    onSuccess: (response) => {
      notifySuccess(`${response.data.fichas_removidas} fichas do cadastro removidas.`);
      refresh();
    },
    onError: (error) => notifyError(error, "Não foi possível remover as fichas."),
  });

  const confirmRemove = () =>
    modals.openConfirmModal({
      title: "Tirar as fichas do cadastro",
      children: (
        <Text size="sm">
          O assistente deixa de usar as aplicações do cadastro da empresa. Os produtos que a importação
          cadastrou continuam no Chronos.
        </Text>
      ),
      labels: { confirm: "Tirar as fichas", cancel: "Cancelar" },
      confirmProps: { color: "red" },
      onConfirm: () => removeMutation.mutate(),
    });

  const cancel = () => {
    setFile(null);
    setPreview(null);
  };

  const canEdit = status?.pode_editar ?? true;
  const ignored = preview?.ignorados;

  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap="sm">
        <Group gap="xs" justify="space-between">
          <Group gap="xs">
            <IconBuildingStore size={18} stroke={1.5} />
            <Text fw={600}>Cadastro da empresa</Text>
          </Group>
          {statusQuery.isLoading ? (
            <Loader size="xs" />
          ) : status?.fichas ? (
            <Badge variant="light">
              {status.fichas.toLocaleString("pt-BR")} fichas
              {status.importado_em ? ` · ${dayjs(status.importado_em).format("DD/MM/YYYY")}` : ""}
            </Badge>
          ) : (
            <Badge variant="light" color="gray">
              não importado
            </Badge>
          )}
        </Group>
        <Text size="sm" c="dimmed">
          Escolha o arquivo de produtos do sistema da loja (produtos_completos.csv). O Chronos mostra o que vai
          mudar antes de gravar: cadastra os produtos que faltam, com saldo zero, e guarda as aplicações e os
          similares dos turbos e conjuntos que o catálogo Master Power não tem. Também deixa o número (#) e o nome
          de cada produto iguais aos do sistema da loja. O saldo não muda, e o que parece outra peça fica numa
          lista para você conferir.
        </Text>

        {!canEdit && (
          <Alert variant="light" color="yellow" p="xs">
            <Text size="xs">{status?.motivo}</Text>
          </Alert>
        )}

        <input
          ref={inputRef}
          type="file"
          accept=".csv,.txt"
          style={{ display: "none" }}
          onChange={(event) => {
            const picked = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (!picked) return;
            setFile(picked);
            setPreview(null);
            previewMutation.mutate(picked);
          }}
        />

        {!preview && (
          <Group>
            <Button
              leftSection={<IconUpload size={16} />}
              loading={previewMutation.isPending}
              disabled={!canEdit}
              onClick={() => inputRef.current?.click()}
            >
              Escolher arquivo
            </Button>
            {!!status?.fichas && (
              <Button
                variant="subtle"
                color="red"
                leftSection={<IconTrash size={16} />}
                loading={removeMutation.isPending}
                disabled={!canEdit}
                onClick={confirmRemove}
              >
                Tirar as fichas do cadastro
              </Button>
            )}
          </Group>
        )}

        {preview && (
          <Paper withBorder p="sm" radius="md">
            <Stack gap="sm">
              <Text size="sm" fw={600}>
                {file?.name}: o que vai acontecer
              </Text>
              <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
                <Figure label="Itens no arquivo" value={preview.itens_no_arquivo} />
                <Figure label="Já iguais (número e nome)" value={preview.iguais} />
                <Figure label="Ficam com o nome do arquivo" value={preview.nomes_trocados} />
                <Figure label="Mudam para o número do arquivo" value={preview.ids_trocados} />
                <Figure label="Produtos novos (saldo zero)" value={preview.produtos_novos} />
                <Figure label="Para conferir (não mudam)" value={preview.para_conferir.length} />
                <Figure label="Só no Chronos (não mudam)" value={preview.fora_do_arquivo} />
                <Figure label="Fichas com aplicações" value={preview.fichas} />
              </SimpleGrid>
              {preview.exemplos_nomes.length > 0 && (
                <Stack gap={4}>
                  <Text size="xs" c="dimmed">
                    Alguns nomes que mudam (o nome antigo fica anotado no produto e os códigos dele continuam na
                    busca):
                  </Text>
                  <List size="xs" spacing={2}>
                    {preview.exemplos_nomes.slice(0, 6).map((change) => (
                      <List.Item key={change.id}>
                        #{change.id}: {change.de} → {change.para}
                      </List.Item>
                    ))}
                  </List>
                </Stack>
              )}
              {preview.exemplos_ids.length > 0 && (
                <Stack gap={4}>
                  <Text size="xs" c="dimmed">
                    Alguns números que mudam (movimentações, saldo, fotos e NFs vão junto):
                  </Text>
                  <List size="xs" spacing={2}>
                    {preview.exemplos_ids.slice(0, 6).map((move) => (
                      <List.Item key={move.de}>
                        #{move.de} → #{move.para}: {move.nome}
                      </List.Item>
                    ))}
                  </List>
                </Stack>
              )}
              {preview.para_conferir.length > 0 && (
                <Stack gap={4}>
                  <Group justify="space-between" gap="xs">
                    <Text size="xs" c="dimmed">
                      Para conferir: parecem peças diferentes, então ficam como estão.
                    </Text>
                    <Button
                      size="compact-xs"
                      variant="subtle"
                      leftSection={<IconDownload size={14} />}
                      onClick={() => downloadReview(preview.para_conferir)}
                    >
                      Baixar lista
                    </Button>
                  </Group>
                  <ScrollArea.Autosize mah={220}>
                    <Table fz="xs" verticalSpacing={4} striped>
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>No arquivo</Table.Th>
                          <Table.Th>No Chronos</Table.Th>
                          <Table.Th>Saldo</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {preview.para_conferir.map((row) => (
                          <Table.Tr key={`${row.cd_material}-${row.produto_id}`}>
                            <Table.Td>
                              {row.cd_material} · {row.nome_arquivo}
                            </Table.Td>
                            <Table.Td>
                              #{row.produto_id} · {row.nome_chronos}
                            </Table.Td>
                            <Table.Td>{row.saldo}</Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  </ScrollArea.Autosize>
                </Stack>
              )}
              {preview.fora_do_arquivo_com_saldo.length > 0 && (
                <Text size="xs" c="dimmed">
                  Só no Chronos, com saldo:{" "}
                  {preview.fora_do_arquivo_com_saldo
                    .slice(0, 10)
                    .map((p) => `#${p.produto_id} ${p.nome} (${p.saldo})`)
                    .join("; ")}
                  .
                </Text>
              )}
              <Text size="xs" c="dimmed">
                {preview.aplicacoes.toLocaleString("pt-BR")} aplicações e {preview.codigos.toLocaleString("pt-BR")}{" "}
                códigos similares. Ficam sem ficha: {count(ignored?.no_catalogo_master_power)} que já têm a ficha Master
                Power, {count(ignored?.outras_pecas)} peças que não são turbo nem conjunto, {count(ignored?.sem_codigo)} sem
                código da peça e {count(ignored?.sem_aplicacao)} sem aplicação escrita.
                {preview.fichas_atuais > 0 &&
                  ` As ${preview.fichas_atuais} fichas da importação anterior são trocadas pelas do arquivo.`}
              </Text>
              {preview.exemplos_produtos_novos.length > 0 && (
                <Stack gap={4}>
                  <Text size="xs" c="dimmed">
                    Alguns dos produtos novos:
                  </Text>
                  <List size="xs" spacing={2}>
                    {preview.exemplos_produtos_novos.slice(0, 8).map((name) => (
                      <List.Item key={name}>{name}</List.Item>
                    ))}
                  </List>
                </Stack>
              )}
              <Checkbox
                checked={createProducts}
                onChange={(event) => setCreateProducts(event.currentTarget.checked)}
                label={`Cadastrar os ${preview.produtos_novos} produtos que faltam`}
                disabled={preview.produtos_novos === 0}
              />
              <Group>
                <Button loading={importMutation.isPending} onClick={() => importMutation.mutate()}>
                  Importar
                </Button>
                <Button variant="default" disabled={importMutation.isPending} onClick={cancel}>
                  Cancelar
                </Button>
              </Group>
              <Text size="xs" c="dimmed">
                Antes de gravar, o Chronos faz uma cópia de segurança do banco (backup_pre_cadastro).
              </Text>
            </Stack>
          </Paper>
        )}

        <Alert variant="light" color="gray" p="xs">
          <Text size="xs">
            Importe na máquina que publica a base. As outras recebem os produtos e as aplicações com "Aplicar
            base oficial".
          </Text>
        </Alert>
      </Stack>
    </Paper>
  );
}
