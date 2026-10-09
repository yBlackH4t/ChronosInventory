import { Table } from "@mantine/core";
import dayjs from "dayjs";

import type { BackupListItemOut } from "../../lib/api";
import EmptyState from "../ui/EmptyState";

function bytesToHuman(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024)
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

type BackupFilesTableProps = {
  backups: BackupListItemOut[];
};

export function BackupFilesTable({ backups }: BackupFilesTableProps) {
  return (
    <Table.ScrollContainer minWidth={640}>
      <Table verticalSpacing="xs">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Arquivo</Table.Th>
            <Table.Th w={120} ta="right">
              Tamanho
            </Table.Th>
            <Table.Th w={170}>Criado em</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {backups.map((item) => (
            <Table.Tr key={item.name}>
              <Table.Td className="mono" fz="sm">
                {item.name}
              </Table.Td>
              <Table.Td ta="right" c="dimmed" className="num">
                {bytesToHuman(item.size)}
              </Table.Td>
              <Table.Td c="dimmed" className="num">
                {dayjs(item.created_at).format("DD/MM/YYYY HH:mm")}
              </Table.Td>
            </Table.Tr>
          ))}
          {backups.length === 0 && (
            <Table.Tr>
              <Table.Td colSpan={3} style={{ borderBottom: 0 }}>
                <EmptyState message="Nenhum backup encontrado" />
              </Table.Td>
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
