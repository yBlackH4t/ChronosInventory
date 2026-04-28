import { Badge, Button, Card, Group, Select, Stack, Text } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";

type Scope = "AMBOS" | "CANOAS" | "PF";

type Props = {
  salesDateFrom: Date | null;
  setSalesDateFrom: (value: Date | null) => void;
  salesDateTo: Date | null;
  setSalesDateTo: (value: Date | null) => void;
  salesScope: Scope;
  setSalesScope: (value: Scope) => void;
  scopeOptions: { value: Scope; label: string }[];
  loading: boolean;
  onGenerate: () => void;
};

export default function ReportsSalesSection({
  salesDateFrom,
  setSalesDateFrom,
  salesDateTo,
  setSalesDateTo,
  salesScope,
  setSalesScope,
  scopeOptions,
  loading,
  onGenerate,
}: Props) {
  return (
    <Card withBorder>
      <Stack gap="md">
        <Group justify="space-between">
          <Text fw={600}>Relatorio de vendas reais</Text>
          <Badge variant="outline" color="blue">
            SAIDA + OPERACAO_NORMAL
          </Badge>
        </Group>
        <Text size="sm" c="dimmed">
          Mostra apenas vendas reais. Transferencia externa, ajuste e devolucao ficam fora deste documento.
        </Text>
        <Group align="end" wrap="wrap">
          <DatePickerInput label="De" value={salesDateFrom} onChange={(value) => setSalesDateFrom(value as Date | null)} w={180} />
          <DatePickerInput label="Ate" value={salesDateTo} onChange={(value) => setSalesDateTo(value as Date | null)} w={180} />
          <Select
            label="Escopo"
            data={scopeOptions}
            value={salesScope}
            onChange={(value) => setSalesScope((value as Scope) || "AMBOS")}
            allowDeselect={false}
            w={180}
          />
          <Button onClick={onGenerate} loading={loading} disabled={!salesDateFrom || !salesDateTo}>
            Gerar relatorio de vendas
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}
