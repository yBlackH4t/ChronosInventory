import { Badge, Card, List, Stack, Text, Title } from "@mantine/core";

import PageHeader from "../components/ui/PageHeader";
import { RELEASE_ENTRIES } from "../lib/changelog";

export default function ReleaseNotesPage() {
  return (
    <Stack gap="lg">
      <PageHeader
        title="Novidades"
        subtitle="Historico de mudancas do Chronos Inventory para facilitar adocao e suporte."
      />

      {RELEASE_ENTRIES.map((entry) => (
        <Card key={entry.version} withBorder>
          <Stack gap="xs">
            <Stack gap={2}>
              <Title order={4}>
                v{entry.version} - {entry.title}
              </Title>
              <Text size="sm" c="dimmed">
                {entry.date}
              </Text>
            </Stack>
            <Badge variant="light">Release</Badge>
            <List spacing="xs" size="sm">
              {entry.highlights.map((item) => (
                <List.Item key={item}>{item}</List.Item>
              ))}
            </List>
          </Stack>
        </Card>
      ))}
    </Stack>
  );
}
