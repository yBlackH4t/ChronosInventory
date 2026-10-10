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
import { IconDeviceFloppy, IconTrash, IconRobot, IconAlertCircle, IconInfoCircle } from "@tabler/icons-react";
import { getAssistantConfig, updateAssistantConfig } from "../../lib/assistantApi";
import type { AssistantEffort, AssistantProviderId } from "../../types/assistant";

const ENV_KEY_NAMES: Partial<Record<AssistantProviderId, string>> = {
  groq: "GROQ_API_KEY",
  gemini: "GEMINI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
};

const KEY_PLACEHOLDERS: Partial<Record<AssistantProviderId, string>> = {
  groq: "gsk_...",
  gemini: "AIza...",
  anthropic: "sk-ant-...",
};

const KEY_HELP: Partial<Record<AssistantProviderId, string>> = {
  groq: "Crie uma chave gratuita em console.groq.com → API Keys (não pede cartão)",
};

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
      setModelo(config.modelo ?? "");
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

  const handleProviderChange = (value: string | null) => {
    if (!value || !config || value === config.provedor) return;
    setApiKey("");
    mutation.mutate({ provedor: value as AssistantProviderId });
  };

  const handleSaveKey = () => {
    if (!apiKey || !config) return;
    mutation.mutate({ provedor: config.provedor, api_key: apiKey });
  };

  const handleRemoveKey = () => {
    if (!config) return;
    mutation.mutate({ provedor: config.provedor, api_key: "" });
  };

  const handleSaveSettings = () => {
    if (!config) return;
    mutation.mutate({
      provedor: config.provedor,
      modelo: modelo || undefined,
      esforco: (esforco as AssistantEffort) || undefined,
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

  const provedores = config.provedores ?? [];
  const atual = provedores.find((p) => p.id === config.provedor);
  const precisaChave = atual?.precisa_chave ?? true;
  const nomeProvedor = atual?.nome ?? config.provedor;
  const usaAmbiente = config.origem_chave === "ambiente";
  const semIa = config.provedor === "nenhum";

  return (
    <Card withBorder p="md" radius="md" id="assistant-settings">
      <Group mb="md" align="center">
        <IconRobot size={24} color="var(--mantine-color-blue-6)" />
        <Title order={4}>Assistente de IA</Title>
        <Badge color={config.configurado ? "green" : "red"} variant="light">
          {config.configurado ? "Configurado" : "Não configurado"}
        </Badge>
      </Group>

      <Stack gap="md">
        <Select
          label="Provedor"
          description="Quando a IA não responder, o assistente usa a busca direta no estoque (sem IA)."
          value={config.provedor}
          onChange={handleProviderChange}
          allowDeselect={false}
          disabled={mutation.isPending}
          data={provedores.map((p) => ({
            value: p.id,
            label: p.gratuito ? `${p.nome} — gratuito` : p.nome,
          }))}
          rightSection={mutation.isPending ? <Loader size="xs" /> : undefined}
        />

        {semIa && (
          <Alert color="blue" variant="light" p="sm" icon={<IconInfoCircle size={16} />}>
            Sem IA: o assistente responde apenas pela busca direta no estoque.
          </Alert>
        )}

        {usaAmbiente && precisaChave && (
          <Alert color="blue" variant="light" p="sm" icon={<IconInfoCircle size={16} />}>
            Usando {ENV_KEY_NAMES[config.provedor] ?? "a chave"} configurada no ambiente deste computador.
          </Alert>
        )}

        {precisaChave && (
          <Card withBorder p="sm" radius="md" bg="var(--mantine-color-default-hover)">
            <Text size="sm" fw={500} mb={4}>Chave da API ({nomeProvedor})</Text>
            {KEY_HELP[config.provedor] && (
              <Text size="xs" c="dimmed" mb="xs">
                {KEY_HELP[config.provedor]}
              </Text>
            )}
            {config.chave_mascarada && !usaAmbiente && (
              <Text size="sm" c="dimmed" mb="xs">
                Chave atual: {config.chave_mascarada}
              </Text>
            )}
            <Group align="flex-end">
              <PasswordInput
                placeholder={KEY_PLACEHOLDERS[config.provedor] ?? "Cole a chave aqui"}
                value={apiKey}
                onChange={(e) => setApiKey(e.currentTarget.value)}
                flex={1}
                disabled={mutation.isPending || usaAmbiente}
                autoComplete="off"
              />
              <Button
                variant="light"
                leftSection={<IconDeviceFloppy size={16} />}
                onClick={handleSaveKey}
                disabled={!apiKey || mutation.isPending || usaAmbiente}
              >
                Salvar
              </Button>
              <Button
                variant="light"
                color="red"
                leftSection={<IconTrash size={16} />}
                onClick={handleRemoveKey}
                disabled={!config.chave_mascarada || usaAmbiente || mutation.isPending}
              >
                Remover
              </Button>
            </Group>
          </Card>
        )}

        {!semIa && (
          <Card withBorder p="sm" radius="md">
            <Text size="sm" fw={500} mb="xs">Parâmetros do Modelo ({nomeProvedor})</Text>
            <Stack gap="sm">
              <TextInput
                label="Modelo"
                value={modelo}
                onChange={(e) => setModelo(e.currentTarget.value)}
                disabled={mutation.isPending}
              />
              <Select
                label="Esforço (Effort)"
                description="Um esforço menor faz o assistente responder mais rápido e com menor custo. Só faz diferença para Groq e Claude."
                value={esforco}
                onChange={setEsforco}
                allowDeselect={false}
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
        )}

        {mutation.isError && (
          <Alert color="red" variant="light" p="sm" icon={<IconAlertCircle size={16} />}>
            Não foi possível salvar: {mutation.error instanceof Error ? mutation.error.message : "erro desconhecido"}
          </Alert>
        )}
      </Stack>
    </Card>
  );
}
