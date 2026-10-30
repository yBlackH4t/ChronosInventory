import { useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Divider,
  Group,
  Loader,
  Popover,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import {
  IconAlertCircle,
  IconDatabase,
  IconNetwork,
  IconRefresh,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { useNavigate } from "react-router-dom";

import {
  getKnowledgeSyncStatus,
  syncKnowledge,
} from "../../lib/assistantAdminApi";
import { notifyError, notifySuccess } from "../../lib/notify";
import type { KnowledgeSyncStatus } from "../../types/assistantAdmin";

export function SyncStatusBadge() {
  const [opened, setOpened] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data, isLoading, isError, refetch } = useQuery<KnowledgeSyncStatus>({
    queryKey: ["knowledge-sync-status"],
    queryFn: getKnowledgeSyncStatus,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const syncMutation = useMutation({
    mutationFn: syncKnowledge,
    onSuccess: (updated) => {
      notifySuccess("Sincronização concluída com sucesso!");
      queryClient.setQueryData(["knowledge-sync-status"], updated);
      queryClient.invalidateQueries({ queryKey: ["assistant-knowledge"] });
    },
    onError: (err) => {
      notifyError(err, "Falha ao sincronizar com a base oficial.");
    },
  });

  const isPublisher = data?.papel === "publisher";
  const isConfigured = Boolean(data?.configurado);
  const hasError = Boolean(data?.erro) || isError;

  let dotColor = "var(--mantine-color-gray-6)";
  let label = "Não configurado";
  let hasGlow = false;

  if (isLoading) {
    label = "Consultando...";
    dotColor = "var(--mantine-color-gray-5)";
  } else if (!data || !isConfigured) {
    dotColor = "var(--mantine-color-gray-5)";
    label = "Não configurado";
    hasGlow = false;
  } else if (hasError) {
    dotColor = "var(--mantine-color-warning-6)";
    label = "Sincronização pendente";
    hasGlow = false;
  } else if (!data.verificado_em) {
    dotColor = "var(--mantine-color-gray-5)";
    label = "Ainda não sincronizou";
    hasGlow = false;
  } else {
    dotColor = isPublisher
      ? "var(--mantine-color-info-6)"
      : "var(--mantine-color-success-6)";
    label = isPublisher ? "Computador principal" : "Sincronizado";
    hasGlow = true;
  }

  const formattedDate = (iso?: string | null) => {
    if (!iso) return "Não informado";
    const parsed = dayjs(iso);
    return parsed.isValid() ? parsed.format("DD/MM/YYYY [às] HH:mm") : iso;
  };

  // Sem base oficial configurada, o selo não diz nada ao usuário: a configuração mora em
  // a tela Base oficial (menu da engrenagem).
  if (!isLoading && (!data || !isConfigured)) return null;

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="bottom-end"
      withArrow
      shadow="md"
      radius="md"
      width={300}
    >
      <Popover.Target>
        <Tooltip
          label={`Conhecimento do assistente: ${label} (clique para detalhes)`}
          disabled={opened}
        >
          <button
            type="button"
            className="profile-pill"
            onClick={() => setOpened((o) => !o)}
            style={{
              cursor: "pointer",
              background: "transparent",
              border: "1px solid var(--border)",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "3px 8px",
              borderRadius: 6,
              fontSize: 12,
              color: "inherit",
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                backgroundColor: dotColor,
                display: "inline-block",
                boxShadow: hasGlow ? `0 0 6px ${dotColor}` : "none",
              }}
            />
            <span>{label}</span>
          </button>
        </Tooltip>
      </Popover.Target>

      <Popover.Dropdown p="sm">
        <Stack gap="xs">
          <Group justify="space-between">
            <Group gap={6}>
              <IconNetwork size={16} color="var(--accent)" />
              <Text fw={700} size="xs" tt="uppercase" c="dimmed">
                Conhecimento do assistente
              </Text>
            </Group>
            {data && (
              <Badge
                size="xs"
                variant="light"
                color={
                  !isConfigured
                    ? "gray"
                    : isPublisher
                    ? "info"
                    : "success"
                }
              >
                {!isConfigured
                  ? "Não configurado"
                  : isPublisher
                  ? "Computador principal"
                  : "Outro computador"}
              </Badge>
            )}
          </Group>

          <Divider />

          {isLoading ? (
            <Group justify="center" p="xs">
              <Loader size="xs" />
              <Text size="xs" c="dimmed">
                Consultando sincronização...
              </Text>
            </Group>
          ) : data ? (
            <Stack gap={6}>
              {data.erro && isConfigured && (
                <Alert
                  icon={<IconAlertCircle size={14} />}
                  color="warning"
                  variant="light"
                  p="xs"
                >
                  <Text size="xs">{data.erro}</Text>
                </Alert>
              )}

              {data.erro && !isConfigured && (
                <Alert
                  icon={<IconAlertCircle size={14} />}
                  color="gray"
                  variant="light"
                  p="xs"
                >
                  <Text size="xs">{data.erro}</Text>
                </Alert>
              )}

              <Group justify="space-between" wrap="nowrap">
                <Text size="xs" c="dimmed">
                  Papel:
                </Text>
                <Text size="xs" fw={600}>
                  {isPublisher
                    ? "Esta máquina publica as regras"
                    : `Recebido de: ${data.maquina || "Servidor"}`}
                </Text>
              </Group>

              {data.fonte && (
                <Group justify="space-between" wrap="nowrap">
                  <Text size="xs" c="dimmed">
                    Fonte:
                  </Text>
                  <Text size="xs" truncate="end" maw={180}>
                    {data.fonte}
                  </Text>
                </Group>
              )}

              <Group justify="space-between" wrap="nowrap">
                <Text size="xs" c="dimmed">
                  Regras aprendidas:
                </Text>
                <Badge size="xs" variant="outline" color="dark">
                  {data.total_regras}{" "}
                  {data.total_regras === 1 ? "regra" : "regras"}
                </Badge>
              </Group>

              <Group justify="space-between" wrap="nowrap">
                <Text size="xs" c="dimmed">
                  Última atualização:
                </Text>
                <Text size="xs">
                  {formattedDate(data.atualizado_em || data.publicado_em)}
                </Text>
              </Group>
            </Stack>
          ) : (
            <Text size="xs" c="dimmed">
              Informações de sincronização indisponíveis no momento.
            </Text>
          )}

          <Divider mt={4} />

          <Group justify="space-between">
            <Button
              size="xs"
              variant="subtle"
              color="gray"
              leftSection={<IconDatabase size={14} />}
              onClick={() => {
                setOpened(false);
                navigate("/base-oficial");
              }}
            >
              Base oficial
            </Button>

            <Button
              size="xs"
              variant="light"
              leftSection={<IconRefresh size={14} />}
              loading={syncMutation.isPending}
              onClick={() => {
                if (data) {
                  syncMutation.mutate();
                } else {
                  void refetch();
                }
              }}
            >
              Sincronizar agora
            </Button>
          </Group>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
