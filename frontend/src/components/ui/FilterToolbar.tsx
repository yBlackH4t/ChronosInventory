import type { ReactNode } from "react";
import { Card, Stack } from "@mantine/core";

type FilterToolbarProps = {
  children: ReactNode;
};

export default function FilterToolbar({ children }: FilterToolbarProps) {
  return (
    <Card className="filter-toolbar" p="sm">
      <Stack gap="sm">{children}</Stack>
    </Card>
  );
}
