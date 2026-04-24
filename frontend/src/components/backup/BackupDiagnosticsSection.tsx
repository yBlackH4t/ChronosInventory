import { Button, Card, Group, Stack, Text, Title } from "@mantine/core";

type BackupDiagnosticsSectionProps = {
  onExportDiagnostics: () => void;
  exportLoading: boolean;
  onRestorePreUpdate: () => void;
  restorePreUpdateLoading: boolean;
};

export function BackupDiagnosticsSection({
  onExportDiagnostics,
  exportLoading,
  onRestorePreUpdate,
  restorePreUpdateLoading,
}: BackupDiagnosticsSectionProps) {
  return (
    <Stack gap="lg">
      <Card withBorder>
        <Stack gap="md">
          <Title order={4}>Diagnostico e suporte</Title>
          <Text size="sm" c="dimmed">
            Gere um pacote tecnico para suporte e use o restore pre-update quando uma atualizacao nao sobe corretamente.
          </Text>
          <Group>
            <Button variant="light" onClick={onExportDiagnostics} loading={exportLoading}>
              Exportar diagnostico
            </Button>
            <Button variant="light" color="orange" onClick={onRestorePreUpdate} loading={restorePreUpdateLoading}>
              Restaurar pre-update
            </Button>
          </Group>
        </Stack>
      </Card>

      <Card withBorder>
        <Stack gap="xs">
          <Title order={4}>Quando usar</Title>
          <Text size="sm" c="dimmed">
            `Exportar diagnostico` ajuda a enviar logs e informacoes do ambiente para suporte. `Restaurar pre-update` funciona como rollback rapido depois de uma atualizacao com problema.
          </Text>
        </Stack>
      </Card>
    </Stack>
  );
}
