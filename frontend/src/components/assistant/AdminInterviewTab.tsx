import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  NumberInput,
  Progress,
  Stack,
  Switch,
  Text,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconAlertCircle,
  IconBrandWhatsapp,
  IconCheck,
  IconHelpCircle,
  IconPlus,
  IconSparkles,
} from "@tabler/icons-react";
import {
  answerInterviewQuestion,
  getInterviewDay,
  moreInterviewQuestions,
  updateInterviewSettings,
} from "../../lib/assistantAdminApi";
import type { InterviewKind, InterviewQuestion, InterviewSettings } from "../../types/assistantAdmin";
import { ASSISTANT_UNREACHABLE_MESSAGE } from "../../lib/notify";
import Reveal from "../ui/Reveal";

const QUERY_KEY = ["assistant-interview"];

const KIND_LABEL: Record<InterviewKind, { label: string; color: string }> = {
  revisar: { label: "Não soube responder", color: "warning" },
  revisar_par: { label: "Não soube responder", color: "warning" },
  ficha: { label: "Mesma ficha Master Power", color: "info" },
  cadastro: { label: "Cadastro junta os dois", color: "grape" },
  aplicacao: { label: "Aplicação do catálogo", color: "teal" },
};

const ANSWER_COLOR: Record<string, string> = {
  igual: "success",
  similar: "warning",
  diferente: "danger",
  sim: "success",
  nao: "danger",
  nao_temos: "gray",
  nao_sei: "gray",
};

/** "*4031196* e *5455609*" -> códigos em negrito, como no WhatsApp. */
function WhatsAppText({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*[^*]+\*)/g).map((part, index) =>
        part.startsWith("*") && part.endsWith("*") && part.length > 2 ? (
          <strong key={index}>{part.slice(1, -1)}</strong>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </>
  );
}

export default function AdminInterviewTab() {
  const queryClient = useQueryClient();
  const day = useQuery({ queryKey: QUERY_KEY, queryFn: getInterviewDay });

  const more = useMutation({
    mutationFn: moreInterviewQuestions,
    onSuccess: (data) => queryClient.setQueryData(QUERY_KEY, data),
    onError: (error: Error) => notifications.show({ title: "Não consegui buscar mais", message: error.message, color: "red" }),
  });

  if (day.isLoading) {
    return (
      <Group justify="center" p="xl">
        <Loader size="sm" />
        <Text c="dimmed">Escolhendo as perguntas de hoje...</Text>
      </Group>
    );
  }
  if (day.isError || !day.data) {
    return (
      <Alert color="danger" icon={<IconAlertCircle size={16} />}>
        {day.error instanceof Error && day.error.message ? day.error.message : ASSISTANT_UNREACHABLE_MESSAGE}
      </Alert>
    );
  }

  const questions = day.data.perguntas;
  const answered = questions.filter((q) => q.estado !== "pendente").length;
  const percent = questions.length ? Math.round((answered / questions.length) * 100) : 0;

  return (
    <Stack gap="md">
      <Card withBorder radius="md" p="md" className="interview-hero">
        <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
          <div style={{ flex: 1, minWidth: 260 }}>
            <Group gap="xs" mb={4}>
              <IconSparkles size={18} color="var(--accent)" />
              <Text fw={700}>Me ajude a aprender</Text>
            </Group>
            <Text size="sm" c="dimmed">
              Todo dia eu escolho o que ainda não sei: o que perguntaram e não soube responder, peças com
              estoque que o catálogo junta e aplicações que podem estar erradas. Cada resposta vira
              conhecimento para todos os computadores. O saldo continua vindo do estoque.
            </Text>
          </div>
          <Stack gap={4} style={{ minWidth: 200 }}>
            <Text size="sm" fw={600}>
              {answered} de {questions.length} respondidas
            </Text>
            <Progress value={percent} color={percent === 100 ? "success" : undefined} radius="xl" size="lg" animated={percent < 100} />
          </Stack>
        </Group>
      </Card>

      {questions.length === 0 && (
        <Alert color="success" icon={<IconCheck size={16} />}>
          Não tenho dúvidas hoje. Quando alguém perguntar algo que eu não sei, ela aparece aqui.
        </Alert>
      )}

      {questions.map((question, index) => (
        <Reveal key={question.id} index={index}>
          <QuestionCard question={question} />
        </Reveal>
      ))}

      <Group justify="space-between" wrap="wrap">
        <Button
          variant="light"
          leftSection={<IconPlus size={16} />}
          onClick={() => more.mutate()}
          loading={more.isPending}
          disabled={answered < questions.length}
        >
          Mais perguntas
        </Button>
        {answered < questions.length && (
          <Text size="xs" c="dimmed">
            Responda as de hoje para liberar mais.
          </Text>
        )}
      </Group>

      <WhatsAppSettings settings={day.data.config} />
    </Stack>
  );
}

