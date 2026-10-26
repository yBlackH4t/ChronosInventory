import { useState } from "react";
import {
  ActionIcon,
  Alert,
  Button,
  Group,
  Modal,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Textarea,
  Tooltip,
} from "@mantine/core";
import { IconFilePlus, IconPencil, IconPlus, IconTrash } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { modals } from "@mantine/modals";
import { api } from "../../lib/apiClient";
import { notifyError, notifySuccess } from "../../lib/notify";
import type { OwnFicha, OwnFichaApplication, OwnFichaCode, OwnFichaIn } from "../../types/api";

const BRANDS = [
  { value: "HOLSET", label: "Holset" },
  { value: "GARRETT", label: "Garrett" },
  { value: "BORGWARNER", label: "BorgWarner" },
  { value: "OUTRA", label: "Outra marca" },
];

const CODE_MAKERS = [
  { value: "OEM", label: "OEM (montadora)" },
  { value: "HOLSET", label: "Holset" },
  { value: "GARRETT", label: "Garrett" },
  { value: "BORGWARNER", label: "BorgWarner" },
  { value: "MAHLE", label: "Mahle" },
  { value: "BIAGIO", label: "Biagio" },
  { value: "MASTER POWER", label: "Master Power" },
  { value: "OUTRO", label: "Outro" },
];

const EMPTY_APP: OwnFichaApplication = { montadora: "", veiculo: "", motor: "", complemento: "" };
const EMPTY_CODE: OwnFichaCode = { fabricante: "OEM", numero: "" };

function onlyCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Códigos de peça do nome do produto ("TURBO HE150WG - 6513409" -> ["6513409"]). */
function codesInName(name: string): string[] {
  return (name.toUpperCase().match(/[A-Z0-9][A-Z0-9.-]*/g) || [])
    .map((t) => t.replace(/[.-]+$/, ""))
    .filter((t) => (t.match(/\d/g) || []).length >= 5);
}

function guessBrand(name: string): string {
  const upper = name.toUpperCase();
  if (upper.includes("HOLSET")) return "HOLSET";
  if (upper.includes("GARRET")) return "GARRETT";
  if (upper.includes("BORG")) return "BORGWARNER";
  return "HOLSET";
}

function emptyForm(productName: string): OwnFichaIn {
  const tipo = /CONJ|CENTRAL|MIOLO/i.test(productName) ? "CONJUNTO" : "TURBO";
  return {
    codigo: codesInName(productName)[0] || "",
    marca: guessBrand(productName),
    tipo,
    modelo: "",
    observacao: "",
    aplicacoes: [{ ...EMPTY_APP }],
    codigos: [{ ...EMPTY_CODE }],
  };
}

function fichaOfProduct(fichas: OwnFicha[], productName: string): OwnFicha | undefined {
  const codes = new Set(codesInName(productName).map(onlyCode));
  return fichas.find(
    (f) => codes.has(onlyCode(f.codigo)) || f.codigos.some((c) => codes.has(onlyCode(c.numero || ""))),
  );
}

/**
 * Ficha própria do produto: aplicações e códigos que a empresa cadastra quando o catálogo
 * Master Power não tem a turbina. O assistente passa a achar a turbina por eles.
 */
