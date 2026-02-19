import type { ReactNode } from "react";
import { Card, Table } from "@mantine/core";

type DataTableProps = {
  children: ReactNode;
  minWidth?: number;
};

export default function DataTable({ children, minWidth = 860 }: DataTableProps) {
  return (
    <Card className="table-shell" p="xs">
      <Table.ScrollContainer minWidth={minWidth}>
        {children}
      </Table.ScrollContainer>
    </Card>
  );
}
