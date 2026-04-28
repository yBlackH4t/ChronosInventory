import { Badge, Button, Card, Group, Stack, Text } from "@mantine/core";

type Props = {
  loading: boolean;
  onGenerate: () => void;
};

export default function ReportsStockSection({ loading, onGenerate }: Props) {
  return (
    <Card withBorder>
      <Stack gap="md">
        <Group justify="space-between">
          <Text fw={600}>Relatorio de estoque</Text>
          <Badge variant="outline" color="gray">
            PDF
          </Badge>
        </Group>
        <Text size="sm" c="dimmed">
          Lista os itens ativos com saldo atual por local. Ideal para conferencia rapida do estoque visivel no sistema.
        </Text>
        <Button onClick={onGenerate} loading={loading}>
          Gerar relatorio de estoque
        </Button>
      </Stack>
    </Card>
  );
}
