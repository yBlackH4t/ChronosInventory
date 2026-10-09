import { Button, Select, SimpleGrid } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { IconFileTypePdf } from "@tabler/icons-react";
import ReportShell from "./ReportShell";

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
    <ReportShell
      title="Vendas reais"
      description="Somente saídas de operação normal. Devoluções, transferências e ajustes ficam de fora, para mostrar o que realmente foi vendido no período."
      footerHint={
        !salesDateFrom || !salesDateTo ? "Informe o período para gerar." : undefined
      }
      action={
        <Button
          onClick={onGenerate}
          loading={loading}
          disabled={!salesDateFrom || !salesDateTo}
          leftSection={<IconFileTypePdf size={16} stroke={1.5} />}
        >
          Gerar PDF
        </Button>
      }
    >
      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
        <DatePickerInput
          label="De"
          valueFormat="DD/MM/YYYY"
          value={salesDateFrom}
          onChange={(value) => setSalesDateFrom(value as Date | null)}
        />
        <DatePickerInput
          label="Até"
          valueFormat="DD/MM/YYYY"
          value={salesDateTo}
          onChange={(value) => setSalesDateTo(value as Date | null)}
        />
        <Select
          label="Filial"
          data={scopeOptions}
          value={salesScope}
          onChange={(value) => setSalesScope((value as Scope) || "AMBOS")}
          allowDeselect={false}
        />
      </SimpleGrid>
    </ReportShell>
  );
}
