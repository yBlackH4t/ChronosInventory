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
  FileButton,
  Image,
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
  IconCamera,
  IconX,
} from "@tabler/icons-react";
import { useNavigate } from "react-router-dom";
import {
  sendAssistantMessage,
  sendAssistantPhotoMessage,
  AssistantApiError,
} from "../lib/assistantApi";
import { formatWhatsAppText } from "../lib/assistantFormat";
import AssistantAdminPanel from "../components/assistant/AssistantAdminPanel";
import type { AssistantMessage, AssistantProduct, AssistantResponseMode } from "../types/assistant";

type ChatMessage = AssistantMessage & {
  produtos?: AssistantProduct[];
  modo?: AssistantResponseMode;
  aviso?: string | null;
  fotoUrl?: string | null;
  leitura_foto?: string | null;
};

const SETTINGS_PATH = "/configuracoes#assistant-settings";

function ProductCard({ product }: { product: AssistantProduct }) {
  const navigate = useNavigate();

  const handleOpenProduct = () => {
    navigate(
      `/produtos?search=${encodeURIComponent(product.nome)}&openId=${product.id}`,
    );
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
  const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handlePhotoSelect = (file: File | null) => {
    if (!file) return;
    if (photoPreview) {
      URL.revokeObjectURL(photoPreview);
    }
    setSelectedPhoto(file);
    setPhotoPreview(URL.createObjectURL(file));
    setErrorMsg(null);
  };

  const handleRemovePhoto = () => {
    if (photoPreview) {
      URL.revokeObjectURL(photoPreview);
    }
    setSelectedPhoto(null);
    setPhotoPreview(null);
  };

  const mutation = useMutation({
    mutationFn: async ({ msg, photo }: { msg: string; photo: File | null }) => {
      const history = messages.map((m) => ({ papel: m.papel, texto: m.texto }));
      if (photo) {
        return sendAssistantPhotoMessage(photo, msg, history);
      }
      return sendAssistantMessage({ mensagem: msg, historico: history });
    },
    onSuccess: (data) => {
      setMessages((prev) => [
        ...prev,
        {
          papel: "assistente",
          texto: data.resposta,
          produtos: data.produtos,
          modo: data.modo,
          aviso: data.aviso,
          leitura_foto: data.leitura_foto,
        },
      ]);
      setErrorMsg(null);
    },
    onError: (error) => {
      if (error instanceof AssistantApiError) {
        setErrorMsg(error.message);
      } else {
        setErrorMsg("Ocorreu um erro inesperado ao se comunicar com o assistente.");
      }
    },
  });

  const handleSend = () => {
    const trimmed = input.trim();
    if ((!trimmed && !selectedPhoto) || mutation.isPending) return;

    if (trimmed.length > 1000) {
      setErrorMsg("A mensagem não pode ter mais que 1000 caracteres.");
      return;
    }

    const currentPhoto = selectedPhoto;
    const currentPreview = photoPreview;

    setMessages((prev) => [
      ...prev,
      {
        papel: "usuario",
        texto: trimmed || (currentPhoto ? "Foto da plaqueta" : ""),
        fotoUrl: currentPreview,
      },
    ]);

    setInput("");
    setSelectedPhoto(null);
    setPhotoPreview(null);
    setErrorMsg(null);

    mutation.mutate({ msg: trimmed, photo: currentPhoto });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const clearChat = () => {
    handleRemovePhoto();
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
    mutation.mutate({ msg: suggestion, photo: null });
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
                          {isUser && msg.fotoUrl && (
                            <Box mb={msg.texto ? "xs" : 0}>
                              <Image
                                src={msg.fotoUrl}
                                alt="Foto da plaqueta"
                                radius="sm"
                                mah={160}
                                maw={240}
                                fit="cover"
                              />
                            </Box>
                          )}
                          {!isUser && msg.leitura_foto && (
                            <Group gap={6} mb={6}>
                              <IconCamera size={13} style={{ opacity: 0.7 }} />
                              <Text size="xs" c="dimmed" fw={500}>
                                {msg.leitura_foto}
                              </Text>
                            </Group>
                          )}
                          {msg.texto ? (
                            <Text size="sm" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                              {formatWhatsAppText(msg.texto)}
                            </Text>
                          ) : null}
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
                        {mutation.variables?.photo ? "Lendo a foto…" : "Assistente digitando..."}
                      </Text>
                    </Group>
                  </Box>
                )}
              </Stack>
            </ScrollArea>

            {photoPreview && (
              <Paper withBorder p="xs" radius="md" mt="xs" bg="var(--mantine-color-default-hover)">
                <Group justify="space-between" align="center">
                  <Group gap="xs">
                    <Image
                      src={photoPreview}
                      alt="Prévia da plaqueta"
                      w={48}
                      h={48}
                      radius="sm"
                      fit="cover"
                    />
                    <div>
                      <Text size="xs" fw={500} lineClamp={1}>
                        {selectedPhoto?.name || "Foto da plaqueta"}
                      </Text>
                      <Text size="xs" c="dimmed">
                        Foto pronta para envio
                      </Text>
                    </div>
                  </Group>
                  <ActionIcon
                    size="sm"
                    color="red"
                    variant="subtle"
                    onClick={handleRemovePhoto}
                    title="Remover foto"
                  >
                    <IconX size={16} />
                  </ActionIcon>
                </Group>
              </Paper>
            )}

            <Group align="flex-end" mt="md" gap="xs">
              <FileButton
                onChange={handlePhotoSelect}
                accept="image/*"
                disabled={mutation.isPending}
              >
                {(props) => (
                  <ActionIcon
                    {...props}
                    variant="default"
                    size="lg"
                    radius="md"
                    title="Enviar foto da plaqueta"
                    aria-label="Foto da plaqueta"
                  >
                    <IconCamera size={18} />
                  </ActionIcon>
                )}
              </FileButton>
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
                disabled={mutation.isPending || (!input.trim() && !selectedPhoto)}
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
