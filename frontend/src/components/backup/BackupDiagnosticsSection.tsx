import { Button, Divider, Group, Text } from "@mantine/core";

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
    <div className="surface-panel" style={{ overflow: "hidden" }}>
      <Group justify="space-between" wrap="wrap" gap="sm" px="lg" py="md">
        <div style={{ flex: 1, minWidth: 240 }}>
          <Text size="sm" fw={600}>
            Exportar diagnóstico
          </Text>
          <Text size="xs" c="dimmed">
            Pacote com logs e informações do ambiente para enviar ao suporte.
          </Text>
        </div>
        <Button
          variant="default"
          onClick={onExportDiagnostics}
          loading={exportLoading}
        >
          Exportar
        </Button>
      </Group>
      <Divider color="var(--border)" />
      <Group justify="space-between" wrap="wrap" gap="sm" px="lg" py="md">
        <div style={{ flex: 1, minWidth: 240 }}>
          <Text size="sm" fw={600}>
            Restaurar pré-atualização
          </Text>
          <Text size="xs" c="dimmed">
            Volta para o backup feito automaticamente antes da última
            atualização. Use se o app não subir corretamente depois de atualizar.
          </Text>
        </div>
        <Button
          variant="light"
          color="warning"
          onClick={onRestorePreUpdate}
          loading={restorePreUpdateLoading}
        >
          Restaurar
        </Button>
      </Group>
    </div>
  );
}
