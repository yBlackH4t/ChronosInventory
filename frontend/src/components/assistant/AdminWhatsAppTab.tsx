import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Card,
  Group,
  Text,
  Badge,
  Button,
  Stack,
  Loader,
  Alert,
  Modal,
  Title,
  Paper,
  Box,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { QRCodeSVG } from "qrcode.react";
import {
  IconBrandWhatsapp,
  IconAlertTriangle,
  IconCheck,
  IconPower,
  IconUnlink,
  IconRefresh,
  IconHelp,
  IconAlertCircle,
  IconDeviceMobile,
} from "@tabler/icons-react";
import {
  getWhatsAppStatus,
  startWhatsApp,
  stopWhatsApp,
  logoutWhatsApp,
} from "../../lib/assistantAdminApi";
import type { WhatsAppState, WhatsAppStatus } from "../../types/assistantAdmin";

export default function AdminWhatsAppTab() {
  const queryClient = useQueryClient();
  const [modalDesconectar, setModalDesconectar] = useState(false);

  const {
    data: status,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["assistant-admin-whatsapp"],
    queryFn: getWhatsAppStatus,
    refetchInterval: (query) => {
      const state = query.state.data?.estado;
      // Atualiza a cada 2.5s se estiver esperando QR ou no meio de conexão
      if (state === "aguardando_qr" || state === "conectando" || state === "reconectando") {
        return 2500;
      }
      return 10000;
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["assistant-admin-whatsapp"] });
  };

  const startMutation = useMutation({
    mutationFn: startWhatsApp,
    onSuccess: (data: WhatsAppStatus) => {
      notifications.show({
        title: "Iniciando WhatsApp",
        message: data.estado === "aguardando_qr" ? "Escaneie o QR code gerado." : "Conectando ao WhatsApp...",
        color: "teal",
      });
      invalidate();
    },
    onError: (err: Error) => {
      notifications.show({
        title: "Erro ao iniciar",
        message: err.message || "Não foi possível iniciar a conexão do WhatsApp.",
        color: "red",
      });
    },
  });

  const stopMutation = useMutation({
    mutationFn: stopWhatsApp,
    onSuccess: () => {
      notifications.show({
        title: "WhatsApp desligado",
        message: "A ponte do WhatsApp foi pausada.",
        color: "blue",
      });
      invalidate();
    },
    onError: (err: Error) => {
      notifications.show({
        title: "Erro ao desligar",
        message: err.message || "Não foi possível parar a ponte do WhatsApp.",
        color: "red",
      });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: logoutWhatsApp,
    onSuccess: () => {
      notifications.show({
        title: "Desconectado",
        message: "Este computador foi desvinculado dos aparelhos conectados.",
        color: "orange",
      });
      setModalDesconectar(false);
      invalidate();
    },
    onError: (err: Error) => {
      notifications.show({
        title: "Erro ao desconectar",
        message: err.message || "Não foi possível desconectar a sessão.",
        color: "red",
      });
    },
  });

  const getStatusBadge = (estado: WhatsAppState, numero: string | null) => {
    switch (estado) {
      case "parado":
        return <Badge color="gray" variant="light">Desligado</Badge>;
      case "conectando":
        return (
          <Badge color="yellow" variant="light" leftSection={<Loader size={10} color="yellow" />}>
            Conectando…
          </Badge>
        );
      case "aguardando_qr":
        return <Badge color="blue" variant="filled">Escaneie o QR code</Badge>;
      case "conectado":
        return (
          <Badge color="green" variant="filled" leftSection={<IconCheck size={12} />}>
            Conectado ao número {numero || ""}
          </Badge>
        );
      case "reconectando":
        return (
          <Badge color="yellow" variant="light" leftSection={<Loader size={10} color="yellow" />}>
            Reconectando…
          </Badge>
        );
      case "desconectado":
        return <Badge color="orange" variant="light">Desconectado do celular — conecte de novo</Badge>;
      case "erro":
        return <Badge color="red" variant="filled">Erro na conexão</Badge>;
      default:
        return <Badge color="gray">{estado}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <Card withBorder p="xl" radius="md">
        <Group justify="center" gap="sm">
          <Loader size="sm" />
          <Text size="sm" c="dimmed">
            Verificando status do WhatsApp...
          </Text>
        </Group>
      </Card>
    );
  }

  if (isError) {
    return (
      <Alert
        icon={<IconAlertCircle size={16} />}
        title="Erro ao obter status do WhatsApp"
        color="red"
      >
        <Group justify="space-between">
          <Text size="sm">{error instanceof Error ? error.message : "Erro de comunicação."}</Text>
          <Button size="xs" variant="outline" color="red" onClick={() => refetch()}>
            Tentar novamente
          </Button>
        </Group>
      </Alert>
    );
  }

  const estado = status?.estado ?? "parado";
  const isConectado = estado === "conectado";
  const isAguardandoQr = estado === "aguardando_qr";
  const isParado = estado === "parado" || estado === "desconectado" || estado === "erro";

  return (
    <Stack gap="md">
      {/* Aviso Fixo Legal */}
      <Alert
        icon={<IconAlertTriangle size={16} />}
        color="orange"
        variant="light"
        p="xs"
      >
        <Text size="xs">
          <strong>Aviso:</strong> Conexão não oficial: o WhatsApp pode bloquear o número. Use com moderação.
        </Text>
      </Alert>

      {/* Painel de Estado e Ações Principais */}
      <Card withBorder p="md" radius="md" shadow="xs">
        <Group justify="space-between" align="center" mb="md" wrap="wrap">
          <Group gap="xs">
            <IconBrandWhatsapp size={28} color="var(--mantine-color-teal-6)" />
            <div>
              <Title order={4}>WhatsApp do Assistente</Title>
              <Text size="xs" c="dimmed">
                Modo Copiloto para atendimento rápido a clientes
              </Text>
            </div>
          </Group>

          <Group gap="xs">
            {getStatusBadge(estado, status?.numero ?? null)}
            <Button
              size="xs"
              variant="subtle"
              color="gray"
              leftSection={<IconRefresh size={14} />}
              onClick={() => refetch()}
            >
              Atualizar
            </Button>
          </Group>
        </Group>

        {status?.erro && (
          <Alert color="red" variant="light" p="xs" mb="md" icon={<IconAlertCircle size={16} />}>
            Erro: {status.erro}
          </Alert>
        )}

        {/* Caso 1: Parado ou desconectado */}
        {isParado && (
          <Stack gap="sm" align="center" py="lg">
            <Text size="sm" c="dimmed" ta="center" maw={460}>
              A ponte do WhatsApp está inativa neste momento. Inicie para conectar o WhatsApp
              da empresa ao Chronos.
            </Text>
            <Button
              color="teal"
              size="md"
              leftSection={<IconBrandWhatsapp size={20} />}
              onClick={() => startMutation.mutate()}
              loading={startMutation.isPending}
            >
              Conectar WhatsApp
            </Button>
          </Stack>
        )}

        {/* Caso 2: Aguardando leitura do QR Code */}
        {isAguardandoQr && (
          <Stack gap="md" align="center" py="md">
            <Paper withBorder p="md" radius="md" shadow="sm">
              {status?.qr ? (
                <Box p="xs" bg="white" style={{ borderRadius: 8, display: "inline-block", lineHeight: 0 }}>
                  <QRCodeSVG value={status.qr} size={230} level="M" />
                </Box>
              ) : (
                <Box p="xl" ta="center">
                  <Loader size="md" />
                  <Text size="xs" c="dimmed" mt="xs">
                    Gerando QR code...
                  </Text>
                </Box>
              )}
            </Paper>

            <Group gap="xs" align="center">
              <IconDeviceMobile size={18} color="var(--mantine-color-teal-6)" />
              <Text size="sm" fw={500}>
                No celular: WhatsApp &gt; Configurações &gt; Aparelhos conectados &gt; Conectar um aparelho
              </Text>
            </Group>

            <Text size="xs" c="dimmed">
              O código atualiza automaticamente a cada 20 segundos.
            </Text>

            <Button
              color="gray"
              variant="default"
              size="xs"
              onClick={() => stopMutation.mutate()}
              loading={stopMutation.isPending}
            >
              Cancelar conexão
            </Button>
          </Stack>
        )}

        {/* Caso 3: Conectado */}
        {isConectado && (
          <Stack gap="sm" py="sm">
            <Paper
              withBorder
              p="sm"
              radius="md"
              bg="var(--mantine-color-green-light)"
              style={{ borderColor: "var(--mantine-color-green-light-border)" }}
            >
              <Group justify="space-between">
                <div>
                  <Text size="sm" fw={600} c="var(--mantine-color-green-light-color)">
                    Dispositivo pareado com sucesso
                  </Text>
                  <Text size="xs" c="dimmed">
                    Número conectado: {status?.numero || "Confirmado"}
                  </Text>
                </div>
                <Group gap="xs">
                  <Button
                    size="xs"
                    color="gray"
                    variant="light"
                    leftSection={<IconPower size={14} />}
                    onClick={() => stopMutation.mutate()}
                    loading={stopMutation.isPending}
                  >
                    Desligar
                  </Button>
                  <Button
                    size="xs"
                    color="red"
                    variant="light"
                    leftSection={<IconUnlink size={14} />}
                    onClick={() => setModalDesconectar(true)}
                  >
                    Desconectar este computador
                  </Button>
                </Group>
              </Group>
            </Paper>
          </Stack>
        )}
      </Card>

      {/* Quadro informativo: Como usar */}
      <Card withBorder p="md" radius="md" bg="var(--mantine-color-default-hover)">
        <Group gap="xs" mb="xs">
          <IconHelp size={20} color="var(--mantine-color-blue-6)" />
          <Text fw={600} size="sm">
            Como usar o Modo Copiloto
          </Text>
        </Group>

        <Stack gap="xs">
          <Text size="sm">
            • <strong>Atendimento a clientes:</strong> Reaja com 🤖 na mensagem do cliente. O assistente
            processa o texto ou áudio (transcrevendo via Groq/Whisper) e responde citando a mensagem na conversa.
          </Text>
          <Text size="sm">
            • <strong>Comandos na conversa "Mensagem para mim":</strong>
          </Text>
          <Box pl="md">
            <Text size="xs" c="dimmed">
              <strong>/ajuda</strong> — lista os comandos disponíveis
            </Text>
            <Text size="xs" c="dimmed">
              <strong>/pendentes</strong> — lista os códigos que precisam de revisão
            </Text>
            <Text size="xs" c="dimmed">
              <strong>/ensinar</strong> — envia uma equivalência direta pelo WhatsApp (cria uma proposta para aprovação)
            </Text>
          </Box>
        </Stack>
      </Card>

      {/* Modal Confirmação Desconectar */}
      <Modal
        opened={modalDesconectar}
        onClose={() => setModalDesconectar(false)}
        title="Desconectar do WhatsApp"
        centered
        size="sm"
      >
        <Stack gap="sm">
          <Text size="sm">
            Tem certeza que deseja desvincular este computador do WhatsApp? A sessão será
            encerrada e será necessário escanear o QR code novamente para reconectar.
          </Text>
          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={() => setModalDesconectar(false)}>
              Cancelar
            </Button>
            <Button
              color="red"
              onClick={() => disconnectMutation.mutate()}
              loading={disconnectMutation.isPending}
            >
              Desconectar
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
