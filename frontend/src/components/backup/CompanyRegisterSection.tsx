import { useRef, useState } from "react";
import { Alert, Badge, Button, Checkbox, Group, List, Loader, Paper, SimpleGrid, Stack, Text } from "@mantine/core";
import { modals } from "@mantine/modals";
import { IconBuildingStore, IconTrash, IconUpload } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { api } from "../../lib/apiClient";
import { notifyError, notifySuccess } from "../../lib/notify";
import type { CompanyRegisterPreview } from "../../types/api";

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
        `Cadastro importado: ${result.produtos_criados} produtos novos e ${result.fichas} fichas com aplicações.`,
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
          similares dos turbos e conjuntos que o catálogo Master Power não tem. Saldo e nome dos produtos que já
          existem não mudam.
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
                <Figure label="Já estão no Chronos" value={preview.itens_ja_cadastrados} />
                <Figure label="Produtos novos (saldo zero)" value={preview.produtos_novos} />
                <Figure label="Fichas com aplicações" value={preview.fichas} />
              </SimpleGrid>
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
