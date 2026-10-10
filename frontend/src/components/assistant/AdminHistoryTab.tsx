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
  Textarea,
  Paper,
  Box,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconAlertCircle,
  IconDownload,
  IconEdit,
  IconChevronLeft,
  IconChevronRight,
  IconMessages,
  IconBrandWhatsapp,
  IconDeviceDesktop,
  IconCheck,
} from "@tabler/icons-react";
import {
  listHistory,
  correctConversation,
  exportHistoryJsonl,
} from "../../lib/assistantAdminApi";
import { formatWhatsAppText } from "../../lib/assistantFormat";
import { downloadBlob } from "../../lib/download";
import type { Conversation } from "../../types/assistantAdmin";

const PAGE_SIZE = 20;

export default function AdminHistoryTab() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(0);
  const [exporting, setExporting] = useState(false);

  // Modal para corrigir resposta
  const [modalCorrecao, setModalCorrecao] = useState<{
    opened: boolean;
    conversaId: number;
    respostaCorreta: string;
    observacao: string;
  }>({
    opened: false,
    conversaId: 0,
    respostaCorreta: "",
    observacao: "",
  });

  const offset = page * PAGE_SIZE;

  const {
    data: items,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["assistant-admin-history", PAGE_SIZE, offset],
    queryFn: () => listHistory(PAGE_SIZE, offset),
  });

  const correctMutation = useMutation({
    mutationFn: ({
      id,
      resposta_correta,
      observacao,
    }: {
      id: number;
      resposta_correta: string;
      observacao?: string;
    }) => correctConversation(id, { resposta_correta, observacao }),
    onSuccess: () => {
      notifications.show({
        title: "Correção salva",
        message: "A resposta correta do especialista foi registrada.",
        color: "green",
      });
      setModalCorrecao((prev) => ({ ...prev, opened: false }));
      queryClient.invalidateQueries({ queryKey: ["assistant-admin-history"] });
    },
    onError: (err: Error) => {
      notifications.show({
        title: "Erro ao salvar correção",
        message: err.message || "Não foi possível registrar a correção.",
        color: "red",
      });
    },
  });

  const handleExportJsonl = async () => {
    try {
      setExporting(true);
      const blob = await exportHistoryJsonl();
      downloadBlob(blob, "assistente_historico.jsonl");
      notifications.show({
        title: "Exportação concluída",
        message: "Arquivo assistente_historico.jsonl baixado com sucesso.",
        color: "blue",
      });
    } catch (err: unknown) {
      notifications.show({
        title: "Erro ao exportar",
        message: err instanceof Error ? err.message : "Falha ao baixar o histórico.",
        color: "red",
      });
    } finally {
      setExporting(false);
    }
  };

  const handleOpenCorrection = (conv: Conversation) => {
    setModalCorrecao({
      opened: true,
      conversaId: conv.id,
      respostaCorreta: conv.resposta_correta || conv.resposta,
      observacao: conv.observacao_admin || "",
    });
  };

  const handleSaveCorrection = () => {
    if (!modalCorrecao.respostaCorreta.trim()) {
      notifications.show({
        title: "Campo obrigatório",
        message: "Informe o texto da resposta correta.",
        color: "orange",
      });
      return;
    }
    correctMutation.mutate({
      id: modalCorrecao.conversaId,
      resposta_correta: modalCorrecao.respostaCorreta.trim(),
      observacao: modalCorrecao.observacao.trim() || undefined,
    });
  };

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Text size="sm" c="dimmed">
          Histórico das perguntas respondidas pelo assistente no App e no WhatsApp.
        </Text>
        <Button
          leftSection={<IconDownload size={16} />}
          variant="light"
          color="blue"
          onClick={handleExportJsonl}
          loading={exporting}
        >
          Exportar JSONL
        </Button>
      </Group>

      {isLoading && (
        <Card withBorder p="xl" radius="md">
          <Group justify="center" gap="sm">
            <Loader size="sm" />
            <Text size="sm" c="dimmed">
              Carregando histórico de conversas...
            </Text>
          </Group>
        </Card>
      )}

      {isError && (
        <Alert
          icon={<IconAlertCircle size={16} />}
          title="Erro ao carregar histórico"
          color="red"
        >
          <Group justify="space-between">
            <Text size="sm">{error instanceof Error ? error.message : "Erro desconhecido"}</Text>
            <Button size="xs" variant="outline" color="red" onClick={() => refetch()}>
              Tentar novamente
            </Button>
          </Group>
        </Alert>
      )}

      {!isLoading && !isError && items && items.length === 0 && (
        <Card withBorder p="xl" radius="md" ta="center">
          <Stack align="center" gap="xs">
            <IconMessages size={36} color="var(--mantine-color-gray-5)" />
            <Text fw={500}>Nenhuma conversa registrada</Text>
            <Text size="sm" c="dimmed">
              {page > 0
                ? "Não há mais conversas nesta página."
                : "Ainda não foram realizadas perguntas no assistente."}
            </Text>
          </Stack>
        </Card>
      )}

      {!isLoading && !isError && items && items.length > 0 && (
        <Stack gap="sm">
          {items.map((conv: Conversation) => {
            const dataFormatada = conv.data
              ? new Date(conv.data).toLocaleString("pt-BR")
              : "—";

            return (
              <Card key={conv.id} withBorder radius="md" p="md" shadow="xs">
                <Group justify="space-between" mb="xs" wrap="wrap">
                  <Group gap="xs">
                    <Badge
                      variant="light"
                      color={conv.canal === "whatsapp" ? "teal" : "blue"}
                      leftSection={
                        conv.canal === "whatsapp" ? (
                          <IconBrandWhatsapp size={12} />
                        ) : (
                          <IconDeviceDesktop size={12} />
                        )
                      }
                    >
                      {conv.canal === "whatsapp" ? "WhatsApp" : "App"}
                    </Badge>

                    {conv.autor && (
                      <Badge variant="outline" color="gray">
                        {conv.autor}
                      </Badge>
                    )}

                    <Badge
                      variant="dot"
                      color={conv.modo === "ia" ? "violet" : "gray"}
                    >
                      {conv.modo === "ia" ? "IA" : "Busca direta"}
                    </Badge>

                    <Text size="xs" c="dimmed">
                      {dataFormatada}
                    </Text>
                  </Group>

                  <Button
                    size="xs"
                    variant={conv.resposta_correta ? "light" : "subtle"}
                    color={conv.resposta_correta ? "teal" : "blue"}
                    leftSection={
                      conv.resposta_correta ? (
                        <IconCheck size={14} />
                      ) : (
                        <IconEdit size={14} />
                      )
                    }
                    onClick={() => handleOpenCorrection(conv)}
                  >
                    {conv.resposta_correta ? "Correção salva" : "Corrigir resposta"}
                  </Button>
                </Group>

                {/* Pergunta */}
                <Box mb="xs">
                  <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                    Pergunta:
                  </Text>
                  <Text size="sm" fw={500} mt={2}>
                    {conv.pergunta}
                  </Text>
                </Box>

                {/* Resposta original */}
                <Paper
                  withBorder
                  p="xs"
                  radius="sm"
                  bg="var(--mantine-color-default-hover)"
                  mb="xs"
                >
                  <Text size="xs" fw={700} c="dimmed" tt="uppercase" mb={4}>
                    Resposta enviada:
                  </Text>
                  <Text size="sm" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                    {formatWhatsAppText(conv.resposta)}
                  </Text>
                </Paper>

                {/* Se tiver aviso */}
                {conv.aviso && (
                  <Alert color="blue" variant="light" p="xs" mb="xs">
                    <Text size="xs">{conv.aviso}</Text>
                  </Alert>
                )}

                {/* Códigos pesquisados sem estoque */}
                {conv.codigos_sem_estoque && conv.codigos_sem_estoque.length > 0 && (
                  <Group gap={6} mb="xs">
                    <Text size="xs" c="dimmed">
                      Códigos sem estoque pesquisados:
                    </Text>
                    {conv.codigos_sem_estoque.map((cod) => (
                      <Badge key={cod} size="xs" color="orange" variant="outline">
                        {cod}
                      </Badge>
                    ))}
                  </Group>
                )}

                {/* Correção do especialista salva */}
                {conv.resposta_correta && (
                  <Paper
                    withBorder
                    p="xs"
                    radius="sm"
                    bg="var(--mantine-color-green-light)"
                    style={{ borderColor: "var(--mantine-color-green-light-border)" }}
                  >
                    <Group justify="space-between" mb={2}>
                      <Text size="xs" fw={700} c="var(--mantine-color-green-light-color)" tt="uppercase">
                        Gabarito / Resposta correta do Especialista:
                      </Text>
                    </Group>
                    <Text size="sm" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                      {formatWhatsAppText(conv.resposta_correta)}
                    </Text>
                    {conv.observacao_admin && (
                      <Text size="xs" c="dimmed" mt={4}>
                        Obs do especialista: {conv.observacao_admin}
                      </Text>
                    )}
                  </Paper>
                )}
              </Card>
            );
          })}

          {/* Paginação */}
          <Group justify="space-between" mt="md">
            <Button
              size="xs"
              variant="default"
              leftSection={<IconChevronLeft size={14} />}
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Anterior
            </Button>
            <Text size="xs" c="dimmed">
              Página {page + 1}
            </Text>
            <Button
              size="xs"
              variant="default"
              rightSection={<IconChevronRight size={14} />}
              disabled={!items || items.length < PAGE_SIZE}
              onClick={() => setPage((p) => p + 1)}
            >
              Próxima
            </Button>
          </Group>
        </Stack>
      )}

      {/* Modal Corrigir Resposta */}
      <Modal
        opened={modalCorrecao.opened}
        onClose={() => setModalCorrecao((prev) => ({ ...prev, opened: false }))}
        title="Corrigir resposta da conversa"
        centered
        size="lg"
      >
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            Esta correção serve como gabarito para treinar e refinar o assistente.
          </Text>
          <Textarea
            label="Resposta correta do especialista"
            description="Use *negrito* para destacar nomes e códigos"
            placeholder="Digite a resposta correta e ideal..."
            value={modalCorrecao.respostaCorreta}
            onChange={(e) => {
              const value = e.currentTarget.value;
              setModalCorrecao((prev) => ({
                ...prev,
                respostaCorreta: value,
              }));
            }}
            minRows={4}
            autosize
            required
            autoFocus
          />
          <Textarea
            label="Observação interna (opcional)"
            placeholder="Ex.: a IA não percebeu que o código 4031196 aplica tanto em Scania quanto em Volvo"
            value={modalCorrecao.observacao}
            onChange={(e) => {
              const value = e.currentTarget.value;
              setModalCorrecao((prev) => ({
                ...prev,
                observacao: value,
              }));
            }}
            rows={2}
          />
          <Group justify="flex-end" mt="md">
            <Button
              variant="default"
              onClick={() => setModalCorrecao((prev) => ({ ...prev, opened: false }))}
            >
              Cancelar
            </Button>
            <Button
              color="teal"
              onClick={handleSaveCorrection}
              loading={correctMutation.isPending}
            >
              Salvar Correção
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
