import { useNavigate } from "react-router-dom";
import { Kbd } from "@mantine/core";
import {
  Spotlight,
  type SpotlightActionData,
  type SpotlightActionGroupData,
} from "@mantine/spotlight";
import { IconSearch } from "@tabler/icons-react";
import { useState } from "react";
import { ADMIN_NAV, PRIMARY_NAV, type NavItem } from "../../app/navigation";

export function GlobalSpotlight() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  const toAction = (item: NavItem, index?: number): SpotlightActionData => ({
    id: item.to,
    label: item.label,
    description: item.description,
    onClick: () => navigate(item.to),
    leftSection: <item.icon size={18} stroke={1.5} />,
    rightSection:
      index !== undefined ? <Kbd size="xs">Alt {index + 1}</Kbd> : undefined,
  });

  const navGroups: SpotlightActionGroupData[] = [
    {
      group: "Ir para",
      actions: PRIMARY_NAV.map((item, index) => toAction(item, index)),
    },
    {
      group: "Administração",
      actions: ADMIN_NAV.flatMap((group) => group.items).map((item) =>
        toAction(item),
      ),
    },
  ];

  // Product search goes after screen matches: "mov" opens Movimentações,
  // while a part code (no screen match) leaves the search as the only option.
  const dynamicActions: SpotlightActionGroupData[] =
    query.trim().length > 0
      ? [
          {
            group: "Produtos",
            actions: [
              {
                id: "search-product",
                label: `Buscar produtos por "${query}"`,
                description: "Pesquisar códigos, modelos e equivalências",
                onClick: () =>
                  navigate(`/produtos?search=${encodeURIComponent(query)}`),
                leftSection: (
                  <IconSearch size={18} stroke={1.5} color="var(--accent)" />
                ),
              },
            ],
          },
        ]
      : [];

  return (
    <Spotlight
      actions={[...navGroups, ...dynamicActions]}
      nothingFound="Nenhum atalho encontrado"
      highlightQuery
      query={query}
      onQueryChange={setQuery}
      searchProps={{
        leftSection: <IconSearch size={18} stroke={1.5} />,
        placeholder: "Buscar produto ou ir para uma tela…",
      }}
      shortcut={["mod + k", "mod + p", "/"]}
      clearQueryOnClose
      radius="lg"
      scrollable
      maxHeight={420}
    />
  );
}
