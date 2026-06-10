import { modals } from "@mantine/modals";
import { Text } from "@mantine/core";
import type { InventorySessionOut } from "../../lib/api";

type UseInventoryModalsProps = {
  closeSessionMutation: { mutate: (id: number) => void };
  deleteSessionMutation: { mutate: (id: number) => void };
  applyMutation: { mutate: (id: number) => void };
  onInitializeCollector: () => void;
};

export function useInventoryModals({
  closeSessionMutation,
  deleteSessionMutation,
  applyMutation,
  onInitializeCollector,
}: UseInventoryModalsProps) {
  const confirmCloseSession = (session: InventorySessionOut) => {
    modals.openConfirmModal({
      title: "Fechar sessao de inventario",
      children: (
        <Text size="sm">
          A sessao <strong>#{session.id}</strong> sera fechada e ficara somente
          para consulta. Depois disso, nao sera mais possivel editar contagens
          nem aplicar ajustes.
        </Text>
      ),
      labels: { confirm: "Fechar sessao", cancel: "Cancelar" },
      confirmProps: { color: "orange" },
      onConfirm: () => closeSessionMutation.mutate(session.id),
    });
  };

  const confirmDeleteSession = (session: InventorySessionOut) => {
    modals.openConfirmModal({
      title: "Excluir sessao de inventario",
      children: (
        <Text size="sm">
          A sessao <strong>#{session.id}</strong> sera removida com todas as
          contagens vinculadas. Essa acao so e permitida para sessoes sem
          ajustes aplicados.
        </Text>
      ),
      labels: { confirm: "Excluir sessao", cancel: "Cancelar" },
      confirmProps: { color: "red" },
      onConfirm: () => deleteSessionMutation.mutate(session.id),
    });
  };

  const confirmApply = (sessionId: number) => {
    modals.openConfirmModal({
      title: "Aplicar ajustes do inventario",
      children: (
        <Text size="sm">
          Esta operacao vai gerar movimentacoes de AJUSTE para todas as
          divergencias da sessao.
        </Text>
      ),
      labels: { confirm: "Aplicar ajustes", cancel: "Cancelar" },
      confirmProps: { color: "orange" },
      onConfirm: () => applyMutation.mutate(sessionId),
    });
  };

  const confirmInitializeCollectorMode = () => {
    modals.openConfirmModal({
      title: "Iniciar inventario por bip",
      children: (
        <Text size="sm">
          Essa acao zera o fisico de todos os itens da sessao para 0 e prepara o
          inventario por leitura. Itens nao bipados ficarao como divergencia
          negativa.
        </Text>
      ),
      labels: { confirm: "Iniciar e zerar fisico", cancel: "Cancelar" },
      confirmProps: { color: "orange" },
      onConfirm: onInitializeCollector,
    });
  };

  return {
    confirmCloseSession,
    confirmDeleteSession,
    confirmApply,
    confirmInitializeCollectorMode,
  };
}
