import { useRef } from "react";
import { Alert, Badge, Button, Group, Loader, Paper, SimpleGrid, Stack, Text } from "@mantine/core";
import { IconBook2, IconUpload } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { api } from "../../lib/apiClient";
import { notifyError, notifySuccess } from "../../lib/notify";

const ORIGIN_LABEL: Record<string, string> = {
  pacote: "veio com a versão do Chronos",
  importado: "importado nesta máquina",
  local: "importado nesta máquina",
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format("DD/MM/YYYY") : value;
}

/**
 * "Atualizar catálogo": importa o arquivo da Master Power (CatalogoMasterPower_Aberto.db)
 * nesta máquina, sem esperar uma versão nova do Chronos.
 */
export function CatalogUpdateSection() {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);

  const statusQuery = useQuery({
    queryKey: ["catalogo-status"],
    queryFn: ({ signal }) => api.getCatalogStatus({ signal }),
  });
  const status = statusQuery.data?.data;

  const importMutation = useMutation({
    mutationFn: (file: File) => api.importCatalog(file),
    onSuccess: (response) => {
      const result = response.data;
      notifySuccess(
        `Catálogo atualizado (versão ${result.versao ?? "?"}). ${result.produtos_vinculados ?? 0} produtos ligados às fichas.`,
      );
      queryClient.invalidateQueries({ queryKey: ["catalogo-status"] });
      queryClient.invalidateQueries({ queryKey: ["produto-catalogo"] });
    },
    onError: (error) => notifyError(error, "Não foi possível importar o catálogo."),
  });

  const pickFile = () => inputRef.current?.click();

  return (
    <Stack gap="md">
      <Paper withBorder p="md" radius="md">
        <Group gap="xs" mb="sm">
          <IconBook2 size={18} stroke={1.5} />
          <Text fw={600}>Catálogo Master Power desta máquina</Text>
        </Group>
        {statusQuery.isLoading ? (
          <Loader size="sm" />
        ) : (
          <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
            <Stack gap={2}>
              <Text size="xs" c="dimmed">
                Versão
              </Text>
              <Group gap={6}>
                <Text fw={600}>{status?.versao ?? "—"}</Text>
                {status && (
                  <Badge size="xs" variant="light">
                    {ORIGIN_LABEL[status.origem] ?? status.origem}
                  </Badge>
                )}
              </Group>
            </Stack>
            <Stack gap={2}>
              <Text size="xs" c="dimmed">
                Emitido em
              </Text>
              <Text fw={600}>{formatDate(status?.data_emissao)}</Text>
            </Stack>
            <Stack gap={2}>
              <Text size="xs" c="dimmed">
                Fichas
              </Text>
              <Text fw={600}>
                {status?.fichas_master_power ?? 0}
                {status?.fichas_proprias ? ` + ${status.fichas_proprias} próprias` : ""}
                {status?.fichas_cadastro ? ` + ${status.fichas_cadastro} do cadastro` : ""}
              </Text>
            </Stack>
            <Stack gap={2}>
              <Text size="xs" c="dimmed">
                Produtos ligados
              </Text>
              <Text fw={600}>{status?.produtos_vinculados ?? 0}</Text>
            </Stack>
          </SimpleGrid>
        )}
      </Paper>

      <Paper withBorder p="md" radius="md">
        <Stack gap="sm">
          <Text fw={600}>Atualizar catálogo</Text>
          <Text size="sm" c="dimmed">
            Escolha o arquivo novo da Master Power (CatalogoMasterPower_Aberto.db). O Chronos troca as
            fichas, liga as turbinas de novo e mantém as fichas próprias e as ligações feitas à mão.
          </Text>
          <input
            ref={inputRef}
            type="file"
            accept=".db,.sqlite,.sqlite3"
            style={{ display: "none" }}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (file) importMutation.mutate(file);
            }}
          />
          <Group>
            <Button leftSection={<IconUpload size={16} />} loading={importMutation.isPending} onClick={pickFile}>
              Escolher arquivo e atualizar
            </Button>
          </Group>
          <Alert variant="light" color="gray" p="xs">
            <Text size="xs">
              Vale só para esta máquina. Nas outras, faça o mesmo com o arquivo, ou espere a próxima versão do
              Chronos, que já vem com o catálogo atualizado. Uma versão do Chronos com catálogo mais antigo
              não volta o catálogo desta máquina para trás.
            </Text>
          </Alert>
        </Stack>
      </Paper>
    </Stack>
  );
}
