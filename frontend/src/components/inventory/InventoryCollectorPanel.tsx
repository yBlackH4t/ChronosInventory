import type { KeyboardEvent, RefObject } from "react";
import { Badge, Button, Group, NumberInput, Table, Text, TextInput, Stack } from "@mantine/core";

import DataTable from "../ui/DataTable";
import FilterToolbar from "../ui/FilterToolbar";

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
  return (
    <FilterToolbar>
      <Stack gap="xs">
        <Group justify="space-between" wrap="wrap">
          <Text fw={600} size="sm">
            Coletor por etiqueta
          </Text>
          <Badge color={active ? "green" : "gray"} variant="light">
            {active ? "Modo bip ativo" : "Modo bip inativo"}
          </Badge>
        </Group>
        <Text size="xs" c="dimmed">
          Fluxo simples: iniciar modo bip (zera fisico para 0), depois so bipar item por item.
          O sistema compara automaticamente e mostra faltando/a mais na divergencia.
        </Text>
        <Group align="end" wrap="wrap">
          <Button
            color={active ? "gray" : "blue"}
            variant={active ? "light" : "filled"}
            onClick={onInitialize}
            loading={initializing}
            disabled={sessionStatus !== "ABERTO" || initializing || loading}
          >
            Iniciar modo bip
          </Button>
          <Button variant="subtle" onClick={onStop} disabled={!active || initializing || loading}>
            Encerrar modo bip
          </Button>
          <TextInput
            label="Etiqueta"
            placeholder="Bipe ou digite CI-123 / 4031196"
            value={collectorInput}
            onChange={(event) => onCollectorInputChange(event.currentTarget.value)}
            onKeyDown={onCollectorInputKeyDown}
            ref={collectorInputRef}
            w={320}
            disabled={sessionStatus !== "ABERTO" || loading || !active}
          />
          <NumberInput
            label="Incremento"
            min={1}
            max={200}
            value={collectorStep}
            onChange={(value) => onCollectorStepChange(Math.max(1, Math.round(Number(value || 1))))}
            w={120}
            disabled={sessionStatus !== "ABERTO" || loading || !active}
          />
          <Button onClick={onRun} loading={loading} disabled={sessionStatus !== "ABERTO" || !active}>
            Somar
          </Button>
          <Button variant="subtle" onClick={onClearLog} disabled={log.length === 0 || loading}>
            Limpar log
          </Button>
        </Group>
        {log.length > 0 && (
          <DataTable minWidth={780}>
            <Table withTableBorder striped>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Hora</Table.Th>
                  <Table.Th>Entrada</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Mensagem</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {log.map((entry) => (
                  <Table.Tr key={entry.id}>
                    <Table.Td>{entry.at}</Table.Td>
                    <Table.Td>{entry.input}</Table.Td>
                    <Table.Td>
                      <Badge color={entry.status === "OK" ? "green" : "red"} variant="light">
                        {entry.status}
                      </Badge>
                    </Table.Td>
                    <Table.Td>{entry.message}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </DataTable>
        )}
      </Stack>
    </FilterToolbar>
  );
}
