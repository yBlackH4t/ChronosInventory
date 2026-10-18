import { useState, useEffect } from "react";
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
  Switch,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { QRCodeSVG } from "qrcode.react";
import dayjs from "dayjs";
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
  IconCalendarTime,
  IconEye,
} from "@tabler/icons-react";
import {
  getWhatsAppStatus,
  startWhatsApp,
  stopWhatsApp,
  logoutWhatsApp,
  getDailySummary,
  updateDailySummary,
} from "../../lib/assistantAdminApi";
import { formatWhatsAppText } from "../../lib/assistantFormat";
import type { WhatsAppState, WhatsAppStatus } from "../../types/assistantAdmin";
import WhatsAppDraftsCard from "./WhatsAppDraftsCard";

export default function AdminWhatsAppTab() {
  const queryClient = useQueryClient();
  const [modalDesconectar, setModalDesconectar] = useState(false);
  const [modalResumo, setModalResumo] = useState(false);
  const [horaInput, setHoraInput] = useState<string>("");

  const {
    data: dailySummary,
    isLoading: isLoadingSummary,
  } = useQuery({
    queryKey: ["assistant-admin-daily-summary"],
    queryFn: getDailySummary,
  });

  useEffect(() => {
    if (dailySummary?.hora) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHoraInput(dailySummary.hora);
    }
  }, [dailySummary?.hora]);

  const updateSummaryMutation = useMutation({
    mutationFn: updateDailySummary,
    onSuccess: (data) => {
      notifications.show({
        title: "Resumo diário atualizado",
        message: data.ativo
          ? `Envio diário ativado para as ${data.hora}.`
          : "Envio diário desativado.",
        color: "success",
      });
      queryClient.invalidateQueries({
        queryKey: ["assistant-admin-daily-summary"],
      });
    },
    onError: (err: Error) => {
      notifications.show({
        title: "Erro ao atualizar",
        message: err.message || "Não foi possível atualizar as configurações do resumo.",
        color: "danger",
      });
    },
  });

  const handleSaveHora = () => {
    const trimmed = horaInput.trim();
    if (/^\d{2}:\d{2}$/.test(trimmed)) {
      updateSummaryMutation.mutate({ hora: trimmed });
    } else {
      notifications.show({
        title: "Horário inválido",
        message: "Digite no formato HH:MM (ex: 08:00).",
        color: "danger",
      });
    }
  };

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
        color: "success",
      });
      invalidate();
    },
    onError: (err: Error) => {
      notifications.show({
        title: "Erro ao iniciar",
        message: err.message || "Não foi possível iniciar a conexão do WhatsApp.",
        color: "danger",
      });
    },
  });

  const stopMutation = useMutation({
    mutationFn: stopWhatsApp,
    onSuccess: () => {
      notifications.show({
        title: "WhatsApp desligado",
        message: "A ponte do WhatsApp foi pausada.",
        color: "info",
      });
      invalidate();
    },
    onError: (err: Error) => {
      notifications.show({
        title: "Erro ao desligar",
        message: err.message || "Não foi possível parar a ponte do WhatsApp.",
        color: "danger",
      });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: logoutWhatsApp,
    onSuccess: () => {
      notifications.show({
        title: "Desconectado",
        message: "Este computador foi desvinculado dos aparelhos conectados.",
        color: "warning",
      });
      setModalDesconectar(false);
      invalidate();
    },
    onError: (err: Error) => {
      notifications.show({
        title: "Erro ao desconectar",
        message: err.message || "Não foi possível desconectar a sessão.",
        color: "danger",
      });
    },
  });

  const getStatusBadge = (estado: WhatsAppState, numero: string | null) => {
    switch (estado) {
      case "parado":
        return <Badge color="gray" variant="light">Desligado</Badge>;
      case "conectando":
        return (
          <Badge color="warning" variant="light" leftSection={<Loader size={10} color="warning" />}>
            Conectando…
          </Badge>
        );
      case "aguardando_qr":
        return <Badge color="info" variant="filled">Escaneie o QR code</Badge>;
      case "conectado":
        return (
          <Badge color="success" variant="filled" leftSection={<IconCheck size={12} />}>
            Conectado ao número {numero || ""}
          </Badge>
        );
      case "reconectando":
        return (
          <Badge color="warning" variant="light" leftSection={<Loader size={10} color="warning" />}>
            Reconectando…
          </Badge>
        );
      case "desconectado":
        return <Badge color="warning" variant="light">Desconectado do celular — conecte de novo</Badge>;
      case "erro":
        return <Badge color="danger" variant="filled">Erro na conexão</Badge>;
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
        color="danger"
      >
        <Group justify="space-between">
          <Text size="sm">{error instanceof Error ? error.message : "Erro de comunicação."}</Text>
          <Button size="xs" variant="outline" color="danger" onClick={() => refetch()}>
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
        color="warning"
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
            <IconBrandWhatsapp size={28} color="var(--mantine-color-success-6)" />
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
          <Alert color="danger" variant="light" p="xs" mb="md" icon={<IconAlertCircle size={16} />}>
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
              color="success"
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
              <IconDeviceMobile size={18} color="var(--mantine-color-success-6)" />
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
                    color="danger"
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

      {status?.papel_robo === "reserva" && (
        <Alert color={status.principal_respondendo ? "info" : "warning"} variant="light" p="xs">
          <Text size="xs">
            <strong>PC reserva.</strong>{" "}
            {status.principal_respondendo
              ? "O PC principal está com o robô ligado: este PC só observa e não responde."
              : "O PC principal não está respondendo agora: este PC responde no lugar dele."}
          </Text>
        </Alert>
      )}

      <WhatsAppDraftsCard review={status?.revisar ?? true} />

      {/* Bloco Resumo Diário */}
      <Card withBorder p="md" radius="md" shadow="xs">
        <Group justify="space-between" align="center" mb="sm" wrap="wrap">
          <Group gap="xs">
            <IconCalendarTime size={24} color="var(--mantine-color-info-6)" />
            <div>
              <Text fw={600} size="sm">
                Resumo diário
              </Text>
              <Text size="xs" c="dimmed">
                Status do estoque, produtos zerados e buscas sem estoque enviados para você
              </Text>
            </div>
          </Group>

          <Button
            size="xs"
            variant="light"
            leftSection={<IconEye size={14} />}
            onClick={() => setModalResumo(true)}
          >
            Ver o resumo de hoje
          </Button>
        </Group>

        <Stack gap="sm">
          <Group justify="space-between" align="center" wrap="wrap">
            <Switch
              label="Mandar todo dia na 'Mensagem para mim'"
              checked={Boolean(dailySummary?.ativo)}
              onChange={(e) =>
                updateSummaryMutation.mutate({ ativo: e.currentTarget.checked })
              }
              disabled={updateSummaryMutation.isPending || isLoadingSummary}
            />

            <Group gap="xs" align="center">
              <Text size="xs" fw={500}>
                Horário:
              </Text>
              <TextInput
                size="xs"
                w={80}
                placeholder="08:00"
                value={horaInput}
                onChange={(e) => setHoraInput(e.currentTarget.value)}
                onBlur={handleSaveHora}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveHora();
                }}
                disabled={updateSummaryMutation.isPending || isLoadingSummary}
              />
            </Group>
          </Group>

          <Group justify="space-between" align="center" wrap="wrap">
            <Text size="xs" c="dimmed">
              {dailySummary?.ultimo_envio
                ? `Último envio: ${dayjs(dailySummary.ultimo_envio).format("DD/MM/YYYY [às] HH:mm")}`
                : "Último envio: nenhum envio registrado ainda"}
            </Text>
            <Text size="xs" c="dimmed">
              Sai só com o WhatsApp do app conectado. Na conversa, /resumo manda na hora.
            </Text>
          </Group>
        </Stack>
      </Card>

      {/* Quadro informativo: Como usar */}
      <Card withBorder p="md" radius="md" bg="var(--mantine-color-default-hover)">
        <Group gap="xs" mb="xs">
          <IconHelp size={20} color="var(--mantine-color-info-6)" />
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
            • <strong>Foto da plaqueta:</strong> Reaja com 🤖 na foto.
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
            <Text size="xs" c="dimmed">
              <strong>/resumo</strong> — manda o resumo do dia na hora
            </Text>
            <Text size="xs" c="dimmed">
              <strong>/enviar</strong> e <strong>/descartar</strong> — o rascunho da resposta (com "Revisar antes de enviar" ligado)
            </Text>
          </Box>
        </Stack>
      </Card>

      {/* Modal Ver o resumo de hoje */}
      <Modal
        opened={modalResumo}
        onClose={() => setModalResumo(false)}
        title="Resumo de hoje"
        centered
        size="md"
      >
        <Stack gap="sm">
          <Paper
            withBorder
            p="md"
            radius="md"
            bg="var(--mantine-color-default-hover)"
            style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
          >
            <Text size="sm">
              {dailySummary?.texto ? formatWhatsAppText(dailySummary.texto) : "Nenhum resumo gerado ainda."}
            </Text>
          </Paper>
          <Group justify="space-between">
            <Text size="xs" c="dimmed">
              {dailySummary?.ultimo_envio
                ? `Último envio: ${dayjs(dailySummary.ultimo_envio).format("DD/MM/YYYY [às] HH:mm")}`
                : "Nenhum envio registrado ainda."}
            </Text>
            <Button variant="default" size="xs" onClick={() => setModalResumo(false)}>
              Fechar
            </Button>
          </Group>
        </Stack>
      </Modal>

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
              color="danger"
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
