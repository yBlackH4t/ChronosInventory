import { Button, Group, Modal, Select, Stack, Text, TextInput } from "@mantine/core";
import type { InventoryLocation } from "../../lib/api";

type InventoryCreateSessionModalProps = {
  opened: boolean;
  onClose: () => void;
  sessionName: string;
  onSessionNameChange: (value: string) => void;
  sessionLocationId: number | null;
  onSessionLocationIdChange: (value: number | null) => void;
  sessionObservacao: string;
  onSessionObservacaoChange: (value: string) => void;
  activeLocations: InventoryLocation[];
  onCreateSession: () => void;
  isLoading: boolean;
};

export function InventoryCreateSessionModal({
  opened,
  onClose,
  sessionName,
  onSessionNameChange,
  sessionLocationId,
  onSessionLocationIdChange,
  sessionObservacao,
  onSessionObservacaoChange,
  activeLocations,
  onCreateSession,
  isLoading,
}: InventoryCreateSessionModalProps) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Stack gap={0}>
          <Text fw={650}>Nova sessão de inventário</Text>
          <Text size="xs" c="dimmed">
            A sessão carrega o saldo atual do local para conferência.
          </Text>
        </Stack>
      }
      size="md"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (sessionName.trim().length === 0) return;
          onCreateSession();
        }}
      >
        <Stack gap="sm">
          <TextInput
            label="Nome da sessão"
            placeholder="Ex: Inventário mensal — fevereiro"
            value={sessionName}
            onChange={(event) => onSessionNameChange(event.currentTarget.value)}
            data-autofocus
            required
          />
          <Select
            label="Local"
            data={activeLocations.map((loc) => ({
              value: String(loc.id),
              label: loc.label || loc.name,
            }))}
            value={sessionLocationId ? String(sessionLocationId) : null}
            onChange={(value) =>
              onSessionLocationIdChange(value ? Number(value) : null)
            }
            allowDeselect={false}
          />
          <TextInput
            label="Observação"
            placeholder="Opcional"
            value={sessionObservacao}
            onChange={(event) =>
              onSessionObservacaoChange(event.currentTarget.value)
            }
          />
          <Group justify="flex-end" mt="sm">
            <Button variant="default" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              type="submit"
              loading={isLoading}
              disabled={sessionName.trim().length === 0}
            >
              Criar sessão
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
