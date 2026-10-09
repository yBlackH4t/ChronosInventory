import { Button } from "@mantine/core";
import { IconFileTypePdf } from "@tabler/icons-react";
import ReportShell from "./ReportShell";

type Props = {
  loading: boolean;
  onGenerate: () => void;
};

export default function ReportsStockSection({ loading, onGenerate }: Props) {
  return (
    <ReportShell
      title="Estoque atual"
      description="Todos os itens ativos com o saldo atual de cada filial. Ideal para conferência rápida, auditorias e contagem."
      footerHint="Usa os saldos do momento da geração."
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
