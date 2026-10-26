import { NumberInput, Select, SimpleGrid } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { IconFileTypePdf } from "@tabler/icons-react";
import ReportPaperPreview from "./ReportPaperPreview";
import ProgressButton from "../ui/ProgressButton";
import ReportShell from "./ReportShell";

type Scope = string;

type Props = {
  /** A última geração deu erro (sem o ✓ no botão). */
  failed?: boolean;
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
  failed = false,
}: Props) {
  const scopeLabel = scopeOptions.find((option) => option.value === inactiveScope)?.label ?? "Todas as filiais";
  return (
    <ReportShell
      preview={
        <ReportPaperPreview
          title="Estoque parado"
          columns={["Produto", "Saldo", "Última mov."]}
          facts={[
            { label: "Sem movimento há", value: `${inactiveDays.toLocaleString("pt-BR")} dias`, tone: "warning" },
            { label: "Filial", value: scopeLabel },
          ]}
        />
      }
      title="Estoque parado"
      description="Itens com saldo positivo que não tiveram nenhuma entrada ou saída no período. Útil para promoções ou para descontinuar o que não gira."
      footerHint={!inactiveDateTo ? "Informe a data de referência." : undefined}
      action={
        <ProgressButton
          onClick={onGenerate}
          busy={loading}
          failed={failed}
          busyLabel="Gerando PDF…"
          doneLabel="PDF pronto"
          disabled={!inactiveDateTo}
          leftSection={<IconFileTypePdf size={16} stroke={1.5} />}
        >
          Gerar PDF
        </ProgressButton>
      }
    >
      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
        <NumberInput
          label="Dias sem movimentação"
          suffix=" dias"
          min={1}
          max={365}
          value={inactiveDays}
          onChange={(value) => setInactiveDays(Number(value || 30))}
        />
        <DatePickerInput
          label="Data de referência"
          valueFormat="DD/MM/YYYY"
          value={inactiveDateTo}
          onChange={(value) => setInactiveDateTo(value as Date | null)}
        />
        <Select
          label="Filial"
          data={scopeOptions}
          value={inactiveScope}
          onChange={(value) => setInactiveScope((value as Scope) || "AMBOS")}
          allowDeselect={false}
        />
      </SimpleGrid>
    </ReportShell>
  );
}
