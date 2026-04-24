import { Badge, Button, Group, Pagination, Table, Text } from "@mantine/core";
import dayjs from "dayjs";

import type { InventorySessionOut } from "../../lib/api";
import DataTable from "../ui/DataTable";
import EmptyState from "../ui/EmptyState";

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
      <DataTable minWidth={980}>
        <Table striped highlightOnHover withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>ID</Table.Th>
              <Table.Th>Nome</Table.Th>
              <Table.Th>Local</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Itens</Table.Th>
              <Table.Th>Contados</Table.Th>
              <Table.Th>Divergentes</Table.Th>
              <Table.Th>Criado em</Table.Th>
              <Table.Th>Acoes</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {sessions.map((session) => (
              <Table.Tr key={session.id} className={selectedSessionId === session.id ? "row-selected" : ""}>
                <Table.Td>{session.id}</Table.Td>
                <Table.Td>{session.nome}</Table.Td>
                <Table.Td>{session.local}</Table.Td>
                <Table.Td>
                  <Badge
                    color={session.status === "ABERTO" ? "blue" : session.status === "FECHADO" ? "gray" : "green"}
                    variant="light"
                  >
                    {session.status}
                  </Badge>
                </Table.Td>
                <Table.Td>{session.total_items}</Table.Td>
                <Table.Td>{session.counted_items}</Table.Td>
                <Table.Td>{session.divergent_items}</Table.Td>
                <Table.Td>{dayjs(session.created_at).format("DD/MM/YYYY HH:mm")}</Table.Td>
                <Table.Td>
                  <Group gap="xs">
                    <Button
                      size="xs"
                      variant={selectedSessionId === session.id ? "filled" : "light"}
                      onClick={() => onSelectSession(session)}
                    >
                      Abrir
                    </Button>
                    <Button
                      size="xs"
                      color="orange"
                      variant="light"
                      disabled={session.status !== "ABERTO"}
                      loading={closePending}
                      onClick={() => onConfirmClose(session)}
                    >
                      Fechar
                    </Button>
                    <Button
                      size="xs"
                      color="red"
                      variant="light"
                      disabled={session.status === "APLICADO"}
                      loading={deletePending}
                      onClick={() => onConfirmDelete(session)}
                    >
                      Excluir
                    </Button>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
            {sessions.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={9}>
                  <EmptyState message="Nenhuma sessao de inventario criada." />
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </DataTable>

      <Group justify="space-between">
        <Text size="sm" c="dimmed">
          Total: {totalItems}
        </Text>
        <Pagination value={page} onChange={onPageChange} total={totalPages} />
      </Group>
    </>
  );
}
