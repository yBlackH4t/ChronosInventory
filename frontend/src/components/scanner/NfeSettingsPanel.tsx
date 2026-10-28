import { useEffect, useState } from "react";
import {
  ActionIcon,
  Alert,
  Button,
  Divider,
  Group,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Textarea,
} from "@mantine/core";
import { IconCertificate, IconPlus, IconTrash } from "@tabler/icons-react";

import { api } from "../../lib/apiClient";
import type { NfeCnpj, NfeConfig, NfeContato } from "../../lib/api";
import { notifyError, notifySuccess } from "../../lib/notify";

type NfeSettingsPanelProps = {
  opened: boolean;
  onSaved: () => void;
};

function formatCnpj(value: string | null | undefined): string {
  const d = (value || "").replace(/\D/g, "");
  if (d.length !== 14) return value || "";
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

function formatPhone(value: string | null | undefined): string {
  const d = (value || "").replace(/\D/g, "");
  const local = d.length >= 12 && d.startsWith("55") ? d.slice(2) : d;
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return value || "";
}

function formatDate(value: string): string {
  const [y, m, d] = value.split("-");
  return d && m && y ? `${d}/${m}/${y}` : value;
}

/** Pastas dos XMLs, CNPJ desta loja, contatos do aviso de remessa e certificado A1 (para baixar notas de fornecedor da SEFAZ). */
export default function NfeSettingsPanel({ opened, onSaved }: NfeSettingsPanelProps) {
  const [config, setConfig] = useState<NfeConfig | null>(null);
  const [folders, setFolders] = useState("");
  const [cnpjs, setCnpjs] = useState<NfeCnpj[]>([{ cnpj: "", nome: "" }]);
  const [contatos, setContatos] = useState<NfeContato[]>([]);
  const [arquivo, setArquivo] = useState("");
  const [senha, setSenha] = useState("");
  const [saving, setSaving] = useState(false);

  const apply = (data: NfeConfig) => {
    setConfig(data);
    setFolders(data.pastas_xml.join("\n"));
    const saved = data.cnpjs?.length ? data.cnpjs : data.cnpj_loja ? [{ cnpj: data.cnpj_loja, nome: "" }] : [];
    setCnpjs(saved.length ? saved.map((c) => ({ cnpj: formatCnpj(c.cnpj), nome: c.nome })) : [{ cnpj: "", nome: "" }]);
    setContatos((data.contatos_aviso ?? []).map((c) => ({ nome: c.nome, numero: formatPhone(c.numero) })));
  };

  useEffect(() => {
    if (!opened) {
      setSenha("");
      return;
    }
    api
      .getNfeConfig()
      .then((res) => apply(res.data))
      .catch((e) => notifyError(e, "Não foi possível ler as configurações da NF-e."));
  }, [opened]);

  const save = async () => {
    setSaving(true);
    try {
      const pastas = folders.split("\n").map((f) => f.trim()).filter(Boolean);
      const lista = cnpjs.filter((c) => c.cnpj.trim()).map((c) => ({ cnpj: c.cnpj.trim(), nome: c.nome.trim() }));
      const contatosAviso = contatos
        .filter((c) => c.numero.trim())
        .map((c) => ({ nome: c.nome.trim(), numero: c.numero.trim() }));
      const res = await api.saveNfeConfig({ pastas_xml: pastas, cnpjs: lista, contatos_aviso: contatosAviso });
      apply(res.data);
      notifySuccess("Configurações da NF-e salvas.");
      onSaved();
    } catch (e) {
      notifyError(e, "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  };

  const saveCertificate = async () => {
    setSaving(true);
    try {
      const res = await api.saveNfeCertificado({ arquivo, senha });
      apply(res.data);
      setArquivo("");
      setSenha("");
      notifySuccess("Certificado salvo. Pode apagar o arquivo .pfx que você exportou.");
    } catch (e) {
      notifyError(e, "Não foi possível usar o certificado.");
    } finally {
      setSaving(false);
    }
  };

  const removeCertificate = async () => {
    try {
      const res = await api.removeNfeCertificado();
      apply(res.data);
      notifySuccess("Certificado removido desta máquina.");
    } catch (e) {
      notifyError(e, "Não foi possível remover o certificado.");
    }
  };

  const cert = config?.certificado;

  const updateCnpj = (index: number, patch: Partial<NfeCnpj>) =>
    setCnpjs((current) => current.map((c, i) => (i === index ? { ...c, ...patch } : c)));

  const updateContato = (index: number, patch: Partial<NfeContato>) =>
    setContatos((current) => current.map((c, i) => (i === index ? { ...c, ...patch } : c)));

  return (
    <Stack gap="sm">
      <Textarea
        label="Pastas onde o emissor salva os XMLs (uma por linha)"
        description="Notas emitidas nesta máquina: o Chronos procura nessas pastas e nas subpastas."
        autosize
        minRows={2}
        value={folders}
        onChange={(e) => setFolders(e.currentTarget.value)}
      />
      <Stack gap={6}>
        <div>
          <Text size="sm" fw={500}>
            CNPJs da empresa
          </Text>
          <Text size="xs" c="dimmed">
            O primeiro é o desta loja. Ao bipar a nota, o Chronos usa sozinho o CNPJ que está nela.
          </Text>
        </div>
        {cnpjs.map((c, index) => (
          <Group key={index} gap="xs" wrap="nowrap" align="flex-end">
            <TextInput
              style={{ flex: 1 }}
              placeholder="00.000.000/0000-00"
              aria-label={`CNPJ ${index + 1}`}
              value={c.cnpj}
              onChange={(e) => updateCnpj(index, { cnpj: e.currentTarget.value })}
              onBlur={() => updateCnpj(index, { cnpj: formatCnpj(c.cnpj) })}
            />
            <TextInput
              style={{ flex: 1 }}
              placeholder={index === 0 ? "Nome (ex.: Canoas)" : "Nome (ex.: Matriz)"}
              aria-label={`Nome do CNPJ ${index + 1}`}
              value={c.nome}
              maxLength={60}
              onChange={(e) => updateCnpj(index, { nome: e.currentTarget.value })}
            />
            <ActionIcon
              variant="subtle"
              color="danger"
              aria-label={`Remover CNPJ ${index + 1}`}
              disabled={cnpjs.length === 1}
              onClick={() => setCnpjs((current) => current.filter((_, i) => i !== index))}
            >
              <IconTrash size={16} />
            </ActionIcon>
          </Group>
        ))}
        <Group>
          <Button
            size="compact-xs"
            variant="subtle"
            leftSection={<IconPlus size={12} />}
            disabled={cnpjs.length >= 10}
            onClick={() => setCnpjs((current) => [...current, { cnpj: "", nome: "" }])}
          >
            Adicionar CNPJ
          </Button>
        </Group>
      </Stack>
      <Stack gap={6}>
        <div>
          <Text size="sm" fw={500}>
            Quem recebe o aviso de remessa no WhatsApp
          </Text>
          <Text size="xs" c="dimmed">
            Nota entre matriz e filial: depois de lançar, você escolhe para quem mandar a lista de peças.
          </Text>
        </div>
        {contatos.map((c, index) => (
          <Group key={index} gap="xs" wrap="nowrap" align="flex-end">
            <TextInput
              style={{ flex: 1 }}
              placeholder="Nome (ex.: Chefe)"
              aria-label={`Nome do contato ${index + 1}`}
              value={c.nome}
              maxLength={40}
              onChange={(e) => updateContato(index, { nome: e.currentTarget.value })}
            />
            <TextInput
              style={{ flex: 1 }}
              placeholder="(51) 99999-9999"
              aria-label={`WhatsApp do contato ${index + 1}`}
              value={c.numero}
              onChange={(e) => updateContato(index, { numero: e.currentTarget.value })}
              onBlur={() => updateContato(index, { numero: formatPhone(c.numero) })}
            />
            <ActionIcon
              variant="subtle"
              color="danger"
              aria-label={`Remover contato ${index + 1}`}
              onClick={() => setContatos((current) => current.filter((_, i) => i !== index))}
            >
              <IconTrash size={16} />
            </ActionIcon>
          </Group>
        ))}
        <Group>
          <Button
            size="compact-xs"
            variant="subtle"
            leftSection={<IconPlus size={12} />}
            disabled={contatos.length >= 20}
            onClick={() => setContatos((current) => [...current, { nome: "", numero: "" }])}
          >
            Adicionar contato
          </Button>
        </Group>
      </Stack>
      <Group justify="flex-end">
        <Button size="xs" onClick={() => void save()} loading={saving}>
          Salvar
        </Button>
      </Group>

      <Divider label="Notas de fornecedor (baixar o XML da SEFAZ)" labelPosition="left" />
      {cert ? (
        <Alert color="success" icon={<IconCertificate size={16} />}>
          <Group justify="space-between" wrap="nowrap">
            <Text size="sm">
              Certificado de {cert.titular}
              {cert.cnpj ? ` (${formatCnpj(cert.cnpj)})` : ""}, válido até {formatDate(cert.validade)}.
            </Text>
            <Button size="xs" variant="subtle" color="danger" onClick={() => void removeCertificate()}>
              Remover
            </Button>
          </Group>
        </Alert>
      ) : (
        <Stack gap="xs">
          <Text size="xs" c="dimmed">
            Com o certificado digital A1 da empresa, bipar uma nota que não está nas pastas baixa o XML
            dela na SEFAZ. A senha fica guardada só nesta máquina, protegida pelo Windows.
          </Text>
          <Group grow align="flex-end">
            <TextInput
              label="Arquivo do certificado (.pfx)"
              placeholder="C:\pasta\certificado.pfx"
              value={arquivo}
              onChange={(e) => setArquivo(e.currentTarget.value)}
            />
            <PasswordInput label="Senha do certificado" value={senha} onChange={(e) => setSenha(e.currentTarget.value)} />
          </Group>
          <Group justify="flex-end">
            <Button size="xs" onClick={() => void saveCertificate()} loading={saving} disabled={!arquivo || !senha}>
              Usar este certificado
            </Button>
          </Group>
        </Stack>
      )}
    </Stack>
  );
}
