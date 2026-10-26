import { Select, SimpleGrid } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { IconFileTypePdf } from "@tabler/icons-react";
import dayjs from "dayjs";

import ReportPaperPreview from "./ReportPaperPreview";
import ProgressButton from "../ui/ProgressButton";
import ReportShell from "./ReportShell";

type Scope = string;

type Props = {
  /** A última geração deu erro (sem o ✓ no botão). */
  failed?: boolean;
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
  failed = false,
}: Props) {
  const days =
    salesDateFrom && salesDateTo ? dayjs(salesDateTo).diff(dayjs(salesDateFrom), "day") + 1 : null;
  const scopeLabel = scopeOptions.find((option) => option.value === salesScope)?.label ?? "Todas as filiais";
  return (
    <ReportShell
      preview={
        <ReportPaperPreview
          title="Vendas reais"
          columns={["Produto", "Qtd", "Data", "Filial"]}
          facts={[
            ...(days !== null ? [{ label: "Dias no período", value: days.toLocaleString("pt-BR"), tone: "accent" as const }] : []),
            { label: "Filial", value: scopeLabel },
          ]}
        />
      }
      title="Vendas reais"
      description="Somente saídas de operação normal. Devoluções, transferências e ajustes ficam de fora, para mostrar o que realmente foi vendido no período."
      footerHint={
        !salesDateFrom || !salesDateTo ? "Informe o período para gerar." : undefined
      }
      action={
        <ProgressButton
          onClick={onGenerate}
          busy={loading}
          failed={failed}
          busyLabel="Gerando PDF…"
          doneLabel="PDF pronto"
          disabled={!salesDateFrom || !salesDateTo}
          leftSection={<IconFileTypePdf size={16} stroke={1.5} />}
        >
          Gerar PDF
        </ProgressButton>
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