function QuestionCard({ question }: { question: InterviewQuestion }) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const [code, setCode] = useState("");
  const kind = KIND_LABEL[question.tipo];
  const needsCode = question.tipo === "revisar";
  const done = question.estado === "respondida" || question.estado === "nao_sei";

  const answer = useMutation({
    mutationFn: (resposta: string) =>
      answerInterviewQuestion(question.id, {
        resposta,
        observacao: note.trim() || null,
        codigo: code.trim() || null,
      }),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ["assistant-admin-knowledge"] });
      queryClient.invalidateQueries({ queryKey: ["assistant-admin-review"] });
      if (updated.resultado) notifications.show({ message: updated.resultado.replace(/\*/g, ""), color: "teal" });
    },
    onError: (error: Error) => notifications.show({ title: "Não consegui guardar", message: error.message, color: "red" }),
  });

  return (
    <Card
      withBorder
      radius="md"
      p="md"
      shadow="xs"
      className={`interview-card${done ? " interview-card--done" : ""}`}
    >
      <Group gap="xs" mb={6} wrap="wrap">
        <Badge circle size="lg" variant={done ? "light" : "filled"} color={done ? "success" : undefined}>
          {done ? <IconCheck size={14} /> : question.numero}
        </Badge>
        <Badge variant="light" color={kind.color}>
          {kind.label}
        </Badge>
        {question.estado === "aguardando" && (
          <Badge variant="outline" color="success" leftSection={<IconBrandWhatsapp size={12} />}>
            Respondida no WhatsApp: {question.resposta}
          </Badge>
        )}
      </Group>

      <Text fw={600} size="lg" mb={4}>
        <WhatsAppText text={question.pergunta} />
      </Text>
      {question.motivo && (
        <Text size="sm" c="dimmed" mb="sm">
          {question.motivo}
        </Text>
      )}

      {done ? (
        <Group gap="xs">
          <Badge color={ANSWER_COLOR[question.resposta ?? ""] ?? "gray"} variant="light">
            {question.opcoes.find((o) => o.valor === question.resposta)?.rotulo ?? question.resposta}
            {question.codigo_resposta ? ` ${question.codigo_resposta}` : ""}
          </Badge>
          {question.observacao && <Text size="sm">{question.observacao}</Text>}
          {question.resultado && (
            <Text size="xs" c="dimmed">
              <WhatsAppText text={question.resultado} />
            </Text>
          )}
        </Group>
      ) : (
        <Stack gap="xs">
          {question.tipo !== "aplicacao" && (
            <Group gap="xs" grow wrap="wrap">
              {needsCode && (
                <TextInput
                  size="xs"
                  label="Código que serve"
                  placeholder="ex.: 4031196"
                  value={code}
                  onChange={(e) => setCode(e.currentTarget.value)}
                />
              )}
              <TextInput
                size="xs"
                label="Observação (opcional)"
                placeholder="ex.: muda o atuador"
                value={note}
                onChange={(e) => setNote(e.currentTarget.value)}
              />
            </Group>
          )}
          <Group gap="xs" wrap="wrap">
            {question.opcoes.map((option) => {
              const unsure = option.valor === "nao_sei";
              const blocked = needsCode && (option.valor === "igual" || option.valor === "similar") && !code.trim();
              return (
                <Button
                  key={option.valor}
                  size="sm"
                  variant={unsure ? "subtle" : "light"}
                  color={ANSWER_COLOR[option.valor]}
                  leftSection={unsure ? <IconHelpCircle size={14} /> : undefined}
                  disabled={blocked || (answer.isPending && answer.variables !== option.valor)}
                  loading={answer.isPending && answer.variables === option.valor}
                  onClick={() => answer.mutate(option.valor)}
                >
                  {option.rotulo}
                </Button>
              );
            })}
          </Group>
        </Stack>
      )}
    </Card>
  );
}

function WhatsAppSettings({ settings }: { settings: InterviewSettings }) {
  const queryClient = useQueryClient();
  const [hour, setHour] = useState(settings.hora);
  const save = useMutation({
    mutationFn: updateInterviewSettings,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
    onError: (error: Error) => notifications.show({ title: "Não consegui salvar", message: error.message, color: "red" }),
  });

  return (
    <Card withBorder radius="md" p="md">
      <Group gap="xs" mb="xs">
        <IconBrandWhatsapp size={18} color="var(--mantine-color-success-6)" />
        <Text fw={600}>No WhatsApp</Text>
      </Group>
      <Text size="sm" c="dimmed" mb="sm">
        As mesmas perguntas chegam na conversa "Mensagem para mim", só no computador principal. Responda
        com <code>/r 1 igual</code> e, no fim, <code>/confirmar</code> com o seu PIN: só então vira conhecimento.
      </Text>
      <Group gap="md" align="flex-end" wrap="wrap">
        <Switch
          label="Mandar todo dia"
          checked={settings.ativo}
          onChange={(e) => save.mutate({ ativo: e.currentTarget.checked })}
        />
        <TextInput
          size="xs"
          label="Hora"
          value={hour}
          w={90}
          onChange={(e) => setHour(e.currentTarget.value)}
          onBlur={() => hour !== settings.hora && save.mutate({ hora: hour })}
        />
        <NumberInput
          size="xs"
          label="Perguntas por dia"
          min={1}
          max={10}
          w={140}
          value={settings.quantidade}
          onChange={(value) => typeof value === "number" && value !== settings.quantidade && save.mutate({ quantidade: value })}
        />
      </Group>
    </Card>
  );
}
