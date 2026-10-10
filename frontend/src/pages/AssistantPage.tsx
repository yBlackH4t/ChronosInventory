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
} from "@mantine/core";
import { useMutation } from "@tanstack/react-query";
import { IconSend, IconTrash, IconSettings, IconAlertCircle } from "@tabler/icons-react";
import { useNavigate } from "react-router-dom";
import { sendAssistantMessage, AssistantApiError } from "../lib/assistantApi";
import type { AssistantMessage, AssistantProduct } from "../types/assistant";

function formatWhatsAppText(text: string) {
  const lines = text.split("\n");
  return lines.map((line, i) => (
    <React.Fragment key={i}>
      {line.split(/(\*[^*]+\*)/g).map((part, j) => {
        if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
          return <strong key={j}>{part.slice(1, -1)}</strong>;
        }
        return <span key={j}>{part}</span>;
      })}
      {i < lines.length - 1 && <br />}
    </React.Fragment>
  ));
}

function ProductCard({ product }: { product: AssistantProduct }) {
  const navigate = useNavigate();

  const handleOpenProduct = () => {
    // Navigate to products page with search or id if possible.
    // The requirement says: "abrem o produto na tela de Produtos"
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
  const [messages, setMessages] = useState<(AssistantMessage & { produtos?: AssistantProduct[] })[]>([]);
  const [input, setInput] = useState("");
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (msg: string) => {
      // The API expects 'historico' without 'produtos' if we send it back, but let's map it safely.
      const history = messages.map(m => ({ papel: m.papel, texto: m.texto }));
      return sendAssistantMessage({ mensagem: msg, historico: history });
    },
    onSuccess: (data) => {
      setMessages((prev) => [
        ...prev,
        { papel: "assistente", texto: data.resposta, produtos: data.produtos },
      ]);
      setErrorMsg(null);
    },
    onError: (error) => {
      if (error instanceof AssistantApiError && error.code === "assistente_indisponivel") {
        setErrorMsg(error.message);
      } else {
        setErrorMsg("Ocorreu um erro inesperado ao se comunicar com o assistente.");
      }
      // Remove the last user message if it failed? Or keep it? We'll keep it so the user can read it.
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
    <Container size="md" py="md" h="calc(100vh - 60px)" display="flex" style={{ flexDirection: "column" }}>
      <Group justify="space-between" mb="md">
        <Title order={3}>Assistente de IA</Title>
        <Button
          variant="light"
          color="red"
          leftSection={<IconTrash size={16} />}
          onClick={clearChat}
          disabled={messages.length === 0 && !mutation.isPending}
        >
          Nova conversa
        </Button>
      </Group>

      {errorMsg && (
        <Alert
          icon={<IconAlertCircle size={16} />}
          title="Erro"
          color="red"
          mb="md"
          withCloseButton
          onClose={() => setErrorMsg(null)}
        >
          {errorMsg}
          {errorMsg.includes("indisponível") && (
            <Box mt="sm">
              <Button size="xs" variant="outline" color="red" leftSection={<IconSettings size={14} />} onClick={() => navigate("/configuracoes#assistant-settings")}>
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
                      bg={isUser ? "blue.6" : "gray.0"}
                      c={isUser ? "white" : "black"}
                    >
                      <Text size="sm" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                        {formatWhatsAppText(msg.texto)}
                      </Text>
                    </Paper>
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
                  <Text size="sm" c="dimmed">Assistente digitando...</Text>
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
    </Container>
  );
}
