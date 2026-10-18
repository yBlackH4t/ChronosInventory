import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Card, Group, Paper, Stack, Switch, Text, Textarea } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconPencilCheck, IconSend, IconTrash } from "@tabler/icons-react";
import dayjs from "dayjs";
import {
  discardWhatsAppDraft,
  listWhatsAppDrafts,
  sendWhatsAppDraft,
  setWhatsAppReview,
} from "../../lib/assistantAdminApi";
import type { WhatsAppDraft } from "../../types/assistantAdmin";

function clientLabel(jid: string) {
  const number = jid.split("@")[0] || jid;
  return number.length > 4 ? `…${number.slice(-4)}` : number;
}

function DraftItem({ draft }: { draft: WhatsAppDraft }) {
  const queryClient = useQueryClient();
  const [text, setText] = useState(draft.texto);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["assistant-admin-whatsapp-drafts"] });

  const send = useMutation({
    mutationFn: () => sendWhatsAppDraft(draft.id, text),
    onSuccess: () => {
      notifications.show({ title: "Enviado", message: `Rascunho #${draft.id} foi para o cliente.`, color: "success" });
      refresh();
    },
    onError: (err: Error) => {
      notifications.show({ title: "Não foi possível enviar", message: err.message, color: "danger" });
      refresh();
    },
  });
  const discard = useMutation({
    mutationFn: () => discardWhatsAppDraft(draft.id),
    onSuccess: refresh,
    onError: refresh,
  });

  return (
    <Paper withBorder p="sm" radius="md">
      <Stack gap="xs">
        <Group justify="space-between">
          <Group gap="xs">
            <Badge variant="light">#{draft.id}</Badge>
            <Text size="xs" c="dimmed">
              Cliente {clientLabel(draft.cliente)} · {dayjs.unix(draft.criado_em).format("DD/MM HH:mm")}
            </Text>
          </Group>
          {text !== draft.texto && (
            <Badge size="xs" color="warning" variant="light">
              editado
            </Badge>
          )}
        </Group>
        <Text size="xs" c="dimmed">
          Pergunta: {draft.pergunta}
        </Text>
        <Textarea autosize minRows={3} maxRows={14} value={text} onChange={(e) => setText(e.currentTarget.value)} />
        <Group justify="flex-end" gap="xs">
          <Button
            size="xs"
            variant="subtle"
            color="danger"
            leftSection={<IconTrash size={14} />}
            loading={discard.isPending}
            onClick={() => discard.mutate()}
          >
            Descartar
          </Button>
          <Button
            size="xs"
            color="success"
            leftSection={<IconSend size={14} />}
            loading={send.isPending}
            disabled={!text.trim()}
            onClick={() => send.mutate()}
          >
            Enviar ao cliente
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}

/**
 * "Revisar antes de enviar": com o modo ligado, a resposta do 🤖 não vai direto para o cliente;
 * fica aqui (e na "Mensagem para mim") para o admin editar, enviar ou descartar.
 */
export default function WhatsAppDraftsCard({ review }: { review: boolean }) {
  const queryClient = useQueryClient();
  const draftsQuery = useQuery({
    queryKey: ["assistant-admin-whatsapp-drafts"],
    queryFn: listWhatsAppDrafts,
    refetchInterval: 5000,
  });
  const reviewMutation = useMutation({
    mutationFn: setWhatsAppReview,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["assistant-admin-whatsapp"] }),
    onError: (err: Error) => notifications.show({ title: "Erro", message: err.message, color: "danger" }),
  });
  const drafts = draftsQuery.data ?? [];

  return (
    <Card withBorder p="md" radius="md" shadow="xs">
      <Group justify="space-between" align="center" mb="sm" wrap="wrap">
        <Group gap="xs">
          <IconPencilCheck size={24} color="var(--mantine-color-success-6)" />
          <div>
            <Text fw={600} size="sm">
              Revisar antes de enviar
            </Text>
            <Text size="xs" c="dimmed">
              A resposta do 🤖 espera aqui até você mandar. Pelo celular: /enviar ou /descartar.
            </Text>
          </div>
        </Group>
        <Switch
          label={review ? "Ligado" : "Desligado"}
          checked={review}
          onChange={(e) => reviewMutation.mutate(e.currentTarget.checked)}
          disabled={reviewMutation.isPending}
        />
      </Group>
      {drafts.length === 0 ? (
        <Text size="xs" c="dimmed">
          {review
            ? "Nenhum rascunho esperando. Reaja com 🤖 numa mensagem de cliente."
            : "Desligado: o robô responde direto ao cliente."}
        </Text>
      ) : (
        <Stack gap="sm">
          {drafts.map((draft) => (
            <DraftItem key={draft.id} draft={draft} />
          ))}
        </Stack>
      )}
    </Card>
  );
}
