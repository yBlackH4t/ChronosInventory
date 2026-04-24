import { Table } from "@mantine/core";
import dayjs from "dayjs";

import type { BackupListItemOut } from "../../lib/api";
import DataTable from "../ui/DataTable";
import EmptyState from "../ui/EmptyState";

function bytesToHuman(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

type BackupFilesTableProps = {
  backups: BackupListItemOut[];
};

export function BackupFilesTable({ backups }: BackupFilesTableProps) {
  return (
    <DataTable minWidth={720}>
      <Table striped highlightOnHover withTableBorder>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Nome</Table.Th>
            <Table.Th>Tamanho</Table.Th>
            <Table.Th>Data</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {backups.map((item) => (
            <Table.Tr key={item.name}>
              <Table.Td>{item.name}</Table.Td>
              <Table.Td>{bytesToHuman(item.size)}</Table.Td>
              <Table.Td>{dayjs(item.created_at).format("DD/MM/YYYY HH:mm")}</Table.Td>
            </Table.Tr>
          ))}
          {backups.length === 0 && (
            <Table.Tr>
              <Table.Td colSpan={3}>
                <EmptyState message="Nenhum backup encontrado." />
              </Table.Td>
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>
    </DataTable>
  );
}
