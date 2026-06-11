import { Badge, Button, Card, Group, Select, Stack, Text, ThemeIcon } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { IconCash } from "@tabler/icons-react";

type Scope = string;

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
    <Card 
      withBorder 
      shadow="sm"
      p="xl"
      style={{
        background: 'rgba(255, 255, 255, 0.03)',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: 'var(--mantine-radius-xl)',
        overflow: 'hidden'
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "-50px",
          right: "-50px",
          width: "150px",
          height: "150px",
          background: "radial-gradient(circle, rgba(33, 150, 243, 0.15) 0%, rgba(0,0,0,0) 70%)",
          borderRadius: "50%",
          zIndex: 0,
        }}
      />

      <Stack gap="lg" style={{ position: 'relative', zIndex: 1 }}>
        <Group justify="space-between" align="flex-start">
          <Group>
            <ThemeIcon size={48} radius="md" variant="light" color="blue">
              <IconCash size={24} />
            </ThemeIcon>
            <div>
              <Text fw={700} size="lg" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Relatório de Vendas Reais
              </Text>
              <Text size="sm" c="dimmed">
                Histórico de saídas de operação normal
              </Text>
            </div>
          </Group>
          <Badge variant="gradient" gradient={{ from: 'blue', to: 'cyan' }}>
            PDF
          </Badge>
        </Group>

        <Text size="sm" c="dimmed" lh={1.6}>
          Filtra exclusivamente as movimentações classificadas como <b>Operação Normal de Saída</b>. 
          Isso remove ruídos como devoluções, transferências e ajustes, garantindo uma visão 
          pura do que realmente foi vendido ou consumido no período.
        </Text>

        <Group align="end" wrap="wrap" mt="sm">
          <DatePickerInput
            label="Período de Inicio"
            value={salesDateFrom}
            onChange={(value) => setSalesDateFrom(value as Date | null)}
            w={180}
            variant="filled"
          />
          <DatePickerInput
            label="Período de Fim"
            value={salesDateTo}
            onChange={(value) => setSalesDateTo(value as Date | null)}
            w={180}
            variant="filled"
          />
          <Select
            label="Local de Estoque"
            data={scopeOptions}
            value={salesScope}
            onChange={(value) => setSalesScope((value as Scope) || "AMBOS")}
            allowDeselect={false}
            w={180}
            variant="filled"
          />
        </Group>

        <Button
          onClick={onGenerate}
          loading={loading}
          disabled={!salesDateFrom || !salesDateTo}
          variant="gradient"
          gradient={{ from: 'blue', to: 'cyan' }}
          size="md"
          radius="md"
          fullWidth
          mt="sm"
        >
          Gerar Relatório de Vendas
        </Button>
      </Stack>
    </Card>
  );
}
