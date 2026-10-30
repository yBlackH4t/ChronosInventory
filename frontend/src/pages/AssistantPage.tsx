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
  Alert,
  Box,
  Title,
  Tooltip,
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
import AssistantAdminPanel from "../components/assistant/AssistantAdminPanel";
import SuggestProposalButton from "../components/assistant/SuggestProposalButton";
import AssistantAnswer from "../components/assistant/AssistantAnswer";
import ThinkingIndicator from "../components/assistant/ThinkingIndicator";
import Reveal from "../components/ui/Reveal";
import "../components/assistant/assistantChat.css";
import type { AssistantMessage, AssistantProduct, AssistantResponseMode } from "../types/assistant";

type ChatMessage = AssistantMessage & {
  produtos?: AssistantProduct[];
  modo?: AssistantResponseMode;
  aviso?: string | null;
  fotoUrl?: string | null;
  leitura_foto?: string | null;
  ensinar?: { codigo_a: string; codigo_b: string; pesquisar?: boolean } | null;
};

const SETTINGS_PATH = "/configuracoes#assistant-settings";

export default function AssistantPage() {
  const [activeTab, setActiveTab] = useState<string>("chat");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);
  const generation = useRef(0);
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
    mutationFn: async ({ msg, photo, history }: { msg: string; photo: File | null;
      history: { papel: "usuario" | "assistente"; texto: string }[]; generation: number }) => {
      if (photo) {
        return sendAssistantPhotoMessage(photo, msg, history);
      }
      return sendAssistantMessage({ mensagem: msg, historico: history });
    },
    onSuccess: (data, variables) => {
      if (variables.generation !== generation.current) return;
      setMessages((prev) => [
        ...prev,
        {
          papel: "assistente",
          texto: data.resposta,
          produtos: data.produtos,
          modo: data.modo,
          aviso: data.aviso,
          leitura_foto: data.leitura_foto,
          ensinar: data.ensinar,
        },
      ]);
      setErrorMsg(null);
    },
    onError: (error, variables) => {
      if (variables.generation !== generation.current) return;
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

    if (trimmed.length > 8000) {
      setErrorMsg("A mensagem não pode ter mais que 8000 caracteres.");
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

    mutation.mutate({ msg: trimmed, photo: currentPhoto,
      history: messages.slice(-20).map(message => ({ papel: message.papel, texto: message.texto.slice(-4000) })), generation: generation.current });
  };

  // "Igual / Similar / Diferente" depois de um "não sei": ensina como se a pessoa tivesse digitado.
  const handleTeach = (word: string) => {
    if (mutation.isPending) return;
    setMessages((prev) => [...prev, { papel: "usuario", texto: word }]);
    setErrorMsg(null);
    mutation.mutate({ msg: word, photo: null,
      history: messages.slice(-20).map(message => ({ papel: message.papel, texto: message.texto.slice(-4000) })), generation: generation.current });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const clearChat = () => {
    generation.current += 1;
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
    generation.current += 1;
    setMessages([{ papel: "usuario", texto: suggestion }]);
    setErrorMsg(null);
    mutation.mutate({ msg: suggestion, photo: null, history: [], generation: generation.current });
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages, mutation.isPending]);

  return (
    // Ocupa a altura que sobra abaixo da barra do topo (e do padding de .app-content,
    // 24px + 32px), para a caixa de digitar ficar sempre visivel.
    <Container
      size="lg"
      py="md"
      h="calc(100dvh - var(--app-shell-header-height, 97px) - 56px)"
      display="flex"
      style={{ flexDirection: "column" }}
    >
      <Group justify="space-between" mb="xs">
        <Title order={2} className="page-header-title">
          Assistente de IA
        </Title>
        {activeTab === "chat" && <SuggestProposalButton />}
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
              title="O assistente não respondeu"
              color="danger"
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
                    color="danger"
                    leftSection={<IconSettings size={14} />}
                    onClick={() => navigate(SETTINGS_PATH)}
                  >
                    Ir para Configurações
                  </Button>
                </Box>
              )}
            </Alert>
          )}

          <Paper withBorder p="md" radius="md" className="chat-surface" style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <ScrollArea viewportRef={scrollRef} style={{ flex: 1, paddingRight: "10px" }} offsetScrollbars>
              <Stack gap="md" pb="sm">
                {messages.length === 0 ? (
                  <Stack align="center" mt="xl" gap="md">
                    <span className="ts-orb" aria-hidden="true">
                      <IconMessageChatbot size={30} stroke={1.5} />
                    </span>
                    <Text fw={600}>O que você gostaria de saber?</Text>
                    <Group justify="center" className="ts-suggestions">
                      {suggestions.map((suggestion, idx) => (
                        <Button
                          key={idx}
                          variant="default"
                          size="sm"
                          style={{ animationDelay: `${120 + idx * 70}ms` }}
                          onClick={() => handleSuggestionClick(suggestion)}
                        >
                          {suggestion}
                        </Button>
                      ))}
                    </Group>
                  </Stack>
                ) : (
                  messages.map((msg, idx) => {
                    const isUser = msg.papel === "usuario";
                    if (!isUser) {
                      return (
                        <div key={idx} className="chat-row" data-from="assistente">
                          <span className="chat-avatar" aria-hidden>
                            <IconMessageChatbot size={16} />
                          </span>
                          <AssistantAnswer
                            message={msg}
                            isLast={idx === messages.length - 1}
                            busy={mutation.isPending}
                            onTeach={handleTeach}
                            onOpenSettings={() => navigate(SETTINGS_PATH)}
                          />
                        </div>
                      );
                    }
                    return (
                      <Reveal key={idx} index={0} className="chat-row" style={{ justifyContent: "flex-end" }}>
                        <div className="chat-bubble-user">
                          {msg.fotoUrl && (
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
                          {msg.texto ? (
                            <Text size="sm" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                              {msg.texto}
                            </Text>
                          ) : null}
                        </div>
                      </Reveal>
                    );
                  })
                )}

                {mutation.isPending && (
                  <ThinkingIndicator label={mutation.variables?.photo ? "Lendo a foto…" : "Pensando…"} />
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
                    color="danger"
                    variant="subtle"
                    onClick={handleRemovePhoto}
                    title="Remover foto"
                    aria-label="Remover foto"
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
              <Tooltip label="Nova conversa (apaga esta)">
                <ActionIcon
                  variant="default"
                  size="lg"
                  radius="md"
                  className="action-danger"
                  aria-label="Nova conversa"
                  onClick={clearChat}
                  disabled={messages.length === 0 && !mutation.isPending}
                >
                  <IconTrash size={18} />
                </ActionIcon>
              </Tooltip>
              <Textarea
                placeholder="Digite sua mensagem (Shift+Enter para pular linha)"
                value={input}
                onChange={(e) => setInput(e.currentTarget.value)}
                onKeyDown={handleKeyDown}
                disabled={mutation.isPending}
                minRows={1}
                maxRows={4}
                autosize
                flex={1}
              />
              <ActionIcon
                size="lg"
                radius="md"
                onClick={handleSend}
                aria-label="Enviar mensagem"
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
