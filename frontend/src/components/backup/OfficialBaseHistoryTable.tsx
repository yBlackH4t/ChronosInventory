import { ActionIcon, Loader, Table, Text } from "@mantine/core";
import { IconTrash } from "@tabler/icons-react";
import dayjs from "dayjs";

import type { OfficialBaseHistoryItemOut } from "../../lib/api";
import DataTable from "../ui/DataTable";

type OfficialBaseHistoryTableProps = {
  items: OfficialBaseHistoryItemOut[];
  loading: boolean;
  canDelete: boolean;
  deletePending: boolean;
  onDelete: (item: OfficialBaseHistoryItemOut) => void;
};

export function OfficialBaseHistoryTable({
  items,
  loading,
  canDelete,
  deletePending,
  onDelete,
}: OfficialBaseHistoryTableProps) {
  if (items.length === 0) {
    return (
      <>
        {loading && <Loader size="xs" />}
        <Text size="sm" c="dimmed">
          Nenhuma publicacao historica encontrada no servidor local.
        </Text>
      </>
    );
  }

  return (
    <DataTable minWidth={880}>
      <Table striped highlightOnHover withTableBorder>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Publicado em</Table.Th>
            <Table.Th>Origem</Table.Th>
            <Table.Th>App</Table.Th>
            <Table.Th>Produtos</Table.Th>
            <Table.Th>Movs</Table.Th>
            <Table.Th>Notas</Table.Th>
            <Table.Th>Acoes</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {items.map((item) => (
            <Table.Tr key={item.manifest_path}>
              <Table.Td>{dayjs(item.manifest.published_at).format("DD/MM/YYYY HH:mm")}</Table.Td>
              <Table.Td>{item.manifest.publisher_name || item.manifest.publisher_machine}</Table.Td>
              <Table.Td>{item.manifest.app_version}</Table.Td>
              <Table.Td>{item.manifest.products_count ?? "-"}</Table.Td>
              <Table.Td>{item.manifest.movements_count ?? "-"}</Table.Td>
              <Table.Td>{item.manifest.notes || "-"}</Table.Td>
              <Table.Td>
                {canDelete ? (
                  <ActionIcon
                    color="red"
                    variant="light"
                    onClick={() => onDelete(item)}
                    loading={deletePending}
                    aria-label="Excluir publicacao"
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                ) : (
                  "-"
                )}
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </DataTable>
  );
}
