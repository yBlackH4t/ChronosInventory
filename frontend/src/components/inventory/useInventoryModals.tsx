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
      title: "Fechar sessão de inventário",
      children: (
        <Text size="sm">
          A sessão <strong>#{session.id}</strong> será fechada e ficará somente
          para consulta. Depois disso, não será mais possível editar contagens
          nem aplicar ajustes.
        </Text>
      ),
      labels: { confirm: "Fechar sessão", cancel: "Cancelar" },
      confirmProps: { color: "warning" },
      onConfirm: () => closeSessionMutation.mutate(session.id),
    });
  };

  const confirmDeleteSession = (session: InventorySessionOut) => {
    modals.openConfirmModal({
      title: "Excluir sessão de inventário",
      children: (
        <Text size="sm">
          A sessão <strong>#{session.id}</strong> será removida com todas as
          contagens vinculadas. Essa ação só é permitida para sessões sem
          ajustes aplicados.
        </Text>
      ),
      labels: { confirm: "Excluir sessão", cancel: "Cancelar" },
      confirmProps: { color: "danger" },
      onConfirm: () => deleteSessionMutation.mutate(session.id),
    });
  };

  const confirmApply = (sessionId: number) => {
    modals.openConfirmModal({
      title: "Aplicar ajustes do inventário",
      children: (
        <Text size="sm">
          Esta operação vai gerar movimentações de AJUSTE para todas as
          divergências da sessão.
        </Text>
      ),
      labels: { confirm: "Aplicar ajustes", cancel: "Cancelar" },
      confirmProps: { color: "warning" },
      onConfirm: () => applyMutation.mutate(sessionId),
    });
  };

  const confirmInitializeCollectorMode = () => {
    modals.openConfirmModal({
      title: "Iniciar inventário por bip",
      children: (
        <Text size="sm">
          Essa ação zera o físico de todos os itens da sessão para 0 e prepara o
          inventário por leitura. Itens não bipados ficarão como divergência
          negativa.
        </Text>
      ),
      labels: { confirm: "Iniciar e zerar físico", cancel: "Cancelar" },
      confirmProps: { color: "warning" },
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
