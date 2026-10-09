import type { ReactNode } from "react";
import { Table } from "@mantine/core";

type DataTableProps = {
  children: ReactNode;
  minWidth?: number;
};

export default function DataTable({
  children,
  minWidth = 860,
}: DataTableProps) {
  return (
    <div className="table-shell">
      <Table.ScrollContainer minWidth={minWidth}>
        {children}
      </Table.ScrollContainer>
    </div>
  );
}
