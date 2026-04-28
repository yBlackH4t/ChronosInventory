import { Badge, Button, Card, Group, NumberInput, Select, Stack, Text } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";

type Scope = "AMBOS" | "CANOAS" | "PF";

type Props = {
  inactiveDays: number;
  setInactiveDays: (value: number) => void;
  inactiveDateTo: Date | null;
  setInactiveDateTo: (value: Date | null) => void;
  inactiveScope: Scope;
  setInactiveScope: (value: Scope) => void;
  scopeOptions: { value: Scope; label: string }[];
  loading: boolean;
  onGenerate: () => void;
};

export default function ReportsInactiveSection({
  inactiveDays,
  setInactiveDays,
  inactiveDateTo,
  setInactiveDateTo,
  inactiveScope,
  setInactiveScope,
  scopeOptions,
  loading,
  onGenerate,
}: Props) {
  return (
    <Card withBorder>
      <Stack gap="md">
        <Group justify="space-between">
          <Text fw={600}>Relatorio de estoque parado</Text>
          <Badge variant="outline" color="orange">
            Sem giro
          </Badge>
        </Group>
        <Text size="sm" c="dimmed">
          Mostra itens ativos com estoque atual e sem movimentacao no periodo definido. Bom para revisao de itens encalhados.
        </Text>
        <Group align="end" wrap="wrap">
          <NumberInput
            label="Dias sem movimentacao"
            min={1}
            max={365}
            value={inactiveDays}
            onChange={(value) => setInactiveDays(Number(value || 30))}
            w={180}
          />
          <DatePickerInput
            label="Data base"
            value={inactiveDateTo}
            onChange={(value) => setInactiveDateTo(value as Date | null)}
            w={180}
          />
          <Select
            label="Escopo"
            data={scopeOptions}
            value={inactiveScope}
            onChange={(value) => setInactiveScope((value as Scope) || "AMBOS")}
            allowDeselect={false}
            w={180}
          />
          <Button onClick={onGenerate} loading={loading} disabled={!inactiveDateTo}>
            Gerar relatorio de estoque parado
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}
