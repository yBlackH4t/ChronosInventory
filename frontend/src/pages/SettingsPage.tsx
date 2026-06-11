import { Card, Group, SimpleGrid, Stack, Text, ThemeIcon } from "@mantine/core";
import {
  IconBuildingStore,
  IconDatabase,
  IconBuildingWarehouse,
  IconArrowsExchange,
  IconCheckbox,
  IconGauge,
} from "@tabler/icons-react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../components/ui/PageHeader";

export default function SettingsPage() {
  const navigate = useNavigate();

  const settingsCards = [
    {
      title: "Locais de Estoque",
      description: "Gerencie as filiais, lojas e depósitos onde os produtos podem ser armazenados.",
      icon: IconBuildingStore,
      color: "blue",
      path: "/locais",
    },
    {
      title: "Backup & Segurança",
      description: "Salve seus dados, crie pontos de restauração e gerencie o ambiente seguro.",
      icon: IconDatabase,
      color: "red",
      path: "/backup",
    },
    {
      title: "Perfis de Estoque",
      description: "Configure diferentes perfis e ambientes de sincronização do banco de dados.",
      icon: IconBuildingWarehouse,
      color: "grape",
      path: "/estoques",
    },
    {
      title: "Comparar Estoques",
      description: "Ferramenta para comparar divergências entre duas bases de dados diferentes.",
      icon: IconArrowsExchange,
      color: "teal",
      path: "/comparar-estoques",
    },
    {
      title: "Ativação em Massa",
      description: "Ative ou inative múltiplos produtos de uma vez no seu catálogo.",
      icon: IconCheckbox,
      color: "orange",
      path: "/itens-status",
    },
    {
      title: "Configurações de Setup",
      description: "Informações de setup e configurações primárias do sistema.",
      icon: IconGauge,
      color: "gray",
      path: "/setup",
    },
  ];

  return (
    <Stack gap="xl">
      <PageHeader
        title="Configurações do Sistema"
        subtitle="Gerencie locais, segurança, backups e perfis de funcionamento."
      />

      <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="lg">
        {settingsCards.map((card, idx) => (
          <Card
            key={idx}
            withBorder
            shadow="sm"
            p="xl"
            radius="md"
            style={{
              cursor: "pointer",
              transition: "transform 0.2s ease, box-shadow 0.2s ease",
              background: 'rgba(255, 255, 255, 0.03)',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              overflow: 'hidden',
              position: 'relative'
            }}
            onClick={() => navigate(card.path)}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-4px)";
              e.currentTarget.style.boxShadow = "var(--mantine-shadow-md)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "none";
              e.currentTarget.style.boxShadow = "var(--mantine-shadow-sm)";
            }}
          >
            <div
              style={{
                position: "absolute",
                top: "-40px",
                right: "-40px",
                width: "120px",
                height: "120px",
                background: `radial-gradient(circle, var(--mantine-color-${card.color}-3) 0%, rgba(0,0,0,0) 70%)`,
                opacity: 0.15,
                borderRadius: "50%",
                zIndex: 0,
              }}
            />
            <Stack gap="md" style={{ position: 'relative', zIndex: 1 }}>
              <ThemeIcon size={56} radius="lg" variant="light" color={card.color}>
                <card.icon size={28} stroke={1.5} />
              </ThemeIcon>
              <div>
                <Text fw={700} size="lg" style={{ fontFamily: 'Outfit, sans-serif' }}>
                  {card.title}
                </Text>
                <Text size="sm" c="dimmed" mt="xs" lh={1.5}>
                  {card.description}
                </Text>
              </div>
            </Stack>
          </Card>
        ))}
      </SimpleGrid>
    </Stack>
  );
}
