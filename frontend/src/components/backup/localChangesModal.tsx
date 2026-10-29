import { List, Stack, Text } from "@mantine/core";
import { modals } from "@mantine/modals";
import dayjs from "dayjs";

import { ApiError } from "../../types/api";

export type LocalChangesSummary = {
  movimentacoes: number;
  produtos: number;
  exemplos: Array<{
    data_hora: string;
    tipo: string;
    produto_id: number;
    produto_nome: string;
    quantidade: number;
  }>;
  produtos_exemplos: Array<{ id: number; nome: string }>;
};

const TIPO_LABEL: Record<string, string> = {
  ENTRADA: "Entrada",
  SAIDA: "Saída",
  TRANSFERENCIA: "Transferência",
};

export function localChangesFromError(
  error: unknown,
): LocalChangesSummary | null {
  if (!(error instanceof ApiError) || error.code !== "lancamentos_locais")
    return null;
  return (error.details as LocalChangesSummary) ?? null;
}

/** Avisa o que só existe neste computador antes de a base oficial apagar. */
export function openLocalChangesModal(
  summary: LocalChangesSummary,
  onConfirm: () => void,
) {
  const extraMovements = summary.movimentacoes - summary.exemplos.length;
  modals.openConfirmModal({
    title: "Este computador tem lançamentos que a principal não tem",
    size: "lg",
    children: (
      <Stack gap="sm">
        <Text size="sm">
          Se baixar a base agora, estes lançamentos feitos aqui vão sumir deste
          computador. Peça para lançarem na máquina principal antes, ou cancele.
        </Text>
        {summary.movimentacoes > 0 && (
          <>
            <Text fw={600} size="sm">
              {summary.movimentacoes} movimentação(ões) só deste computador
            </Text>
            <List size="sm" spacing={4}>
              {summary.exemplos.map((item, index) => (
                <List.Item key={`${item.data_hora}-${index}`}>
                  {dayjs(item.data_hora).format("DD/MM HH:mm")} ·{" "}
                  {TIPO_LABEL[item.tipo] ?? item.tipo} de {item.quantidade} · #
                  {item.produto_id} {item.produto_nome}
                </List.Item>
              ))}
            </List>
            {extraMovements > 0 && (
              <Text size="xs" c="dimmed">
                e mais {extraMovements}.
              </Text>
            )}
          </>
        )}
        {summary.produtos > 0 && (
          <Text size="sm">
            {summary.produtos} produto(s) cadastrado(s) só aqui:{" "}
            {summary.produtos_exemplos
              .map((item) => `#${item.id} ${item.nome}`)
              .join(", ")}
          </Text>
        )}
        <Text size="xs" c="dimmed">
          Se continuar, o Chronos guarda um backup deste computador antes de
          trocar a base.
        </Text>
      </Stack>
    ),
    labels: { confirm: "Baixar mesmo assim", cancel: "Cancelar" },
    confirmProps: { color: "danger" },
    onConfirm,
  });
}
