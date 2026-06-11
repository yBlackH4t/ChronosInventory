import { Badge, Button, Card, Group, Stack, Text, ThemeIcon } from "@mantine/core";
import { IconReportAnalytics } from "@tabler/icons-react";

type Props = {
  loading: boolean;
  onGenerate: () => void;
};

export default function ReportsStockSection({ loading, onGenerate }: Props) {
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
          background: "radial-gradient(circle, rgba(76, 175, 80, 0.15) 0%, rgba(0,0,0,0) 70%)",
          borderRadius: "50%",
          zIndex: 0,
        }}
      />
      
      <Stack gap="lg" style={{ position: 'relative', zIndex: 1 }}>
        <Group justify="space-between" align="flex-start">
          <Group>
            <ThemeIcon size={48} radius="md" variant="light" color="green">
              <IconReportAnalytics size={24} />
            </ThemeIcon>
            <div>
              <Text fw={700} size="lg" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Relatório de Estoque
              </Text>
              <Text size="sm" c="dimmed">
                Balanço geral de itens ativos
              </Text>
            </div>
          </Group>
          <Badge variant="gradient" gradient={{ from: 'green', to: 'teal' }}>
            PDF
          </Badge>
        </Group>

        <Text size="sm" c="dimmed" lh={1.6}>
          Lista todos os itens ativos do seu catálogo com seus respectivos saldos atuais, separados por local. 
          Esse documento é ideal para conferência rápida, auditorias e contagem de estoque visível no sistema.
        </Text>

        <Button 
          onClick={onGenerate} 
          loading={loading}
          variant="gradient"
          gradient={{ from: 'green', to: 'teal' }}
          size="md"
          radius="md"
          fullWidth
        >
          Gerar Relatório Completo
        </Button>
      </Stack>
    </Card>
  );
}
