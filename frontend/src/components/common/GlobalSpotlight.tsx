import { useNavigate } from "react-router-dom";
import { Spotlight, type SpotlightActionData } from "@mantine/spotlight";
import {
  IconDashboard,
  IconBox,
  IconHistory,
  IconReportAnalytics,
  IconSettings,
  IconSearch,
} from "@tabler/icons-react";
import { useState } from "react";

export function GlobalSpotlight() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  const staticActions: SpotlightActionData[] = [
    {
      id: "dashboard",
      label: "Dashboard",
      description: "Visão geral do sistema",
      onClick: () => navigate("/"),
      leftSection: <IconDashboard size={24} stroke={1.5} />,
    },
    {
      id: "produtos",
      label: "Produtos & Estoque",
      description: "Gerenciar itens do estoque",
      onClick: () => navigate("/produtos"),
      leftSection: <IconBox size={24} stroke={1.5} />,
    },
    {
      id: "historico",
      label: "Histórico de Movimentações",
      description: "Entradas, saídas e transferências",
      onClick: () => navigate("/historico"),
      leftSection: <IconHistory size={24} stroke={1.5} />,
    },
    {
      id: "relatorios",
      label: "Relatórios",
      description: "Geração de PDFs de estoque e curvas",
      onClick: () => navigate("/relatorios"),
      leftSection: <IconReportAnalytics size={24} stroke={1.5} />,
    },
    {
      id: "configuracoes",
      label: "Configurações",
      description: "Ajustes do sistema",
      onClick: () => navigate("/configuracoes"),
      leftSection: <IconSettings size={24} stroke={1.5} />,
    },
  ];

  // If there's a query, add an action to search products with that query
  const dynamicActions: SpotlightActionData[] = query.trim().length > 0 
    ? [
        {
          id: "search-product",
          label: `Buscar produtos por "${query}"`,
          description: "Pesquisar em toda a base de itens",
          onClick: () => navigate(`/produtos?search=${encodeURIComponent(query)}`),
          leftSection: <IconSearch size={24} stroke={1.5} color="var(--mantine-color-blue-filled)" />,
        }
      ] 
    : [];

  return (
    <Spotlight
      actions={[...dynamicActions, ...staticActions]}
      nothingFound="Nenhum atalho encontrado..."
      highlightQuery
      query={query}
      onQueryChange={setQuery}
      searchProps={{
        leftSection: <IconSearch size={20} stroke={1.5} />,
        placeholder: "Para onde você quer ir? Ou busque um produto...",
      }}
      shortcut={["mod + k", "mod + p", "/"]}
      clearQueryOnClose
      radius="md"
    />
  );
}
