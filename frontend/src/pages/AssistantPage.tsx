import React, { useState, useRef, useEffect } from "react";
import {
  Container,
  Paper,
  Stack,
  Group,
  Text,
  Textarea,
  ActionIcon,
  Button,
  ScrollArea,
  Card,
  Badge,
  Alert,
  Loader,
  Box,
  Title,
  Tabs,
} from "@mantine/core";
import { useMutation } from "@tanstack/react-query";
import {
  IconSend,
  IconTrash,
  IconSettings,
  IconAlertCircle,
  IconInfoCircle,
  IconSearch,
  IconMessageChatbot,
  IconShieldLock,
} from "@tabler/icons-react";
import { useNavigate } from "react-router-dom";
import { sendAssistantMessage, AssistantApiError } from "../lib/assistantApi";
import { formatWhatsAppText } from "../lib/assistantFormat";
import AssistantAdminPanel from "../components/assistant/AssistantAdminPanel";
import type { AssistantMessage, AssistantProduct, AssistantResponseMode } from "../types/assistant";

type ChatMessage = AssistantMessage & {
  produtos?: AssistantProduct[];
  modo?: AssistantResponseMode;
  aviso?: string | null;
};

const SETTINGS_PATH = "/configuracoes#assistant-settings";

function ProductCard({ product }: { product: AssistantProduct }) {
  const navigate = useNavigate();

  const handleOpenProduct = () => {
    navigate(`/produtos?q=${encodeURIComponent(product.nome)}`);
  };

  return (
    <Card shadow="sm" p="sm" radius="md" withBorder mt="xs" onClick={handleOpenProduct} style={{ cursor: "pointer" }}>
      <Group justify="space-between" mb="xs">
        <Text fw={500} size="sm" lineClamp={1} style={{ flex: 1 }}>
          {product.nome}
        </Text>
        <Badge color="blue" variant="light">
          Estoque: {product.estoque_total}
        </Badge>
      </Group>

      {Object.entries(product.estoque_por_local).length > 0 && (
        <Group gap="xs">
          {Object.entries(product.estoque_por_local).map(([local, qtde]) => (
            <Badge key={local} color="gray" variant="outline" size="xs">
              {local}: {qtde}
            </Badge>
          ))}
        </Group>
      )}
    </Card>
  );
}

