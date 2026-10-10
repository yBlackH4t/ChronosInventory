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
  TextInput,
  Select,
  Textarea,
  Table,
  ActionIcon,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconAlertCircle,
  IconSearch,
  IconPlus,
  IconTrash,
  IconDatabase,
  IconX,
} from "@tabler/icons-react";
import {
  listKnowledge,
  addKnowledgeRule,
  deleteKnowledgeRule,
} from "../../lib/assistantAdminApi";
import type {
  KnowledgeRule,
  KnowledgeRelation,
} from "../../types/assistantAdmin";

interface AdminKnowledgeTabProps {
  readOnly?: boolean;
}

export default function AdminKnowledgeTab({ readOnly = false }: AdminKnowledgeTabProps) {
  const queryClient = useQueryClient();
  const [busca, setBusca] = useState("");
  const [modalNovaRegra, setModalNovaRegra] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  // Form para nova regra
  const [codigoA, setCodigoA] = useState("");
  const [codigoB, setCodigoB] = useState("");
  const [tipo, setTipo] = useState<KnowledgeRelation>("igual");
  const [observacao, setObservacao] = useState("");

  const {
    data: rules,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["assistant-admin-knowledge", busca],
    queryFn: () => listKnowledge(busca),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["assistant-admin-knowledge"] });
    queryClient.invalidateQueries({ queryKey: ["assistant-admin-review"] });
  };

  const addRuleMutation = useMutation({
    mutationFn: addKnowledgeRule,
    onSuccess: (_, variables) => {
      notifications.show({
        title: "Regra adicionada",
        message: `Regra entre ${variables.codigo_a} e ${variables.codigo_b} salva com sucesso.`,
        color: "green",
      });
      setModalNovaRegra(false);
      setCodigoA("");
      setCodigoB("");
      setTipo("igual");
      setObservacao("");
      invalidate();
    },
    onError: (err: Error) => {
      notifications.show({
        title: "Erro ao adicionar",
        message: err.message || "Não foi possível cadastrar a regra.",
        color: "red",
      });
    },
  });

  const deleteRuleMutation = useMutation({
    mutationFn: deleteKnowledgeRule,
    onSuccess: () => {
      notifications.show({
        title: "Regra removida",
        message: "Regra de conhecimento excluída com sucesso.",
        color: "blue",
      });
      setDeleteConfirmId(null);
      invalidate();
    },
    onError: (err: Error) => {
      notifications.show({
        title: "Erro ao remover",
        message: err.message || "Não foi possível remover a regra.",
        color: "red",
      });
    },
  });

  const handleSaveRule = () => {
    if (!codigoA.trim() || !codigoB.trim()) {
      notifications.show({
        title: "Campos obrigatórios",
        message: "Informe os dois códigos para cadastrar a regra.",
        color: "orange",
      });
      return;
    }
    addRuleMutation.mutate({
      codigo_a: codigoA.trim(),
      codigo_b: codigoB.trim(),
      tipo,
      observacao: observacao.trim() || undefined,
    });
  };

  const getRelationBadge = (relation: string) => {
    switch (relation) {
      case "igual":
        return <Badge color="green" variant="filled">igual</Badge>;
      case "similar":
        return <Badge color="orange" variant="filled">similar</Badge>;
      case "diferente":
        return <Badge color="red" variant="filled">diferente</Badge>;
      default:
        return <Badge color="gray">{relation}</Badge>;
    }
  };

  return (
    <Stack gap="md">
      <Card withBorder p="sm" radius="md" bg="var(--mantine-color-blue-0)">
        <Text size="sm" c="blue.9">
          <strong>Legenda de relações:</strong> <strong>igual</strong> = troca direta
          (100% compatível); <strong>similar</strong> = serve com ressalva/adaptação;{" "}
          <strong>diferente</strong> = não serve (o assistente nunca sugere).
        </Text>
      </Card>

      <Group justify="space-between">
        <TextInput
          placeholder="Buscar por código..."
          leftSection={<IconSearch size={16} />}
          rightSection={
            busca ? (
              <ActionIcon size="sm" variant="subtle" onClick={() => setBusca("")}>
                <IconX size={14} />
              </ActionIcon>
            ) : null
          }
          value={busca}
          onChange={(e) => setBusca(e.currentTarget.value)}
          style={{ flex: 1, maxWidth: 360 }}
        />

        {!readOnly && (
          <Button
            leftSection={<IconPlus size={16} />}
            color="blue"
            onClick={() => setModalNovaRegra(true)}
          >
            Nova regra
          </Button>
        )}
      </Group>

      {isLoading && (
        <Card withBorder p="xl" radius="md">
          <Group justify="center" gap="sm">
            <Loader size="sm" />
            <Text size="sm" c="dimmed">
              Carregando base de conhecimento...
            </Text>
          </Group>
        </Card>
      )}

      {isError && (
        <Alert
          icon={<IconAlertCircle size={16} />}
          title="Erro ao carregar regras"
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

      {!isLoading && !isError && rules && rules.length === 0 && (
        <Card withBorder p="xl" radius="md" style={{ textAlign: "center" }}>
          <Stack align="center" gap="xs">
            <IconDatabase size={36} color="var(--mantine-color-gray-5)" />
            <Text fw={500}>Nenhuma regra encontrada</Text>
            <Text size="sm" c="dimmed">
              {busca
                ? `Nenhuma regra bateu com a busca "${busca}".`
                : "Ainda não há regras de conhecimento cadastradas."}
            </Text>
          </Stack>
        </Card>
      )}

      {!isLoading && !isError && rules && rules.length > 0 && (
        <Card withBorder p={0} radius="md" style={{ overflowX: "auto" }}>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Código A</Table.Th>
                <Table.Th style={{ textAlign: "center", width: 120 }}>Relação</Table.Th>
                <Table.Th>Código B</Table.Th>
                <Table.Th>Observação / Ressalva</Table.Th>
                <Table.Th style={{ width: 150 }}>Data</Table.Th>
                {!readOnly && <Table.Th style={{ textAlign: "right", width: 80 }}>Ações</Table.Th>}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rules.map((rule: KnowledgeRule) => {
                const dataFormatada = rule.atualizado_em || rule.criado_em
                  ? new Date(rule.atualizado_em || rule.criado_em!).toLocaleDateString("pt-BR")
                  : "—";

                return (
                  <Table.Tr key={rule.id}>
                    <Table.Td>
                      <Text fw={600} size="sm">
                        {rule.codigo_a}
                      </Text>
                    </Table.Td>
                    <Table.Td style={{ textAlign: "center" }}>
                      {getRelationBadge(rule.tipo)}
                    </Table.Td>
                    <Table.Td>
                      <Text fw={600} size="sm">
                        {rule.codigo_b}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c={rule.observacao ? undefined : "dimmed"}>
                        {rule.observacao || "—"}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs" c="dimmed">
                        {dataFormatada}
                      </Text>
                    </Table.Td>
                    {!readOnly && (
                      <Table.Td style={{ textAlign: "right" }}>
                        <Tooltip label="Excluir regra">
                          <ActionIcon
                            color="red"
                            variant="subtle"
                            size="sm"
                            onClick={() => setDeleteConfirmId(rule.id)}
                          >
                            <IconTrash size={16} />
                          </ActionIcon>
                        </Tooltip>
                      </Table.Td>
                    )}
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Card>
      )}

      {/* Modal Nova Regra */}
      <Modal
        opened={modalNovaRegra}
        onClose={() => setModalNovaRegra(false)}
        title="Nova Regra de Conhecimento"
        centered
      >
        <Stack gap="sm">
          <TextInput
            label="Código A"
            placeholder="Ex.: 4031196"
            value={codigoA}
            onChange={(e) => setCodigoA(e.currentTarget.value)}
            required
            autoFocus
          />
          <Select
            label="Tipo de relação"
            data={[
              { value: "igual", label: "igual — troca direta 100%" },
              { value: "similar", label: "similar — serve com ressalva/adaptação" },
              { value: "diferente", label: "diferente — não serve (nunca sugerir)" },
            ]}
            value={tipo}
            onChange={(val) => setTipo((val as KnowledgeRelation) || "igual")}
            allowDeselect={false}
          />
          <TextInput
            label="Código B"
            placeholder="Ex.: 4031195"
            value={codigoB}
            onChange={(e) => setCodigoB(e.currentTarget.value)}
            required
          />
          <Textarea
            label="Observação (opcional)"
            placeholder="Ex.: carcaça quente de 16cm² em vez de 14cm²"
            value={observacao}
            onChange={(e) => setObservacao(e.currentTarget.value)}
            rows={2}
          />
          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={() => setModalNovaRegra(false)}>
              Cancelar
            </Button>
            <Button
              color="blue"
              onClick={handleSaveRule}
              loading={addRuleMutation.isPending}
            >
              Salvar Regra
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Modal Confirmação de Exclusão */}
      <Modal
        opened={deleteConfirmId !== null}
        onClose={() => setDeleteConfirmId(null)}
        title="Confirmar exclusão"
        centered
        size="sm"
      >
        <Stack gap="sm">
          <Text size="sm">
            Tem certeza que deseja excluir esta regra de conhecimento? O assistente
            não usará mais essa equivalência.
          </Text>
          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={() => setDeleteConfirmId(null)}>
              Cancelar
            </Button>
            <Button
              color="red"
              onClick={() => {
                if (deleteConfirmId !== null) {
                  deleteRuleMutation.mutate(deleteConfirmId);
                }
              }}
              loading={deleteRuleMutation.isPending}
            >
              Excluir
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
