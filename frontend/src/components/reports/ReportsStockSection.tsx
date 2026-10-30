import { IconFileTypePdf } from "@tabler/icons-react";

import { useStockTotals } from "../../hooks/useStockTotals";
import AnimatedNumber from "../ui/AnimatedNumber";
import ReportPaperPreview from "./ReportPaperPreview";
import ProgressButton from "../ui/ProgressButton";
import ReportShell from "./ReportShell";

type Props = {
  /** A última geração deu erro (sem o ✓ no botão). */
  failed?: boolean;
  loading: boolean;
  onGenerate: () => void;
};

export default function ReportsStockSection({ loading, onGenerate, failed = false }: Props) {
  const totals = useStockTotals().data?.data;
  // Com uma filial só, o quadro dela repetiria o total.
  const locations = (totals?.locations ?? []).length > 1 ? (totals?.locations ?? []) : [];
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
          columns={["Produto", ...locations.map((loc) => loc.location_label || loc.location_name), locations.length > 0 ? "Total" : "Saldo"]}
          facts={facts}
        />
      }
      action={
        <ProgressButton
          onClick={onGenerate}
          busy={loading}
          failed={failed}
          busyLabel="Gerando PDF…"
          doneLabel="PDF pronto"
          leftSection={<IconFileTypePdf size={16} stroke={1.5} />}
        >
          Gerar PDF
        </ProgressButton>
      }
    />
  );
}