export default function AssistantPage() {
  const [activeTab, setActiveTab] = useState<string>("chat");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (msg: string) => {
      const history = messages.map((m) => ({ papel: m.papel, texto: m.texto }));
      return sendAssistantMessage({ mensagem: msg, historico: history });
    },
    onSuccess: (data) => {
      setMessages((prev) => [
        ...prev,
        { papel: "assistente", texto: data.resposta, produtos: data.produtos, modo: data.modo, aviso: data.aviso },
      ]);
      setErrorMsg(null);
    },
    onError: (error) => {
      if (error instanceof AssistantApiError && error.code === "assistente_indisponivel") {
        setErrorMsg(error.message);
      } else {
        setErrorMsg("Ocorreu um erro inesperado ao se comunicar com o assistente.");
      }
    },
  });

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || mutation.isPending) return;

    if (trimmed.length > 1000) {
      setErrorMsg("A mensagem não pode ter mais que 1000 caracteres.");
      return;
    }

    setMessages((prev) => [...prev, { papel: "usuario", texto: trimmed }]);
    setInput("");
    setErrorMsg(null);
    mutation.mutate(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const clearChat = () => {
    setMessages([]);
    setErrorMsg(null);
  };

  const suggestions = [
    "Temos turbina 4031196?",
    "Temos turbina do Scania 440?",
    "Turbina do Volvo FH 460",
  ];

  const handleSuggestionClick = (suggestion: string) => {
    setMessages([{ papel: "usuario", texto: suggestion }]);
    setErrorMsg(null);
    mutation.mutate(suggestion);
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages, mutation.isPending]);

  return (
    <Container size="lg" py="md" h="calc(100vh - 60px)" display="flex" style={{ flexDirection: "column" }}>
      <Group justify="space-between" mb="xs">
        <Title order={3}>Assistente de IA</Title>
        {activeTab === "chat" && (
          <Button
            variant="light"
            color="red"
            size="xs"
            leftSection={<IconTrash size={14} />}
            onClick={clearChat}
            disabled={messages.length === 0 && !mutation.isPending}
          >
            Nova conversa
          </Button>
        )}
      </Group>

      <Tabs
        value={activeTab}
        onChange={(val) => setActiveTab(val || "chat")}
        style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}
      >
        <Tabs.List mb="sm">
          <Tabs.Tab value="chat" leftSection={<IconMessageChatbot size={16} />}>
            Conversa
          </Tabs.Tab>
          <Tabs.Tab value="admin" leftSection={<IconShieldLock size={16} />}>
            Admin (Especialista)
          </Tabs.Tab>
        </Tabs.List>

        {/* Painel do Chat */}
        <Tabs.Panel
          value="chat"
          style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}
        >
          {errorMsg && (
            <Alert
              icon={<IconAlertCircle size={16} />}
              title="Erro"
              color="red"
              mb="sm"
              withCloseButton
              onClose={() => setErrorMsg(null)}
            >
              {errorMsg}
              {errorMsg.includes("indisponível") && (
                <Box mt="sm">
                  <Button
                    size="xs"
                    variant="outline"
                    color="red"
                    leftSection={<IconSettings size={14} />}
                    onClick={() => navigate(SETTINGS_PATH)}
                  >
                    Ir para Configurações
                  </Button>
                </Box>
              )}
            </Alert>
          )}

          <Paper withBorder p="md" radius="md" style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <ScrollArea viewportRef={scrollRef} style={{ flex: 1, paddingRight: "10px" }} offsetScrollbars>
              <Stack gap="md" pb="sm">
                {messages.length === 0 ? (
                  <Stack align="center" mt="xl" gap="sm">
                    <Text c="dimmed">O que você gostaria de saber?</Text>
                    <Group justify="center">
                      {suggestions.map((suggestion, idx) => (
                        <Button key={idx} variant="default" size="sm" onClick={() => handleSuggestionClick(suggestion)}>
                          {suggestion}
                        </Button>
                      ))}
                    </Group>
                  </Stack>
                ) : (
                  messages.map((msg, idx) => {
                    const isUser = msg.papel === "usuario";
                    return (
                      <Box key={idx} style={{ alignSelf: isUser ? "flex-end" : "flex-start", maxWidth: "80%" }}>
                        <Paper
                          p="sm"
                          radius="md"
                          withBorder
                          bg={isUser ? "blue.6" : "var(--mantine-color-default-hover)"}
                          c={isUser ? "white" : undefined}
                        >
                          <Text size="sm" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                            {formatWhatsAppText(msg.texto)}
                          </Text>
                        </Paper>
                        {!isUser && msg.aviso && (
                          <Stack gap={6} mt={6}>
                            <Group gap={6}>
                              <Badge
                                size="xs"
                                variant="light"
                                color="gray"
                                leftSection={<IconSearch size={10} />}
                                title="Esta resposta veio da busca direta no estoque, sem IA."
                              >
                                Busca direta (sem IA)
                              </Badge>
                            </Group>
                            <Alert
                              variant="light"
                              color="blue"
                              p="xs"
                              radius="md"
                              icon={<IconInfoCircle size={16} />}
                            >
                              <Group justify="space-between" gap="xs" wrap="nowrap">
                                <Text size="xs">{msg.aviso}</Text>
                                <Button
                                  size="compact-xs"
                                  variant="subtle"
                                  leftSection={<IconSettings size={12} />}
                                  onClick={() => navigate(SETTINGS_PATH)}
                                >
                                  Configurações
                                </Button>
                              </Group>
                            </Alert>
                          </Stack>
                        )}
                        {!isUser && msg.produtos && msg.produtos.length > 0 && (
                          <Box mt="xs">
                            {msg.produtos.map((prod) => (
                              <ProductCard key={prod.id} product={prod} />
                            ))}
                          </Box>
                        )}
                      </Box>
                    );
                  })
                )}

                {mutation.isPending && (
                  <Box style={{ alignSelf: "flex-start", maxWidth: "80%" }}>
                    <Group gap="xs" p="sm">
                      <Loader size="sm" type="dots" />
                      <Text size="sm" c="dimmed">
                        Assistente digitando...
                      </Text>
                    </Group>
                  </Box>
                )}
              </Stack>
            </ScrollArea>

            <Group align="flex-end" mt="md">
              <Textarea
                placeholder="Digite sua mensagem (Shift+Enter para pular linha)"
                value={input}
                onChange={(e) => setInput(e.currentTarget.value)}
                onKeyDown={handleKeyDown}
                disabled={mutation.isPending}
                minRows={1}
                maxRows={4}
                autosize
                style={{ flex: 1 }}
              />
              <ActionIcon
                color="blue"
                size="lg"
                radius="md"
                onClick={handleSend}
                disabled={mutation.isPending || !input.trim()}
              >
                <IconSend size={18} />
              </ActionIcon>
            </Group>
          </Paper>
        </Tabs.Panel>

        {/* Painel do Admin */}
        <Tabs.Panel value="admin" style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
          <AssistantAdminPanel />
        </Tabs.Panel>
      </Tabs>
    </Container>
  );
}
