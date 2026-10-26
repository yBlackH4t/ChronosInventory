import { Button } from "@mantine/core";
import { IconFileTypePdf } from "@tabler/icons-react";

import { useStockTotals } from "../../hooks/useStockTotals";
import AnimatedNumber from "../ui/AnimatedNumber";
import ReportPaperPreview from "./ReportPaperPreview";
import ReportShell from "./ReportShell";

type Props = {
  loading: boolean;
  onGenerate: () => void;
};

export default function ReportsStockSection({ loading, onGenerate }: Props) {
  const totals = useStockTotals().data?.data;
  const locations = totals?.locations ?? [];
  const facts = totals
    ? [
        { label: "Unidades em estoque", value: <AnimatedNumber value={totals.total_geral} />, tone: "accent" as const },
        ...locations.map((loc) => ({
          label: loc.location_label || loc.location_name,
          value: <AnimatedNumber value={loc.total} />,
        })),
        { label: "Itens zerados", value: <AnimatedNumber value={totals.zerados} />, tone: "warning" as const },
      ]
    : [];

  return (
    <ReportShell
      title="Estoque atual"
      description="Todos os itens ativos com o saldo atual de cada filial. Ideal para conferência rápida, auditorias e contagem."
      footerHint="Usa os saldos do momento da geração."
      preview={
        <ReportPaperPreview
          title="Estoque atual"
          columns={["Produto", ...locations.map((loc) => loc.location_label || loc.location_name), "Total"]}
          facts={facts}
        />
      }
      action={
        <Button
          onClick={onGenerate}
          loading={loading}
          leftSection={<IconFileTypePdf size={16} stroke={1.5} />}
        >
          Gerar PDF
        </Button>
      }
    />
  );
}
