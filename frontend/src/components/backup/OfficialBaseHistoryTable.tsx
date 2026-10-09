import { ActionIcon, Group, Loader, Table, Text } from "@mantine/core";
import { IconTrash } from "@tabler/icons-react";
import dayjs from "dayjs";

import type { OfficialBaseHistoryItemOut } from "../../lib/api";

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
      <Group gap="xs" px="lg" py="md">
        {loading && <Loader size="xs" />}
        <Text size="sm" c="dimmed">
          Nenhuma publicação encontrada no servidor local.
        </Text>
      </Group>
    );
  }

  return (
    <Table.ScrollContainer minWidth={820}>
      <Table verticalSpacing="xs">
        <Table.Thead>
          <Table.Tr>
            <Table.Th w={150}>Publicado em</Table.Th>
            <Table.Th w={160}>Origem</Table.Th>
            <Table.Th w={80}>App</Table.Th>
            <Table.Th w={90} ta="right">
              Produtos
            </Table.Th>
            <Table.Th w={90} ta="right">
              Movs
            </Table.Th>
            <Table.Th>Notas</Table.Th>
            <Table.Th w={56} />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {items.map((item) => (
            <Table.Tr key={item.manifest_path}>
              <Table.Td className="num">
                {dayjs(item.manifest.published_at).format("DD/MM/YYYY HH:mm")}
              </Table.Td>
              <Table.Td>
                {item.manifest.publisher_name ||
                  item.manifest.publisher_machine}
              </Table.Td>
              <Table.Td c="dimmed" className="mono">
                {item.manifest.app_version}
              </Table.Td>
              <Table.Td ta="right" className="num">
                {item.manifest.products_count ?? "—"}
              </Table.Td>
              <Table.Td ta="right" className="num">
                {item.manifest.movements_count ?? "—"}
              </Table.Td>
              <Table.Td c="dimmed">
                <Text size="sm" lineClamp={1}>
                  {item.manifest.notes || "—"}
                </Text>
              </Table.Td>
              <Table.Td>
                {canDelete ? (
                  <Group justify="flex-end" className="row-actions">
                    <ActionIcon
                      color="gray"
                      className="action-danger"
                      onClick={() => onDelete(item)}
                      loading={deletePending}
                      aria-label="Excluir publicação"
                    >
                      <IconTrash size={16} stroke={1.5} />
                    </ActionIcon>
                  </Group>
                ) : null}
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
