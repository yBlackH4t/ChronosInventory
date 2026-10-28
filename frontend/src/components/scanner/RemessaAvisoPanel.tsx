import { useEffect, useState } from "react";
import { Button, Group, Select, Stack, Text, Textarea } from "@mantine/core";
import { useClipboard } from "@mantine/hooks";
import { IconBrandWhatsapp, IconCheck, IconCopy } from "@tabler/icons-react";

import { api } from "../../lib/apiClient";
import type { NfeContato } from "../../lib/api";
import { notifyError, notifySuccess } from "../../lib/notify";

const LAST_CONTACT_KEY = "chronos.nfe.avisoContato";

function readLastContact(): string | null {
  try {
    return window.localStorage.getItem(LAST_CONTACT_KEY);
  } catch {
    return null;
  }
}

function rememberContact(numero: string) {
  try {
    window.localStorage.setItem(LAST_CONTACT_KEY, numero);
  } catch {
    // sem localStorage: só não lembra o último contato
  }
}

type RemessaAvisoPanelProps = {
  /** Mensagem montada pela nota; o usuário pode mudar antes de mandar. */
  texto: string;
};

/** Aviso de remessa (matriz/filial) pronto para mandar no WhatsApp: editar, copiar ou enviar pelo robô. */
export default function RemessaAvisoPanel({ texto }: RemessaAvisoPanelProps) {
  const clipboard = useClipboard({ timeout: 1600 });
  const [value, setValue] = useState(texto);
  const [contatos, setContatos] = useState<NfeContato[]>([]);
  const [numero, setNumero] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  useEffect(() => setValue(texto), [texto]);

  useEffect(() => {
    api
      .getNfeConfig()
      .then((res) => {
        const lista = res.data.contatos_aviso ?? [];
        setContatos(lista);
        const last = readLastContact();
        setNumero(lista.find((c) => c.numero === last)?.numero ?? lista[0]?.numero ?? null);
      })
      .catch(() => setContatos([]));
  }, []);

  const send = async () => {
    if (!numero) return;
    setSending(true);
    try {
      await api.enviarAvisoRemessa({ numero, texto: value });
      rememberContact(numero);
      const nome = contatos.find((c) => c.numero === numero)?.nome || numero;
      setSentTo(nome);
      notifySuccess(`Aviso enviado no WhatsApp para ${nome}.`);
    } catch (e) {
      notifyError(e, "Não foi possível enviar o aviso.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Stack gap="xs" className="nfe-aviso" w="100%">
      <Group gap="xs">
        <IconBrandWhatsapp size={18} stroke={1.6} color="var(--mantine-color-success-6)" />
        <Text fw={600} size="sm">
          Aviso da remessa no WhatsApp
        </Text>
      </Group>
      <Textarea
        aria-label="Mensagem do aviso"
        autosize
        minRows={6}
        maxRows={22}
        value={value}
        onChange={(e) => setValue(e.currentTarget.value)}
      />
      <Group gap="xs" wrap="wrap">
        <Button
          variant="default"
          leftSection={clipboard.copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
          onClick={() => clipboard.copy(value)}
        >
          {clipboard.copied ? "Copiada" : "Copiar"}
        </Button>
        {contatos.length > 0 ? (
          <>
            <Select
              aria-label="Para quem"
              w={200}
              data={contatos.map((c) => ({ value: c.numero, label: c.nome || c.numero }))}
              value={numero}
              onChange={setNumero}
              allowDeselect={false}
              comboboxProps={{ withinPortal: true }}
            />
            <Button
              color="success"
              leftSection={<IconBrandWhatsapp size={16} />}
              loading={sending}
              disabled={!numero || !value.trim()}
              onClick={() => void send()}
            >
              Enviar no WhatsApp
            </Button>
          </>
        ) : (
          <Text size="xs" c="dimmed">
            Para enviar direto, cadastre os contatos em Configurar (chefe, colegas).
          </Text>
        )}
      </Group>
      {sentTo && (
        <Text size="xs" c="success">
          Enviado para {sentTo}.
        </Text>
      )}
    </Stack>
  );
}
