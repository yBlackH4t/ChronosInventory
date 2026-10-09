import { Badge, Group, List, Stack, Text } from "@mantine/core";

import PageHeader from "../components/ui/PageHeader";
import { RELEASE_ENTRIES } from "../lib/changelog";

export default function ReleaseNotesPage() {
  return (
    <Stack gap="lg" maw={860}>
      <PageHeader
        title="Novidades"
        subtitle="Histórico de mudanças do Chronos Inventory."
      />

      <div className="surface-panel" style={{ overflow: "hidden" }}>
        {RELEASE_ENTRIES.map((entry, index) => (
          <div
            key={entry.version}
            style={{
              padding: "18px 20px",
              borderTop: index > 0 ? "1px solid var(--border)" : undefined,
            }}
          >
            <Group justify="space-between" align="baseline" wrap="wrap" mb={8}>
              <Group gap="xs">
                <Text fw={650} className="mono">
                  v{entry.version}
                </Text>
                {index === 0 && (
                  <Badge size="xs" variant="light">
                    Atual
                  </Badge>
                )}
                <Text size="sm" c="dimmed">
                  {entry.title}
                </Text>
              </Group>
              <Text size="xs" c="dimmed" className="num">
                {entry.date}
              </Text>
            </Group>
            <List spacing={4} size="sm" c="dimmed">
              {entry.highlights.map((item) => (
                <List.Item key={item}>{item}</List.Item>
              ))}
            </List>
          </div>
        ))}
      </div>
    </Stack>
  );
}
