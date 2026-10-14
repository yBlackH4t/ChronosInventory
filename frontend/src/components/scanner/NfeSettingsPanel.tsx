import { useEffect, useState } from "react";
import { Alert, Button, Divider, Group, PasswordInput, Stack, Text, TextInput, Textarea } from "@mantine/core";
import { IconCertificate } from "@tabler/icons-react";

import { api } from "../../lib/apiClient";
import type { NfeConfig } from "../../lib/api";
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

function formatDate(value: string): string {
  const [y, m, d] = value.split("-");
  return d && m && y ? `${d}/${m}/${y}` : value;
}

/** Pastas dos XMLs, CNPJ desta loja e certificado A1 (para baixar notas de fornecedor da SEFAZ). */
export default function NfeSettingsPanel({ opened, onSaved }: NfeSettingsPanelProps) {
  const [config, setConfig] = useState<NfeConfig | null>(null);
  const [folders, setFolders] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [arquivo, setArquivo] = useState("");
  const [senha, setSenha] = useState("");
  const [saving, setSaving] = useState(false);

  const apply = (data: NfeConfig) => {
    setConfig(data);
    setFolders(data.pastas_xml.join("\n"));
    setCnpj(formatCnpj(data.cnpj_loja));
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
      const res = await api.saveNfeConfig({ pastas_xml: pastas, cnpj_loja: cnpj });
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
      <TextInput
        label="CNPJ desta loja"
        description="Quem recebe as notas de entrada aqui (ex.: a filial de Canoas)."
        placeholder="00.000.000/0000-00"
        value={cnpj}
        onChange={(e) => setCnpj(e.currentTarget.value)}
      />
      <Group justify="flex-end">
        <Button size="xs" onClick={() => void save()} loading={saving}>
          Salvar
        </Button>
      </Group>

      <Divider label="Notas de fornecedor (baixar o XML da SEFAZ)" labelPosition="left" />
      {cert ? (
        <Alert color="teal" icon={<IconCertificate size={16} />}>
          <Group justify="space-between" wrap="nowrap">
            <Text size="sm">
              Certificado de {cert.titular}
              {cert.cnpj ? ` (${formatCnpj(cert.cnpj)})` : ""}, válido até {formatDate(cert.validade)}.
            </Text>
            <Button size="xs" variant="subtle" color="red" onClick={() => void removeCertificate()}>
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
