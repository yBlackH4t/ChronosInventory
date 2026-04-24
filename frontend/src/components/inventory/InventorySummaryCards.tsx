import { Card, SimpleGrid, Text } from "@mantine/core";

import type { InventorySessionSummaryOut } from "../../lib/api";

type InventorySummaryCardsProps = {
  summary: InventorySessionSummaryOut;
  onSelectFilter: (filter: "NOT_COUNTED" | "MISSING" | "SURPLUS" | "MATCHED" | "PENDING") => void;
};

export function InventorySummaryCards({ summary, onSelectFilter }: InventorySummaryCardsProps) {
  return (
    <SimpleGrid cols={{ base: 2, md: 5 }}>
      <Card withBorder p="sm" onClick={() => onSelectFilter("NOT_COUNTED")} style={{ cursor: "pointer" }}>
        <Text size="xs" c="dimmed">Nao contados</Text>
        <Text fw={700} size="xl">{summary.not_counted_items}</Text>
      </Card>
      <Card withBorder p="sm" onClick={() => onSelectFilter("MISSING")} style={{ cursor: "pointer" }}>
        <Text size="xs" c="dimmed">Faltando no fisico</Text>
        <Text fw={700} size="xl" c="red">{summary.missing_items}</Text>
      </Card>
      <Card withBorder p="sm" onClick={() => onSelectFilter("SURPLUS")} style={{ cursor: "pointer" }}>
        <Text size="xs" c="dimmed">Sobrando no fisico</Text>
        <Text fw={700} size="xl" c="green">{summary.surplus_items}</Text>
      </Card>
      <Card withBorder p="sm" onClick={() => onSelectFilter("MATCHED")} style={{ cursor: "pointer" }}>
        <Text size="xs" c="dimmed">Conferidos OK</Text>
        <Text fw={700} size="xl">{summary.matched_items}</Text>
      </Card>
      <Card withBorder p="sm" onClick={() => onSelectFilter("PENDING")} style={{ cursor: "pointer" }}>
        <Text size="xs" c="dimmed">Pendentes de ajuste</Text>
        <Text fw={700} size="xl" c="orange">{summary.pending_items}</Text>
      </Card>
    </SimpleGrid>
  );
}
