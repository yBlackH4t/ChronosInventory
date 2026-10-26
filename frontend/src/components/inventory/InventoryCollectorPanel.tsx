import { useState, type KeyboardEvent, type RefObject } from "react";
import {
  Button,
  Collapse,
  Group,
  NumberInput,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import {
  IconBarcode,
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconPlayerPlay,
  IconPlayerStop,
  IconX,
} from "@tabler/icons-react";

type CollectorLogItem = {
  id: string;
  at: string;
  input: string;
  status: "OK" | "ERRO";
  message: string;
};

type InventoryCollectorPanelProps = {
  active: boolean;
  initializing: boolean;
  loading: boolean;
  sessionStatus: string;
  collectorInput: string;
  onCollectorInputChange: (value: string) => void;
  onCollectorInputKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  collectorInputRef: RefObject<HTMLInputElement | null>;
  collectorStep: number;
  onCollectorStepChange: (value: number) => void;
  onInitialize: () => void;
  onStop: () => void;
  onRun: () => void;
  log: CollectorLogItem[];
  onClearLog: () => void;
};

export function InventoryCollectorPanel({
  active,
  initializing,
  loading,
  sessionStatus,
  collectorInput,
  onCollectorInputChange,
  onCollectorInputKeyDown,
  collectorInputRef,
  collectorStep,
  onCollectorStepChange,
  onInitialize,
  onStop,
  onRun,
  log,
  onClearLog,
}: InventoryCollectorPanelProps) {
  const [logOpened, setLogOpened] = useState(false);
  const sessionOpen = sessionStatus === "ABERTO";

  return (
    <div className="surface-panel" style={{ padding: "14px 16px" }}>
      <Stack gap="sm">
        <Group justify="space-between" wrap="wrap" gap="sm">
          <Group gap="sm" wrap="nowrap">
            <span className="settings-item-icon">
              <IconBarcode size={18} stroke={1.5} />
            </span>
            <div>
              <Group gap={8}>
                <Text fw={600} size="sm">
                  Coletor por etiqueta
                </Text>
                <span
                  className="status-dot"
                  style={{
                    width: 6,
                    height: 6,
                    boxShadow: "none",
                    background: active ? "var(--success)" : "var(--text-subtle)",
                  }}
                />
                <Text size="xs" c="dimmed">
                  {active ? "Ativo" : "Inativo"}
                </Text>
              </Group>
              <Text size="xs" c="dimmed">
                Ao iniciar, o físico é zerado; depois é só bipar item por item.
              </Text>
            </div>
          </Group>
          {active ? (
            <Button
              variant="default"
              leftSection={<IconPlayerStop size={14} />}
              onClick={onStop}
              disabled={initializing || loading}
            >
              Encerrar
            </Button>
          ) : (
            <Button
              variant="default"
              leftSection={<IconPlayerPlay size={14} />}
              onClick={onInitialize}
              loading={initializing}
              disabled={!sessionOpen || initializing || loading}
            >
              Iniciar modo bip
            </Button>
          )}
        </Group>

        {active && (
          <Group align="flex-end" wrap="wrap" gap="sm">
            <TextInput
              size="md"
              placeholder="Bipe ou digite CI-123 / 4031196"
              aria-label="Etiqueta"
              leftSection={<IconBarcode size={18} stroke={1.5} />}
              value={collectorInput}
              onChange={(event) =>
                onCollectorInputChange(event.currentTarget.value)
              }
              onKeyDown={onCollectorInputKeyDown}
              ref={collectorInputRef}
              style={{ flex: 1, minWidth: 240 }}
              disabled={!sessionOpen || loading}
            />
            <NumberInput
              size="md"
              aria-label="Incremento"
              prefix="+"
              min={1}
              max={200}
              value={collectorStep}
              onChange={(value) =>
                onCollectorStepChange(Math.max(1, Math.round(Number(value || 1))))
              }
              w={90}
              disabled={!sessionOpen || loading}
            />
            <Button size="md" onClick={onRun} loading={loading} disabled={!sessionOpen}>
              Somar
            </Button>
          </Group>
        )}

        {log.length > 0 && (
          <div>
            <Group justify="space-between">
              <UnstyledButton onClick={() => setLogOpened((value) => !value)}>
                <Group gap={6}>
                  {logOpened ? (
                    <IconChevronDown size={14} />
                  ) : (
                    <IconChevronRight size={14} />
                  )}
                  <Text size="xs" c="dimmed" fw={500}>
                    Últimas leituras ({log.length})
                  </Text>
                </Group>
              </UnstyledButton>
              <Button
                variant="subtle"
                color="gray"
                size="xs"
                onClick={onClearLog}
                disabled={loading}
              >
                Limpar
              </Button>
            </Group>
            <Collapse expanded={logOpened}>
              <Stack gap={4} mt={6} mah={220} style={{ overflowY: "auto" }}>
                {log.map((entry) => (
                  <Group key={entry.id} gap="sm" wrap="nowrap">
                    {entry.status === "OK" ? (
                      <IconCheck size={14} color="var(--success)" />
                    ) : (
                      <IconX size={14} color="var(--danger)" />
                    )}
                    <Text size="xs" c="dimmed" className="num" w={64}>
                      {entry.at}
                    </Text>
                    <Text size="xs" className="mono" w={140} truncate>
                      {entry.input}
                    </Text>
                    <Text size="xs" c={entry.status === "OK" ? "dimmed" : "var(--danger)"} truncate>
                      {entry.message}
                    </Text>
                  </Group>
                ))}
              </Stack>
            </Collapse>
          </div>
        )}
      </Stack>
    </div>
  );
}
