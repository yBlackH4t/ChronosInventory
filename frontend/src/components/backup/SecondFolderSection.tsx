import { useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Group,
  Paper,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { IconFolder, IconFolderShare } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";

import { api } from "../../lib/apiClient";
import { notifyError, notifySuccess } from "../../lib/notify";
import { isTauri } from "../../lib/tauri";

/**
 * Segunda cópia dos backups: o banco e os backups ficam no mesmo disco; se ele falhar, vai tudo
 * junto. Com uma pasta em outro disco, pendrive ou rede, cada backup também é copiado para lá.
 */
export function SecondFolderSection() {
  const queryClient = useQueryClient();
  const [input, setInput] = useState<string | null>(null);

  const statusQuery = useQuery({
    queryKey: ["backup-segunda-pasta"],
    queryFn: ({ signal }) => api.backupSecondFolder({ signal }),
  });
  const status = statusQuery.data?.data;
  const folder = input ?? status?.pasta ?? "";

  const saveMutation = useMutation({
    mutationFn: (pasta: string) => api.backupUpdateSecondFolder(pasta),
    onSuccess: (response) => {
      queryClient.setQueryData(["backup-segunda-pasta"], response);
      setInput(null);
      notifySuccess(
        response.data.ativo
          ? `Backups copiados para ${response.data.destino}.`
          : "Segunda cópia desligada.",
      );
    },
    onError: (error) => notifyError(error, "Não foi possível usar essa pasta."),
  });

  const pickFolder = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({ directory: true, multiple: false });
      if (typeof selected === "string" && selected.trim()) setInput(selected);
    } catch (error) {
      notifyError(error, "Não foi possível escolher a pasta.");
    }
  };

  const lastCopy = status?.ultima_copia ? dayjs(status.ultima_copia) : null;

  return (
    <Paper withBorder p="md" radius="md">
      <Group gap="xs" mb={4}>
        <IconFolderShare size={18} stroke={1.5} />
        <Text fw={600}>Cópia dos backups em outro disco</Text>
        {status?.ativo ? (
          <Badge size="xs" color="success" variant="light">
            Ligada
          </Badge>
        ) : (
          <Badge size="xs" color="gray" variant="light">
            Desligada
          </Badge>
        )}
      </Group>
      <Text size="sm" c="dimmed" mb="sm">
        O banco e os backups ficam no mesmo disco. Escolha uma pasta em outro
        disco (ex.: D:), pendrive ou rede: cada backup também é copiado para lá,
        e os antigos saem de lá junto com os daqui.
      </Text>
      <Stack gap="xs">
        <Group gap="xs" align="flex-end" wrap="nowrap">
          <TextInput
            style={{ flex: 1 }}
            label="Pasta"
            placeholder="Ex.: D:\Backups"
            value={folder}
            onChange={(event) => setInput(event.currentTarget.value)}
          />
          {isTauri() && (
            <Button
              variant="default"
              leftSection={<IconFolder size={16} stroke={1.5} />}
              onClick={() => void pickFolder()}
            >
              Escolher
            </Button>
          )}
          <Button
            onClick={() => saveMutation.mutate(folder)}
            loading={saveMutation.isPending}
            disabled={!folder.trim() || (folder === status?.pasta && !input)}
          >
            Salvar
          </Button>
          {status?.ativo && (
            <Button
              variant="subtle"
              color="danger"
              onClick={() => saveMutation.mutate("")}
              loading={saveMutation.isPending}
            >
              Desligar
            </Button>
          )}
        </Group>
        {status?.ativo && (
          <Text size="xs" c="dimmed">
            Copiando para {status.destino} · {status.arquivos} backup(s) lá
            {lastCopy?.isValid()
              ? ` · última cópia ${lastCopy.format("DD/MM/YYYY HH:mm")}`
              : ""}
          </Text>
        )}
        {status?.ativo && status.ultimo_erro && (
          <Alert color="warning" variant="light" p="xs">
            A última cópia falhou ({status.ultimo_erro}). Confira se o disco,
            pendrive ou rede está conectado; o Chronos tenta de novo no próximo
            backup.
          </Alert>
        )}
      </Stack>
    </Paper>
  );
}
