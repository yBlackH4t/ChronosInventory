import {
  Button,
  Card,
  Group,
  Select,
  Stack,
  TextInput,
  Title,
} from "@mantine/core";
import type { InventoryLocation } from "../../lib/api";

type InventoryCreateSessionCardProps = {
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

export function InventoryCreateSessionCard({
  sessionName,
  onSessionNameChange,
  sessionLocationId,
  onSessionLocationIdChange,
  sessionObservacao,
  onSessionObservacaoChange,
  activeLocations,
  onCreateSession,
  isLoading,
}: InventoryCreateSessionCardProps) {
  return (
    <Card withBorder>
      <Stack>
        <Title order={4}>Nova sessao de inventario</Title>
        <Group align="end" wrap="wrap">
          <TextInput
            label="Nome da sessao"
            placeholder="Ex: Inventario mensal - fevereiro"
            value={sessionName}
            onChange={(event) => onSessionNameChange(event.currentTarget.value)}
            w={320}
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
            w={180}
          />
          <TextInput
            label="Observacao"
            value={sessionObservacao}
            onChange={(event) =>
              onSessionObservacaoChange(event.currentTarget.value)
            }
            w={320}
          />
          <Button
            onClick={onCreateSession}
            loading={isLoading}
            disabled={sessionName.trim().length === 0}
          >
            Criar sessao
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}
