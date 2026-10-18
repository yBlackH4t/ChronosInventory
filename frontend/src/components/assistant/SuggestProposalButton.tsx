import { useState } from "react";
import { Alert, Button, Group, Modal, Select, Stack, Text, TextInput, Textarea } from "@mantine/core";
import { IconBulb } from "@tabler/icons-react";
import { useMutation } from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import { suggestProposal, type ProposalSuggestion } from "../../lib/assistantApi";

const AUTHOR_KEY = "chronos.assistant.suggestAuthor";

function savedAuthor(): string {
  try {
    return localStorage.getItem(AUTHOR_KEY) || "";
  } catch {
    return "";
  }
}

const EMPTY: ProposalSuggestion = { codigo_a: "", codigo_b: "", tipo: "igual", observacao: "", autor: "" };

/**
 * "Sugerir ao admin": um colega propõe "A é igual/similar/diferente de B" pelo Chronos do PC dele.
 * A sugestão chega em Assistente > Admin > Para revisar na máquina que publica a base, e só vale
 * depois que o admin aprova.
 */
export default function SuggestProposalButton() {
  const [opened, setOpened] = useState(false);
  const [form, setForm] = useState<ProposalSuggestion>(EMPTY);

  const mutation = useMutation({
    mutationFn: suggestProposal,
    onSuccess: (result) => {
      try {
        localStorage.setItem(AUTHOR_KEY, form.autor || "");
      } catch {
        // so uma conveniencia
      }
      notifications.show({
        title: "Sugestão enviada",
        message:
          result.destino === "publicadora"
            ? "Chegou na máquina que publica a base. O admin aprova em Assistente > Admin > Para revisar."
            : "Ficou nesta máquina, em Assistente > Admin > Para revisar, esperando o admin aprovar.",
        color: "success",
      });
      setOpened(false);
    },
    onError: (err: Error) =>
      notifications.show({
        title: "Não foi possível enviar",
        message: err.message || "Tente de novo.",
        color: "danger",
      }),
  });

  const open = () => {
    setForm({ ...EMPTY, autor: savedAuthor() });
    setOpened(true);
  };
  const update = (patch: Partial<ProposalSuggestion>) => setForm((prev) => ({ ...prev, ...patch }));

  return (
    <>
      <Button variant="light" size="xs" leftSection={<IconBulb size={14} />} onClick={open}>
        Sugerir ao admin
      </Button>
      <Modal opened={opened} onClose={() => setOpened(false)} title="Sugerir ao admin" centered>
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            Sabe que duas peças são iguais (ou que uma não serve)? Mande para o admin aprovar. Só vale
            depois da aprovação.
          </Text>
          <TextInput
            label="Código"
            placeholder="Ex.: 53279887101"
            value={form.codigo_a}
            onChange={(e) => {
              const value = e.currentTarget.value;
              update({ codigo_a: value });
            }}
            required
            autoFocus
          />
          <Select
            label="É"
            data={[
              { value: "igual", label: "igual a (troca direta)" },
              { value: "similar", label: "similar a (serve com ressalva)" },
              { value: "diferente", label: "diferente de (não serve)" },
            ]}
            value={form.tipo}
            onChange={(value) => update({ tipo: (value as ProposalSuggestion["tipo"]) || "igual" })}
            allowDeselect={false}
          />
          <TextInput
            label="Outro código"
            placeholder="Ex.: 53279887210"
            value={form.codigo_b}
            onChange={(e) => {
              const value = e.currentTarget.value;
              update({ codigo_b: value });
            }}
            required
          />
          <Textarea
            label="Observação (opcional)"
            placeholder="Ex.: muda o atuador"
            autosize
            minRows={2}
            maxLength={300}
            value={form.observacao || ""}
            onChange={(e) => {
              const value = e.currentTarget.value;
              update({ observacao: value });
            }}
          />
          <TextInput
            label="Seu nome"
            placeholder="Para o admin saber quem sugeriu"
            maxLength={60}
            value={form.autor || ""}
            onChange={(e) => {
              const value = e.currentTarget.value;
              update({ autor: value });
            }}
          />
          <Alert variant="light" color="info" p="xs">
            <Text size="xs">
              Nas outras máquinas, a sugestão vai pelo servidor local da base oficial (Backup &gt; Base
              oficial: endereço e senha da máquina que publica).
            </Text>
          </Alert>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setOpened(false)}>
              Cancelar
            </Button>
            <Button
              loading={mutation.isPending}
              disabled={!form.codigo_a.trim() || !form.codigo_b.trim()}
              onClick={() => mutation.mutate(form)}
            >
              Enviar sugestão
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