export function OwnFichaPanel({ productName }: { productName: string }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<OwnFichaIn | null>(null);
  const [editingId, setEditingId] = useState<number | undefined>(undefined);

  const fichasQuery = useQuery({
    queryKey: ["fichas-proprias"],
    queryFn: ({ signal }) => api.listOwnFichas(undefined, { signal }),
    staleTime: 60_000,
  });
  const fichas = fichasQuery.data?.data.fichas ?? [];
  const canEdit = fichasQuery.data?.data.pode_editar ?? false;
  const readOnlyReason = fichasQuery.data?.data.motivo;
  const current = fichaOfProduct(fichas, productName);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["fichas-proprias"] });
    queryClient.invalidateQueries({ queryKey: ["produto-catalogo"] });
  };

  const saveMutation = useMutation({
    mutationFn: (payload: OwnFichaIn) => api.saveOwnFicha(payload, editingId),
    onSuccess: () => {
      notifySuccess("Ficha própria salva. O assistente já acha a turbina por ela.");
      setForm(null);
      refresh();
    },
    onError: (error) => notifyError(error, "Não foi possível salvar a ficha própria."),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteOwnFicha(id),
    onSuccess: () => {
      notifySuccess("Ficha própria excluída.");
      setForm(null);
      refresh();
    },
    onError: (error) => notifyError(error, "Não foi possível excluir a ficha própria."),
  });

  const openEditor = () => {
    if (current) {
      setEditingId(current.id);
      setForm({
        codigo: current.codigo,
        marca: current.marca,
        tipo: current.tipo,
        modelo: current.modelo || "",
        observacao: current.observacao || "",
        aplicacoes: current.aplicacoes.length ? current.aplicacoes : [{ ...EMPTY_APP }],
        codigos: current.codigos.length ? current.codigos : [{ ...EMPTY_CODE }],
      });
    } else {
      setEditingId(undefined);
      setForm(emptyForm(productName));
    }
  };

  const update = (patch: Partial<OwnFichaIn>) => setForm((prev) => (prev ? { ...prev, ...patch } : prev));

  const setApp = (index: number, field: keyof OwnFichaApplication, value: string) =>
    setForm((prev) =>
      prev
        ? { ...prev, aplicacoes: prev.aplicacoes.map((a, i) => (i === index ? { ...a, [field]: value } : a)) }
        : prev,
    );

  const setCode = (index: number, field: keyof OwnFichaCode, value: string) =>
    setForm((prev) =>
      prev ? { ...prev, codigos: prev.codigos.map((c, i) => (i === index ? { ...c, [field]: value } : c)) } : prev,
    );

  if (fichasQuery.isLoading) return null;

  const button = (
    <Button
      size="xs"
      variant="light"
      leftSection={current ? <IconPencil size={14} /> : <IconFilePlus size={14} />}
      onClick={openEditor}
      disabled={!canEdit}
    >
      {current ? "Editar ficha própria" : "Criar ficha própria"}
    </Button>
  );

  return (
    <>
      <Group justify="space-between" gap="xs" wrap="wrap">
        <Text size="xs" c="dimmed" maw={520}>
          {current
            ? "Esta turbina tem ficha própria: aplicações e códigos cadastrados pela empresa."
            : "O catálogo não tem esta turbina ou falta algo? Cadastre a aplicação e os outros códigos numa ficha própria."}
        </Text>
        {canEdit ? button : <Tooltip label={readOnlyReason || ""} multiline w={300}>{button}</Tooltip>}
      </Group>

      <Modal
        opened={form !== null}
        onClose={() => setForm(null)}
        title={editingId ? "Editar ficha própria" : "Nova ficha própria"}
        size="xl"
        centered
      >
        {form && (
          <Stack gap="md">
            <SimpleGrid cols={{ base: 1, sm: 4 }} spacing="sm">
              <TextInput
                label="Código da turbina"
                description="O código que está no nome do produto"
                value={form.codigo}
                onChange={(e) => update({ codigo: e.currentTarget.value })}
                required
              />
              <Select
                label="Marca do código"
                data={BRANDS}
                value={form.marca}
                onChange={(value) => update({ marca: value || "HOLSET" })}
                allowDeselect={false}
              />
              <Select
                label="Tipo"
                data={[
                  { value: "TURBO", label: "Turbo completo" },
                  { value: "CONJUNTO", label: "Conjunto central" },
                ]}
                value={form.tipo}
                onChange={(value) => update({ tipo: (value as OwnFichaIn["tipo"]) || "TURBO" })}
                allowDeselect={false}
              />
              <TextInput
                label="Modelo"
                placeholder="Ex.: HE150WG"
                value={form.modelo || ""}
                onChange={(e) => update({ modelo: e.currentTarget.value })}
              />
            </SimpleGrid>

            <Stack gap={6}>
              <Text size="sm" fw={600}>
                Aplicações
              </Text>
              {form.aplicacoes.map((app, index) => (
                <Group key={index} gap="xs" wrap="nowrap" align="flex-end">
                  <TextInput
                    style={{ flex: 1 }}
                    placeholder="Montadora (Foton)"
                    value={app.montadora || ""}
                    onChange={(e) => setApp(index, "montadora", e.currentTarget.value)}
                  />
                  <TextInput
                    style={{ flex: 1.4 }}
                    placeholder="Veículo (Aumark / Tunland)"
                    value={app.veiculo || ""}
                    onChange={(e) => setApp(index, "veiculo", e.currentTarget.value)}
                  />
                  <TextInput
                    style={{ flex: 1 }}
                    placeholder="Motor (BFCEC F2.5)"
                    value={app.motor || ""}
                    onChange={(e) => setApp(index, "motor", e.currentTarget.value)}
                  />
                  <TextInput
                    style={{ flex: 1 }}
                    placeholder="Ano / obs. (Euro 5, 2018+)"
                    value={app.complemento || ""}
                    onChange={(e) => setApp(index, "complemento", e.currentTarget.value)}
                  />
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    aria-label="Remover aplicação"
                    onClick={() => update({ aplicacoes: form.aplicacoes.filter((_, i) => i !== index) })}
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                </Group>
              ))}
              <Button
                size="xs"
                variant="subtle"
                leftSection={<IconPlus size={14} />}
                onClick={() => update({ aplicacoes: [...form.aplicacoes, { ...EMPTY_APP }] })}
                style={{ alignSelf: "flex-start" }}
              >
                Adicionar aplicação
              </Button>
            </Stack>

            <Stack gap={6}>
              <Text size="sm" fw={600}>
                Outros códigos desta peça
              </Text>
              {form.codigos.map((code, index) => (
                <Group key={index} gap="xs" wrap="nowrap">
                  <Select
                    w={190}
                    data={CODE_MAKERS}
                    value={code.fabricante}
                    onChange={(value) => setCode(index, "fabricante", value || "OEM")}
                    allowDeselect={false}
                  />
                  <TextInput
                    style={{ flex: 1 }}
                    placeholder="Número (ex.: 6393680)"
                    value={code.numero || ""}
                    onChange={(e) => setCode(index, "numero", e.currentTarget.value)}
                  />
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    aria-label="Remover código"
                    onClick={() => update({ codigos: form.codigos.filter((_, i) => i !== index) })}
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                </Group>
              ))}
              <Button
                size="xs"
                variant="subtle"
                leftSection={<IconPlus size={14} />}
                onClick={() => update({ codigos: [...form.codigos, { ...EMPTY_CODE }] })}
                style={{ alignSelf: "flex-start" }}
              >
                Adicionar código
              </Button>
            </Stack>

            <Textarea
              label="Observação técnica"
              autosize
              minRows={2}
              maxLength={500}
              value={form.observacao || ""}
              onChange={(e) => update({ observacao: e.currentTarget.value })}
            />

            <Alert variant="light" color="info" p="xs">
              <Text size="xs">
                A ficha fica na aba Catálogo, o assistente acha a turbina por essas aplicações e códigos,
                e ela vai para as outras máquinas junto com o conhecimento do assistente.
              </Text>
            </Alert>

            <Group justify="space-between">
              {editingId ? (
                <Button
                  variant="subtle"
                  color="danger"
                  leftSection={<IconTrash size={14} />}
                  loading={deleteMutation.isPending}
                  onClick={() =>
                    modals.openConfirmModal({
                      title: "Excluir ficha própria?",
                      children: <Text size="sm">As aplicações e códigos desta ficha deixam de valer.</Text>,
                      labels: { confirm: "Excluir", cancel: "Cancelar" },
                      confirmProps: { color: "danger" },
                      onConfirm: () => deleteMutation.mutate(editingId),
                    })
                  }
                >
                  Excluir ficha
                </Button>
              ) : (
                <span />
              )}
              <Group gap="xs">
                <Button variant="default" onClick={() => setForm(null)}>
                  Cancelar
                </Button>
                <Button loading={saveMutation.isPending} onClick={() => saveMutation.mutate(form)}>
                  Salvar ficha
                </Button>
              </Group>
            </Group>
          </Stack>
        )}
      </Modal>
    </>
  );
}
