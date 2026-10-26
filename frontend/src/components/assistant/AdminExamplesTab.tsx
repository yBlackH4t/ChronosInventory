import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Group, Paper, Stack, Text, Textarea } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { listInterpretationExamples, saveInterpretationExamples } from "../../lib/assistantAdminApi";

export default function AdminExamplesTab() {
  const queryClient = useQueryClient();
  const examples = useQuery({ queryKey: ["assistant-examples"], queryFn: listInterpretationExamples });
  const [question, setQuestion] = useState("");
  const [query, setQuery] = useState("");
  const save = useMutation({
    mutationFn: saveInterpretationExamples,
    onSuccess: () => {
      setQuestion(""); setQuery("");
      queryClient.invalidateQueries({ queryKey: ["assistant-examples"] });
      notifications.show({ title: "Exemplos aprovados", message: "Salvos e enviados para sincronização.", color: "teal" });
    },
    onError: (error: Error) => notifications.show({ title: "Não foi possível salvar", message: error.message, color: "red" }),
  });
  const items = examples.data ?? [];
  return <Stack>
    <Alert title="Ensinar interpretação, nunca estoque">
      Cadastre como a equipe fala e a consulta correta. Ex.: “a baleia” → “turbina Scania 440 DC13 Euro 5”.
      O saldo é sempre consultado novamente no banco. Não escreva respostas como “temos duas”.
      Correções do histórico não são aprendidas automaticamente. Mudanças aqui não exigem reinstalação.
    </Alert>
    {examples.isError && <Text c="red">Não foi possível carregar os exemplos.</Text>}
    <Textarea label="Como a equipe pergunta" value={question} maxLength={1000} onChange={event => setQuestion(event.currentTarget.value)} />
    <Textarea label="Consulta correta (não a resposta)" value={query} maxLength={1000} onChange={event => setQuery(event.currentTarget.value)} />
    <Button loading={save.isPending} disabled={!question.trim() || !query.trim() || !examples.isSuccess}
      onClick={() => save.mutate([...items.filter(item => item.pergunta !== question.trim()), { pergunta: question.trim(), consulta: query.trim() }])}>
      Aprovar exemplo
    </Button>
    {items.map((item, index) => <Paper withBorder p="sm" key={item.pergunta}>
      <Group justify="space-between" wrap="nowrap">
        <div><Text size="sm">{item.pergunta}</Text><Text size="xs" c="dimmed">Consulta: {item.consulta}</Text></div>
        <Button size="xs" color="red" variant="subtle" disabled={save.isPending}
          onClick={() => save.mutate(items.filter((_, itemIndex) => itemIndex !== index))}>Remover</Button>
      </Group>
    </Paper>)}
  </Stack>;
}
