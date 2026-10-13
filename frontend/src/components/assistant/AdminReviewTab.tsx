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
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconAlertCircle,
  IconCheck,
  IconX,
  IconArrowsExchange,
  IconPlus,
  IconSparkles,
  IconInfoCircle,
  IconBrandWhatsapp,
} from "@tabler/icons-react";
import {
  getReviewList,
  concludeReview,
  addKnowledgeRule,
  listProposals,
  approveProposal,
  rejectProposal,
} from "../../lib/assistantAdminApi";
import type {
  ReviewItem,
  ReviewSuggestion,
  KnowledgeRelation,
  Proposal,
} from "../../types/assistantAdmin";

export default function AdminReviewTab() {
  const queryClient = useQueryClient();

  // Modal para ressalva de "É similar"
  const [similarModal, setSimilarModal] = useState<{
    opened: boolean;
    codigoA: string;
    codigoB: string;
    ressalva: string;
  }>({
    opened: false,
    codigoA: "",
    codigoB: "",
    ressalva: "",
  });

  // Modal para ensinar código livre
  const [customModal, setCustomModal] = useState<{
    opened: boolean;
    codigoA: string;
    codigoB: string;
    tipo: KnowledgeRelation;
    observacao: string;
  }>({
    opened: false,
    codigoA: "",
    codigoB: "",
    tipo: "igual",
    observacao: "",
  });

  const {
    data: items,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["assistant-admin-review"],
    queryFn: getReviewList,
  });

  const { data: proposals, isLoading: proposalsLoading } = useQuery({
    queryKey: ["assistant-admin-proposals"],
    queryFn: () => listProposals("pendente"),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["assistant-admin-review"] });
    queryClient.invalidateQueries({ queryKey: ["assistant-admin-knowledge"] });
    queryClient.invalidateQueries({ queryKey: ["assistant-admin-proposals"] });
  };

  const approveProposalMutation = useMutation({
    mutationFn: approveProposal,
    onSuccess: (_, id) => {
      notifications.show({
        title: "Proposta aprovada",
        message: `Proposta #${id} aprovada e incorporada à base de conhecimento.`,
        color: "green",
      });
      invalidate();
    },
    onError: (err: Error) => {
      notifications.show({
        title: "Erro ao aprovar proposta",
        message: err.message || "Não foi possível aprovar a proposta.",
        color: "red",
      });
    },
  });

  const rejectProposalMutation = useMutation({
    mutationFn: rejectProposal,
    onSuccess: (_, id) => {
      notifications.show({
        title: "Proposta recusada",
        message: `Proposta #${id} recusada.`,
        color: "blue",
      });
      invalidate();
    },
    onError: (err: Error) => {
      notifications.show({
        title: "Erro ao recusar proposta",
        message: err.message || "Não foi possível recusar a proposta.",
        color: "red",
      });
    },
  });

  const addRuleMutation = useMutation({
    mutationFn: addKnowledgeRule,
    onSuccess: (_, variables) => {
      notifications.show({
        title: "Regra salva",
        message: `Regra entre ${variables.codigo_a} e ${variables.codigo_b} registrada com sucesso.`,
        color: "green",
      });
      invalidate();
    },
    onError: (err: Error) => {
      notifications.show({
        title: "Erro ao salvar",
        message: err.message || "Não foi possível registrar a regra.",
        color: "red",
      });
    },
  });

  const concludeMutation = useMutation({
    mutationFn: concludeReview,
    onSuccess: (_, codigo) => {
      notifications.show({
        title: "Concluído",
        message: `Código ${codigo} concluído da lista de revisão.`,
        color: "blue",
      });
      invalidate();
    },
    onError: (err: Error) => {
      notifications.show({
        title: "Erro",
        message: err.message || "Não foi possível concluir o código.",
        color: "red",
      });
    },
  });

  const handleQuickRule = (
    codigoA: string,
    codigoB: string,
    tipo: KnowledgeRelation,
    observacao?: string
  ) => {
    addRuleMutation.mutate({
      codigo_a: codigoA,
      codigo_b: codigoB,
      tipo,
      observacao: observacao?.trim() || undefined,
    });
  };

  const handleOpenSimilarModal = (codigoA: string, codigoB: string) => {
    setSimilarModal({
      opened: true,
      codigoA,
      codigoB,
      ressalva: "",
    });
  };

  const handleConfirmSimilar = () => {
    handleQuickRule(
      similarModal.codigoA,
      similarModal.codigoB,
      "similar",
      similarModal.ressalva
    );
    setSimilarModal({ opened: false, codigoA: "", codigoB: "", ressalva: "" });
  };

  const handleOpenCustomModal = (codigoA: string) => {
    setCustomModal({
      opened: true,
      codigoA,
      codigoB: "",
      tipo: "igual",
      observacao: "",
    });
  };

  const handleConfirmCustom = () => {
    if (!customModal.codigoB.trim()) {
      notifications.show({
        title: "Campo obrigatório",
        message: "Informe o outro código para relacionar.",
        color: "orange",
      });
      return;
    }
    handleQuickRule(
      customModal.codigoA,
      customModal.codigoB.trim(),
      customModal.tipo,
      customModal.observacao
    );
    setCustomModal({
      opened: false,
      codigoA: "",
      codigoB: "",
      tipo: "igual",
      observacao: "",
    });
  };

  if (isLoading || proposalsLoading) {
    return (
      <Card withBorder p="xl" radius="md">
        <Group justify="center" gap="sm">
          <Loader size="sm" />
          <Text size="sm" c="dimmed">
            Carregando itens para revisão e propostas...
          </Text>
        </Group>
      </Card>
    );
  }

  if (isError) {
    return (
      <Alert
        icon={<IconAlertCircle size={16} />}
        title="Erro ao carregar revisão"
        color="red"
      >
        <Group justify="space-between">
          <Text size="sm">{error instanceof Error ? error.message : "Erro desconhecido"}</Text>
          <Button size="xs" variant="outline" color="red" onClick={() => refetch()}>
            Tentar novamente
          </Button>
        </Group>
      </Alert>
    );
  }

  const hasItems = items && items.length > 0;
  const hasProposals = proposals && proposals.length > 0;

  if (!hasItems && !hasProposals) {
    return (
      <Card withBorder p="xl" radius="md" ta="center">
        <Stack align="center" gap="xs">
          <IconSparkles size={36} color="var(--mantine-color-blue-5)" />
          <Text fw={500}>Tudo em dia!</Text>
          <Text size="sm" c="dimmed" maw={480}>
            Nenhum código pendente de revisão nem propostas enviadas pelo WhatsApp.
          </Text>
        </Stack>
      </Card>
    );
  }

  return (
    <Stack gap="md">
      {/* Seção de Propostas do WhatsApp */}
      {hasProposals && (
        <Stack gap="xs">
          <Group justify="space-between">
            <Group gap="xs">
              <IconBrandWhatsapp size={20} color="var(--mantine-color-teal-6)" />
              <Text fw={700} size="sm">
                Propostas de regras enviadas pelo WhatsApp (/ensinar)
              </Text>
            </Group>
            <Badge color="teal" variant="light">
              {proposals.length} pendente{proposals.length === 1 ? "" : "s"}
            </Badge>
          </Group>

          {proposals.map((prop: Proposal) => {
            const dataEnvio = prop.criado_em
              ? new Date(prop.criado_em).toLocaleString("pt-BR")
              : "—";

            return (
              <Card
                key={prop.id}
                withBorder
                p="sm"
                radius="md"
                bg="var(--mantine-color-teal-light)"
                style={{ borderColor: "var(--mantine-color-teal-light-border)" }}
              >
                <Group justify="space-between" wrap="wrap">
                  <div style={{ flex: 1, minWidth: 260 }}>
                    <Group gap="xs" mb={4}>
                      <Text fw={700} size="sm">
                        {prop.codigo_a}
                      </Text>
                      <Badge
                        color={
                          prop.tipo === "igual"
                            ? "green"
                            : prop.tipo === "similar"
                            ? "orange"
                            : "red"
                        }
                        variant="filled"
                        size="xs"
                      >
                        {prop.tipo}
                      </Badge>
                      <Text fw={700} size="sm">
                        {prop.codigo_b}
                      </Text>
                      {prop.autor && (
                        <Badge variant="outline" color="gray" size="xs">
                          {prop.autor}
                        </Badge>
                      )}
                    </Group>
                    {prop.observacao && (
                      <Text size="xs" mb={2}>
                        Obs: {prop.observacao}
                      </Text>
                    )}
                    <Text size="xs" c="dimmed">
                      Enviada pelo WhatsApp em {dataEnvio}
                    </Text>
                  </div>

                  <Group gap="xs">
                    <Button
                      size="xs"
                      color="green"
                      variant="light"
                      leftSection={<IconCheck size={14} />}
                      onClick={() => approveProposalMutation.mutate(prop.id)}
                      loading={approveProposalMutation.isPending}
                    >
                      Aprovar
                    </Button>
                    <Button
                      size="xs"
                      color="red"
                      variant="subtle"
                      leftSection={<IconX size={14} />}
                      onClick={() => rejectProposalMutation.mutate(prop.id)}
                      loading={rejectProposalMutation.isPending}
                    >
                      Recusar
                    </Button>
                  </Group>
                </Group>
              </Card>
            );
          })}
        </Stack>
      )}

      {hasItems && (
        <Alert color="blue" variant="light" icon={<IconInfoCircle size={16} />}>
          Estes códigos foram pesquisados mas não estavam em estoque. Ensine o assistente
          relacionando-os com peças equivalentes ou descarte se não houver correlação.
        </Alert>
      )}

      {hasItems && items.map((item: ReviewItem) => {
        const dataFormatada = item.ultima_vez
          ? new Date(item.ultima_vez).toLocaleString("pt-BR")
          : "—";

        return (
          <Card key={item.codigo} withBorder radius="md" p="md" shadow="xs">
            <Group justify="space-between" align="flex-start" mb="xs">
              <div>
                <Group gap="xs">
                  <Text fw={700} size="lg">
                    {item.codigo}
                  </Text>
                  <Badge color="blue" variant="light">
                    Perguntado {item.vezes} {item.vezes === 1 ? "vez" : "vezes"}
                  </Badge>
                  <Badge color="gray" variant="outline">
                    Última vez: {dataFormatada}
                  </Badge>
                </Group>
                {item.exemplo && (
                  <Text size="xs" c="dimmed" mt={4}>
                    Exemplo de pergunta: "{item.exemplo}"
                  </Text>
                )}
              </div>

              <Button
                size="xs"
                variant="subtle"
                color="gray"
                leftSection={<IconCheck size={14} />}
                onClick={() => concludeMutation.mutate(item.codigo)}
                loading={concludeMutation.isPending}
              >
                Nada a fazer
              </Button>
            </Group>

            {/* Conhecimento já existente sobre este código */}
            {item.conhecimento && item.conhecimento.length > 0 && (
              <Group gap="xs" mb="sm" align="center">
                <Text size="xs" fw={500} c="dimmed">
                  Já ensinado:
                </Text>
                {item.conhecimento.map((con, idx) => (
                  <Badge
                    key={idx}
                    size="sm"
                    color={con.relacao === "igual" ? "green" : "orange"}
                    variant="light"
                  >
                    {con.relacao === "igual" ? "=" : "~"} {con.codigo}
                    {con.obs ? ` (${con.obs})` : ""}
                  </Badge>
                ))}
              </Group>
            )}

            {/* Sugestões do assistente */}
            {item.sugestoes && item.sugestoes.length > 0 ? (
              <Stack gap="xs" mt="xs">
                <Text size="xs" fw={600} c="dimmed">
                  Pode ser igual a:
                </Text>
                {item.sugestoes.map((sug: ReviewSuggestion) => (
                  <Card
                    key={sug.codigo}
                    withBorder
                    p="xs"
                    radius="sm"
                    bg="var(--mantine-color-default-hover)"
                  >
                    <Group justify="space-between" wrap="wrap">
                      <div style={{ flex: 1, minWidth: 240 }}>
                        <Group gap="xs">
                          <Text fw={600} size="sm">
                            {sug.codigo}
                          </Text>
                          <Text size="sm" c="dimmed">
                            {sug.nome}
                          </Text>
                          {sug.produto_id !== null && (
                            <Badge
                              size="xs"
                              color={sug.estoque_total > 0 ? "teal" : "gray"}
                              variant="light"
                            >
                              Estoque: {sug.estoque_total}
                            </Badge>
                          )}
                        </Group>
                        {sug.motivo && (
                          <Text size="xs" c="dimmed" mt={2}>
                            Motivo: {sug.motivo}
                          </Text>
                        )}
                      </div>

                      <Group gap="xs">
                        <Button
                          size="xs"
                          color="green"
                          variant="light"
                          leftSection={<IconCheck size={14} />}
                          onClick={() =>
                            handleQuickRule(item.codigo, sug.codigo, "igual")
                          }
                          loading={addRuleMutation.isPending}
                        >
                          É igual
                        </Button>
                        <Button
                          size="xs"
                          color="orange"
                          variant="light"
                          leftSection={<IconArrowsExchange size={14} />}
                          onClick={() =>
                            handleOpenSimilarModal(item.codigo, sug.codigo)
                          }
                          loading={addRuleMutation.isPending}
                        >
                          É similar
                        </Button>
                        <Tooltip label="Marca como diferente para o assistente nunca sugerir">
                          <Button
                            size="xs"
                            color="red"
                            variant="subtle"
                            leftSection={<IconX size={14} />}
                            onClick={() =>
                              handleQuickRule(item.codigo, sug.codigo, "diferente")
                            }
                            loading={addRuleMutation.isPending}
                          >
                            Não serve
                          </Button>
                        </Tooltip>
                      </Group>
                    </Group>
                  </Card>
                ))}
              </Stack>
            ) : (
              <Text size="xs" c="dimmed" mt="xs" fs="italic">
                Nenhuma sugestão: o cadastro e o catálogo não ligam este código a outro. Use
                "Ensinar outro código".
              </Text>
            )}

            <Group justify="flex-start" mt="sm">
              <Button
                size="xs"
                variant="light"
                leftSection={<IconPlus size={14} />}
                onClick={() => handleOpenCustomModal(item.codigo)}
              >
                Ensinar outro código
              </Button>
            </Group>
          </Card>
        );
      })}

      {/* Modal para "É similar" (ressalva) */}
      <Modal
        opened={similarModal.opened}
        onClose={() => setSimilarModal((prev) => ({ ...prev, opened: false }))}
        title="Definir peça similar com ressalva"
        centered
      >
        <Stack gap="sm">
          <Text size="sm">
            Relacionando <strong>{similarModal.codigoA}</strong> com{" "}
            <strong>{similarModal.codigoB}</strong> como <em>similar</em>.
          </Text>
          <TextInput
            label="Ressalva / Observação"
            description="Ex.: 'muda o atuador', 'precisa trocar a carcaça fria'"
            placeholder="Qual é a diferença ou adaptação necessária?"
            value={similarModal.ressalva}
            onChange={(e) => {
              const value = e.currentTarget.value;
              setSimilarModal((prev) => ({ ...prev, ressalva: value }));
            }}
            autoFocus
          />
          <Group justify="flex-end" mt="md">
            <Button
              variant="default"
              onClick={() => setSimilarModal((prev) => ({ ...prev, opened: false }))}
            >
              Cancelar
            </Button>
            <Button color="orange" onClick={handleConfirmSimilar}>
              Salvar como Similar
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Modal para Ensinar Código Livre */}
      <Modal
        opened={customModal.opened}
        onClose={() => setCustomModal((prev) => ({ ...prev, opened: false }))}
        title={`Ensinar relação para o código ${customModal.codigoA}`}
        centered
      >
        <Stack gap="sm">
          <TextInput
            label="Código original (pesquisado)"
            value={customModal.codigoA}
            disabled
          />
          <TextInput
            label="Código equivalente / relacionado"
            placeholder="Ex.: 4031195 ou 758160-0007"
            value={customModal.codigoB}
            onChange={(e) => {
              const value = e.currentTarget.value;
              setCustomModal((prev) => ({ ...prev, codigoB: value }));
            }}
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
            value={customModal.tipo}
            onChange={(val) =>
              setCustomModal((prev) => ({
                ...prev,
                tipo: (val as KnowledgeRelation) || "igual",
              }))
            }
            allowDeselect={false}
          />
          <Textarea
            label="Observação (opcional)"
            placeholder="Ex.: muda a flange de entrada, carcaça quente menor"
            value={customModal.observacao}
            onChange={(e) => {
              const value = e.currentTarget.value;
              setCustomModal((prev) => ({
                ...prev,
                observacao: value,
              }));
            }}
            rows={2}
          />
          <Group justify="flex-end" mt="md">
            <Button
              variant="default"
              onClick={() => setCustomModal((prev) => ({ ...prev, opened: false }))}
            >
              Cancelar
            </Button>
            <Button color="blue" onClick={handleConfirmCustom}>
              Salvar Regra
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
