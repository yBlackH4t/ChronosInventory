import {
  Badge,
  Button,
  Card,
  Group,
  NumberInput,
  Select,
  Stack,
  Text,
  ThemeIcon,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { IconHourglassEmpty } from "@tabler/icons-react";

type Scope = string;

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
          background: "radial-gradient(circle, rgba(255, 152, 0, 0.15) 0%, rgba(0,0,0,0) 70%)",
          borderRadius: "50%",
          zIndex: 0,
        }}
      />

      <Stack gap="lg" style={{ position: 'relative', zIndex: 1 }}>
        <Group justify="space-between" align="flex-start">
          <Group>
            <ThemeIcon size={48} radius="md" variant="light" color="orange">
              <IconHourglassEmpty size={24} />
            </ThemeIcon>
            <div>
              <Text fw={700} size="lg" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Relatório de Estoque Parado
              </Text>
              <Text size="sm" c="dimmed">
                Identifique itens sem giro ou encalhados
              </Text>
            </div>
          </Group>
          <Badge variant="gradient" gradient={{ from: 'orange', to: 'red' }}>
            PDF
          </Badge>
        </Group>

        <Text size="sm" c="dimmed" lh={1.6}>
          Analisa os itens que possuem saldo positivo em estoque, mas que <b>não tiveram nenhuma movimentação</b> 
          (entrada ou saída) no período definido. Ideal para criar promoções ou descontinuar itens que não giram.
        </Text>

        <Group align="end" wrap="wrap" mt="sm">
          <NumberInput
            label="Dias sem movimentação"
            min={1}
            max={365}
            value={inactiveDays}
            onChange={(value) => setInactiveDays(Number(value || 30))}
            w={180}
            variant="filled"
          />
          <DatePickerInput
            label="Data de Referência"
            value={inactiveDateTo}
            onChange={(value) => setInactiveDateTo(value as Date | null)}
            w={180}
            variant="filled"
          />
          <Select
            label="Local de Estoque"
            data={scopeOptions}
            value={inactiveScope}
            onChange={(value) => setInactiveScope((value as Scope) || "AMBOS")}
            allowDeselect={false}
            w={180}
            variant="filled"
          />
        </Group>

        <Button
          onClick={onGenerate}
          loading={loading}
          disabled={!inactiveDateTo}
          variant="gradient"
          gradient={{ from: 'orange', to: 'red' }}
          size="md"
          radius="md"
          fullWidth
          mt="sm"
        >
          Descobrir Itens Parados
        </Button>
      </Stack>
    </Card>
  );
}
