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
  Tabs,
  PasswordInput,
  Modal,
  Title,
  Paper,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconShieldLock,
  IconLock,
  IconKey,
  IconLogout,
  IconAlertCircle,
  IconListCheck,
  IconDatabase,
  IconHistory,
  IconInfoCircle,
  IconBrandWhatsapp,
} from "@tabler/icons-react";
import {
  getAdminStatus,
  adminLogin,
  adminLogout,
  setAdminPassword,
  getReviewList,
  listProposals,
} from "../../lib/assistantAdminApi";
import {
  useAdminSession,
  clearAdminNotice,
} from "../../state/assistantAdminSession";
import AdminReviewTab from "./AdminReviewTab";
import AdminKnowledgeTab from "./AdminKnowledgeTab";
import AdminHistoryTab from "./AdminHistoryTab";
import AdminWhatsAppTab from "./AdminWhatsAppTab";

export default function AssistantAdminPanel() {
  const queryClient = useQueryClient();
  const session = useAdminSession();

  // Estados locais para formulários de autenticação
  const [senhaInput, setSenhaInput] = useState("");
  const [senhaNovaInput, setSenhaNovaInput] = useState("");
  const [senhaNovaConfirm, setSenhaNovaConfirm] = useState("");

  // Modal para trocar senha
  const [modalTrocarSenha, setModalTrocarSenha] = useState(false);
  const [trocaSenhaAtual, setTrocaSenhaAtual] = useState("");
  const [trocaSenhaNova, setTrocaSenhaNova] = useState("");
  const [trocaSenhaConfirm, setTrocaSenhaConfirm] = useState("");

  const {
    data: status,
    isLoading: statusLoading,
    isError: statusIsError,
    error: statusError,
    refetch: refetchStatus,
  } = useQuery({
    queryKey: ["assistant-admin-status", session.token],
    queryFn: getAdminStatus,
  });

  // Query para badge com quantidade de itens pendentes na revisão
  const { data: reviewItems } = useQuery({
    queryKey: ["assistant-admin-review"],
    queryFn: getReviewList,
    enabled: !!session.token && !!status?.maquina_publicadora,
  });

  const { data: pendingProposals } = useQuery({
    queryKey: ["assistant-admin-proposals"],
    queryFn: () => listProposals("pendente"),
    enabled: !!session.token && !!status?.maquina_publicadora,
  });

  const loginMutation = useMutation({
    mutationFn: (senha: string) => adminLogin(senha),
    onSuccess: () => {
      notifications.show({
        title: "Login efetuado",
        message: "Área de administrador do assistente liberada.",
        color: "green",
      });
      setSenhaInput("");
      clearAdminNotice();
      queryClient.invalidateQueries({ queryKey: ["assistant-admin-status"] });
    },
    onError: (err: Error) => {
      notifications.show({
        title: "Falha no login",
        message: err.message || "Senha incorreta ou acesso não permitido.",
        color: "red",
      });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: () => adminLogout(),
    onSuccess: () => {
      notifications.show({
        title: "Sessão encerrada",
        message: "Você saiu da área de administrador.",
        color: "blue",
      });
      queryClient.invalidateQueries({ queryKey: ["assistant-admin-status"] });
    },
  });

  const criarSenhaMutation = useMutation({
    mutationFn: (senhaNova: string) =>
      setAdminPassword({ senha_nova: senhaNova }),
    onSuccess: () => {
      notifications.show({
        title: "Senha criada",
        message: "Senha de admin configurada. Faça login para continuar.",
        color: "green",
      });
      setSenhaNovaInput("");
      setSenhaNovaConfirm("");
      queryClient.invalidateQueries({ queryKey: ["assistant-admin-status"] });
    },
    onError: (err: Error) => {
      notifications.show({
        title: "Erro ao criar senha",
        message: err.message || "Não foi possível registrar a senha.",
        color: "red",
      });
    },
  });

  const trocarSenhaMutation = useMutation({
    mutationFn: ({ atual, nova }: { atual: string; nova: string }) =>
      setAdminPassword({ senha_atual: atual, senha_nova: nova }),
    onSuccess: () => {
      notifications.show({
        title: "Senha alterada",
        message: "A senha foi alterada com sucesso. Faça login novamente.",
        color: "green",
      });
      setModalTrocarSenha(false);
      setTrocaSenhaAtual("");
      setTrocaSenhaNova("");
      setTrocaSenhaConfirm("");
      queryClient.invalidateQueries({ queryKey: ["assistant-admin-status"] });
    },
    onError: (err: Error) => {
      notifications.show({
        title: "Erro ao trocar senha",
        message: err.message || "Não foi possível alterar a senha.",
        color: "red",
      });
    },
  });

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!senhaInput) return;
    loginMutation.mutate(senhaInput);
  };

  const handleCriarSenha = (e: React.FormEvent) => {
    e.preventDefault();
    if (senhaNovaInput.length < 6) {
      notifications.show({
        title: "Senha muito curta",
        message: "A senha de admin precisa ter no mínimo 6 caracteres.",
        color: "orange",
      });
      return;
    }
    if (senhaNovaInput !== senhaNovaConfirm) {
      notifications.show({
        title: "Senhas não conferem",
        message: "A confirmação de senha não confere.",
        color: "orange",
      });
      return;
    }
    criarSenhaMutation.mutate(senhaNovaInput);
  };

  const handleTrocarSenha = (e: React.FormEvent) => {
    e.preventDefault();
    if (!trocaSenhaAtual) {
      notifications.show({
        title: "Senha atual obrigatória",
        message: "Informe a senha atual de admin.",
        color: "orange",
      });
      return;
    }
    if (trocaSenhaNova.length < 6) {
      notifications.show({
        title: "Senha muito curta",
        message: "A nova senha precisa ter no mínimo 6 caracteres.",
        color: "orange",
      });
      return;
    }
    if (trocaSenhaNova !== trocaSenhaConfirm) {
      notifications.show({
        title: "Senhas não conferem",
        message: "A confirmação da nova senha não confere.",
        color: "orange",
      });
      return;
    }
    trocarSenhaMutation.mutate({
      atual: trocaSenhaAtual,
      nova: trocaSenhaNova,
    });
  };

  if (statusLoading) {
    return (
      <Card withBorder p="xl" radius="md">
        <Group justify="center" gap="sm">
          <Loader size="sm" />
          <Text size="sm" c="dimmed">
            Verificando permissões de administrador...
          </Text>
        </Group>
      </Card>
    );
  }

  if (statusIsError) {
    return (
      <Alert
        icon={<IconAlertCircle size={16} />}
        title="Erro ao verificar status do admin"
        color="red"
      >
        <Group justify="space-between">
          <Text size="sm">
            {statusError instanceof Error
              ? statusError.message
              : "Erro ao se comunicar com o backend."}
          </Text>
          <Button size="xs" variant="outline" color="red" onClick={() => refetchStatus()}>
            Tentar novamente
          </Button>
        </Group>
      </Alert>
    );
  }

  // Caso 1: Máquina NÃO é publicadora
  if (!status?.maquina_publicadora) {
    return (
      <Stack gap="md">
        <Alert
          icon={<IconInfoCircle size={18} />}
          title="Máquina não publicadora"
          color="orange"
          variant="light"
        >
          Para ensinar o assistente, esta máquina precisa ser a publicadora da
          base oficial (Backup &gt; Base oficial &gt; Papel desta máquina: Publica a base).
          Nesta máquina, a base de conhecimento fica disponível apenas para consulta.
        </Alert>

        <Card withBorder p="md" radius="md">
          <Title order={4} mb="md">
            Base de Conhecimento (Modo Leitura)
          </Title>
          <AdminKnowledgeTab readOnly={true} />
        </Card>
      </Stack>
    );
  }

  // Caso 2: Senha ainda não definida
  if (!status.senha_definida) {
    return (
      <Card withBorder p="lg" radius="md" maw={480} mx="auto" shadow="sm">
        <Stack gap="md">
          <Group gap="xs">
            <IconShieldLock size={28} color="var(--mantine-color-blue-6)" />
            <div>
              <Title order={4}>Criar Senha de Administrador</Title>
              <Text size="xs" c="dimmed">
                Defina uma senha para proteger a área de ensino e revisão da IA.
              </Text>
            </div>
          </Group>

          <form onSubmit={handleCriarSenha}>
            <Stack gap="sm">
              <PasswordInput
                label="Nova senha de admin"
                description="Mínimo de 6 caracteres"
                placeholder="Digite a nova senha"
                value={senhaNovaInput}
                onChange={(e) => setSenhaNovaInput(e.currentTarget.value)}
                required
                autoFocus
              />
              <PasswordInput
                label="Confirme a nova senha"
                placeholder="Repita a senha"
                value={senhaNovaConfirm}
                onChange={(e) => setSenhaNovaConfirm(e.currentTarget.value)}
                required
              />
              <Button
                type="submit"
                fullWidth
                mt="xs"
                color="blue"
                loading={criarSenhaMutation.isPending}
              >
                Criar Senha e Continuar
              </Button>
            </Stack>
          </form>
        </Stack>
      </Card>
    );
  }

  // Caso 3: Senha definida, mas NÃO autenticado
  if (!session.token) {
    return (
      <Card withBorder p="lg" radius="md" maw={440} mx="auto" shadow="sm">
        <Stack gap="md">
          <Group gap="xs">
            <IconLock size={26} color="var(--mantine-color-blue-6)" />
            <div>
              <Title order={4}>Área do Administrador</Title>
              <Text size="xs" c="dimmed">
                Ensino, revisão e correção de conversas da IA
              </Text>
            </div>
          </Group>

          {session.notice && (
            <Alert
              icon={<IconAlertCircle size={16} />}
              color="orange"
              variant="light"
              withCloseButton
              onClose={() => clearAdminNotice()}
            >
              {session.notice}
            </Alert>
          )}

          <form onSubmit={handleLogin}>
            <Stack gap="sm">
              <PasswordInput
                label="Senha de Administrador"
                placeholder="Digite sua senha de admin"
                value={senhaInput}
                onChange={(e) => setSenhaInput(e.currentTarget.value)}
                required
                autoFocus
              />
              <Button
                type="submit"
                fullWidth
                mt="xs"
                color="blue"
                leftSection={<IconKey size={16} />}
                loading={loginMutation.isPending}
              >
                Entrar
              </Button>
            </Stack>
          </form>
        </Stack>
      </Card>
    );
  }

  // Caso 4: Autenticado como Administrador!
  const pendingCount = (reviewItems?.length ?? 0) + (pendingProposals?.length ?? 0);

  return (
    <Stack gap="md">
      {/* Barra superior de controle do admin */}
      <Paper withBorder p="xs" radius="md" bg="var(--mantine-color-default-hover)">
        <Group justify="space-between" wrap="wrap">
          <Group gap="xs">
            <Badge color="green" variant="light" leftSection={<IconShieldLock size={12} />}>
              Admin Autenticado
            </Badge>
            <Badge color="blue" variant="outline">
              Máquina Publicadora
            </Badge>
          </Group>

          <Group gap="xs">
            <Button
              size="xs"
              variant="default"
              leftSection={<IconKey size={14} />}
              onClick={() => setModalTrocarSenha(true)}
            >
              Trocar senha
            </Button>
            <Button
              size="xs"
              variant="light"
              color="red"
              leftSection={<IconLogout size={14} />}
              onClick={() => logoutMutation.mutate()}
              loading={logoutMutation.isPending}
            >
              Sair
            </Button>
          </Group>
        </Group>
      </Paper>

      {/* Quatro abas internas do admin: Para revisar, Conhecimento, Histórico, WhatsApp */}
      <Tabs defaultValue="revisao" variant="outline" radius="md">
        <Tabs.List mb="md">
          <Tabs.Tab
            value="revisao"
            leftSection={<IconListCheck size={16} />}
            rightSection={
              pendingCount > 0 ? (
                <Badge size="xs" color="orange" circle>
                  {pendingCount}
                </Badge>
              ) : undefined
            }
          >
            Para revisar
          </Tabs.Tab>
          <Tabs.Tab value="conhecimento" leftSection={<IconDatabase size={16} />}>
            Conhecimento
          </Tabs.Tab>
          <Tabs.Tab value="historico" leftSection={<IconHistory size={16} />}>
            Histórico
          </Tabs.Tab>
          <Tabs.Tab value="whatsapp" leftSection={<IconBrandWhatsapp size={16} />}>
            WhatsApp
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="revisao">
          <AdminReviewTab />
        </Tabs.Panel>

        <Tabs.Panel value="conhecimento">
          <AdminKnowledgeTab readOnly={false} />
        </Tabs.Panel>

        <Tabs.Panel value="historico">
          <AdminHistoryTab />
        </Tabs.Panel>

        <Tabs.Panel value="whatsapp">
          <AdminWhatsAppTab />
        </Tabs.Panel>
      </Tabs>

      {/* Modal Trocar Senha */}
      <Modal
        opened={modalTrocarSenha}
        onClose={() => setModalTrocarSenha(false)}
        title="Trocar senha de administrador"
        centered
      >
        <form onSubmit={handleTrocarSenha}>
          <Stack gap="sm">
            <PasswordInput
              label="Senha atual"
              placeholder="Digite a senha atual"
              value={trocaSenhaAtual}
              onChange={(e) => setTrocaSenhaAtual(e.currentTarget.value)}
              required
              autoFocus
            />
            <PasswordInput
              label="Nova senha"
              description="Mínimo de 6 caracteres"
              placeholder="Digite a nova senha"
              value={trocaSenhaNova}
              onChange={(e) => setTrocaSenhaNova(e.currentTarget.value)}
              required
            />
            <PasswordInput
              label="Confirme a nova senha"
              placeholder="Repita a nova senha"
              value={trocaSenhaConfirm}
              onChange={(e) => setTrocaSenhaConfirm(e.currentTarget.value)}
              required
            />
            <Group justify="flex-end" mt="md">
              <Button variant="default" onClick={() => setModalTrocarSenha(false)}>
                Cancelar
              </Button>
              <Button
                color="blue"
                type="submit"
                loading={trocarSenhaMutation.isPending}
              >
                Salvar Nova Senha
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}
