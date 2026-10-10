import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Card,
  Title,
  Text,
  Badge,
  Group,
  PasswordInput,
  Button,
  TextInput,
  Select,
  Stack,
  Loader,
  Alert,
} from "@mantine/core";
import { IconDeviceFloppy, IconTrash, IconRobot, IconAlertCircle } from "@tabler/icons-react";
import { getAssistantConfig, updateAssistantConfig } from "../../lib/assistantApi";

export default function AssistantSettingsPanel() {
  const queryClient = useQueryClient();
  const [apiKey, setApiKey] = useState("");
  const [modelo, setModelo] = useState("");
  const [esforco, setEsforco] = useState<string | null>(null);

  const { data: config, isLoading, isError } = useQuery({
    queryKey: ["assistant-config"],
    queryFn: getAssistantConfig,
  });

  useEffect(() => {
    if (config) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setModelo(config.modelo || "claude-opus-5-5");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEsforco(config.esforco || "medium");
    }
  }, [config]);

  const mutation = useMutation({
    mutationFn: updateAssistantConfig,
    onSuccess: (newData) => {
      queryClient.setQueryData(["assistant-config"], newData);
      setApiKey(""); // Limpa o campo de senha
    },
  });

  const handleSaveKey = () => {
    if (!apiKey) return;
    mutation.mutate({ api_key: apiKey });
  };

  const handleRemoveKey = () => {
    mutation.mutate({ api_key: "" });
  };

  const handleSaveSettings = () => {
    mutation.mutate({
      modelo: modelo || undefined,
      esforco: (esforco as "low" | "medium" | "high" | "xhigh" | "max") || undefined,
    });
  };

  if (isLoading) {
    return (
      <Card withBorder p="md" radius="md">
        <Group>
          <Loader size="sm" />
          <Text>Carregando configurações do assistente...</Text>
        </Group>
      </Card>
    );
  }

  if (isError || !config) {
    return (
      <Alert icon={<IconAlertCircle size={16} />} title="Erro" color="red">
        Falha ao carregar as configurações do assistente.
      </Alert>
    );
  }

  return (
    <Card withBorder p="md" radius="md" id="assistant-settings">
      <Group mb="md" align="center">
        <IconRobot size={24} color="var(--mantine-color-blue-6)" />
        <Title order={4}>Assistente de IA</Title>
        <Badge color={config.configurado ? "green" : "red"} variant="light">
          {config.configurado ? "Configurado" : "Não configurado"}
        </Badge>
      </Group>

      {config.origem_chave === "ambiente" && (
        <Alert color="blue" mb="md" p="sm">
          Aviso: Usando ANTHROPIC_API_KEY configurada no ambiente deste computador.
        </Alert>
      )}

      <Stack gap="md">
        <Card withBorder p="sm" radius="md" bg="var(--mantine-color-gray-0)">
          <Text size="sm" fw={500} mb="xs">Chave da API (Anthropic)</Text>
          {config.chave_mascarada && config.origem_chave !== "ambiente" && (
            <Text size="sm" c="dimmed" mb="xs">
              Chave atual: {config.chave_mascarada}
            </Text>
          )}
          <Group align="flex-end">
            <PasswordInput
              placeholder="sk-ant-..."
              value={apiKey}
              onChange={(e) => setApiKey(e.currentTarget.value)}
              style={{ flex: 1 }}
              disabled={mutation.isPending || config.origem_chave === "ambiente"}
            />
            <Button
              variant="light"
              leftSection={<IconDeviceFloppy size={16} />}
              onClick={handleSaveKey}
              disabled={!apiKey || mutation.isPending || config.origem_chave === "ambiente"}
            >
              Salvar
            </Button>
            <Button
              variant="light"
              color="red"
              leftSection={<IconTrash size={16} />}
              onClick={handleRemoveKey}
              disabled={!config.configurado || config.origem_chave === "ambiente" || mutation.isPending}
            >
              Remover
            </Button>
          </Group>
        </Card>

        <Card withBorder p="sm" radius="md">
          <Text size="sm" fw={500} mb="xs">Parâmetros do Modelo</Text>
          <Stack gap="sm">
            <TextInput
              label="Modelo"
              value={modelo}
              onChange={(e) => setModelo(e.currentTarget.value)}
              disabled={mutation.isPending}
            />
            <Select
              label="Esforço (Effort)"
              description="Um esforço menor faz o assistente responder mais rápido e com menor custo."
              value={esforco}
              onChange={setEsforco}
              data={[
                { value: "low", label: "Baixo (low)" },
                { value: "medium", label: "Médio (medium)" },
                { value: "high", label: "Alto (high)" },
                { value: "xhigh", label: "Muito alto (xhigh)" },
                { value: "max", label: "Máximo (max)" },
              ]}
              disabled={mutation.isPending}
            />
            <Group justify="flex-end">
              <Button
                variant="light"
                leftSection={<IconDeviceFloppy size={16} />}
                onClick={handleSaveSettings}
                disabled={mutation.isPending || (!modelo && !esforco)}
              >
                Salvar Parâmetros
              </Button>
            </Group>
          </Stack>
        </Card>
      </Stack>
    </Card>
  );
}
