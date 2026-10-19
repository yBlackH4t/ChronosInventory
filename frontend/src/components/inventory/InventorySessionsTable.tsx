import {
  ActionIcon,
  Group,
  Pagination,
  Table,
  Text,
  Tooltip,
} from "@mantine/core";
import { IconLock, IconTrash } from "@tabler/icons-react";
import dayjs from "dayjs";

import type { InventorySessionOut } from "../../lib/api";
import EmptyState from "../ui/EmptyState";
import { clickableRowProps } from "../../lib/clickableRow";

type InventorySessionsTableProps = {
  sessions: InventorySessionOut[];
  selectedSessionId: number | null;
  totalItems: number;
  page: number;
  totalPages: number;
  closePending: boolean;
  deletePending: boolean;
  onSelectSession: (session: InventorySessionOut) => void;
  onConfirmClose: (session: InventorySessionOut) => void;
  onConfirmDelete: (session: InventorySessionOut) => void;
  onPageChange: (page: number) => void;
};

const STATUS_META: Record<string, { label: string; color: string }> = {
  ABERTO: { label: "Em contagem", color: "var(--mantine-color-blue-filled)" },
  FECHADO: { label: "Fechada", color: "var(--text-subtle)" },
  APLICADO: { label: "Ajuste aplicado", color: "var(--success)" },
};

export function InventorySessionsTable({
  sessions,
  selectedSessionId,
  totalItems,
  page,
  totalPages,
  closePending,
  deletePending,
  onSelectSession,
  onConfirmClose,
  onConfirmDelete,
  onPageChange,
}: InventorySessionsTableProps) {
  return (
    <>
      <Table.ScrollContainer minWidth={860}>
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Sessão</Table.Th>
              <Table.Th w={150}>Local</Table.Th>
              <Table.Th w={160}>Status</Table.Th>
              <Table.Th w={200}>Progresso</Table.Th>
              <Table.Th w={110} ta="right">
                Divergentes
              </Table.Th>
              <Table.Th w={90} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {sessions.map((session) => {
              const status = STATUS_META[session.status] ?? {
                label: session.status,
                color: "var(--text-subtle)",
              };
              const progress =
                session.total_items > 0
                  ? (session.counted_items / session.total_items) * 100
                  : 0;
              return (
                <Table.Tr
                  key={session.id}
                  {...clickableRowProps(() => onSelectSession(session))}
                  className={
                    selectedSessionId === session.id ? "clickable-row row-selected" : "clickable-row"
                  }
                  aria-selected={selectedSessionId === session.id}
                >
                  <Table.Td>
                    <Text size="sm" fw={500} lineClamp={1}>
                      {session.nome}
                    </Text>
                    <Text size="xs" c="dimmed" className="num">
                      #{session.id} · {dayjs(session.created_at).format("DD/MM/YYYY HH:mm")}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">
                      {session.local_label ?? `Local #${session.location_id}`}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Group gap={6} wrap="nowrap">
                      <span
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: "50%",
                          background: status.color,
                        }}
                      />
                      <Text size="sm">{status.label}</Text>
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Group gap="sm" wrap="nowrap">
                      <div className="inline-bar" style={{ flex: 1 }}>
                        <span
                          style={{
                            width: `${progress}%`,
                            background: "var(--mantine-color-blue-filled)",
                          }}
                        />
                      </div>
                      <Text size="xs" c="dimmed" className="num" w={70} ta="right">
                        {session.counted_items}/{session.total_items}
                      </Text>
                    </Group>
                  </Table.Td>
                  <Table.Td ta="right">
                    <Text
                      size="sm"
                      fw={session.divergent_items > 0 ? 600 : 400}
                      c={session.divergent_items > 0 ? undefined : "var(--text-subtle)"}
                      className="num"
                    >
                      {session.divergent_items}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Group
                      gap={2}
                      justify="flex-end"
                      wrap="nowrap"
                      className="row-actions"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <Tooltip label="Fechar sessão">
                        <ActionIcon
                          color="gray"
                          aria-label="Fechar sessão"
                          disabled={session.status !== "ABERTO"}
                          loading={closePending}
                          onClick={() => onConfirmClose(session)}
                        >
                          <IconLock size={16} stroke={1.5} />
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label="Excluir sessão">
                        <ActionIcon
                          color="gray"
                          className="action-danger"
                          aria-label="Excluir sessão"
                          disabled={session.status === "APLICADO"}
                          loading={deletePending}
                          onClick={() => onConfirmDelete(session)}
                        >
                          <IconTrash size={16} stroke={1.5} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              );
            })}
            {sessions.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={6} style={{ borderBottom: 0 }}>
                  <EmptyState
                    message="Nenhuma sessão de inventário"
                    description="Crie uma sessão para começar a contagem."
                  />
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>

      {totalPages > 1 && (
        <Group justify="space-between" px="lg" py="sm">
          <Text size="xs" c="dimmed">
            {totalItems} sessões
          </Text>
          <Pagination size="sm" value={page} onChange={onPageChange} total={totalPages} />
        </Group>
      )}
    </>
  );
}
