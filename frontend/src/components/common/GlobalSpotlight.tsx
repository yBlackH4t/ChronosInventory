import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge, Group, Kbd, Loader, Text } from "@mantine/core";
import { useDebouncedValue, useHotkeys } from "@mantine/hooks";
import {
  Spotlight,
  spotlight,
  type SpotlightActionData,
  type SpotlightActionGroupData,
} from "@mantine/spotlight";
import { IconBox, IconSearch } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";

import { ADMIN_NAV, PRIMARY_NAV, type NavItem } from "../../app/navigation";
import { api } from "../../lib/apiClient";
import { detectBrand, detectCondition } from "../../lib/brands";

export function GlobalSpotlight() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [debouncedQuery] = useDebouncedValue(query.trim(), 200);

  const { data: searchResults, isFetching } = useQuery({
    queryKey: ["spotlight-products", debouncedQuery],
    queryFn: ({ signal }) =>
      api.listProducts(
        { query: debouncedQuery, page: 1, page_size: 5 },
        { signal },
      ),
    enabled: debouncedQuery.length >= 2,
    staleTime: 15_000,
  });

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

  const dynamicActions: SpotlightActionGroupData[] = useMemo(() => {
    if (!query.trim()) return [];

    const productsFound = searchResults?.data ?? [];
    const actions: SpotlightActionData[] = [];

    // Produtos reais retornados pela busca
    if (productsFound.length > 0) {
      for (const prod of productsFound) {
        const brand = detectBrand(prod.nome);
        const condition = detectCondition(prod.nome);
        const inStock = prod.total_stock > 0;

        actions.push({
          id: `product-${prod.id}`,
          label: prod.nome,
          description: `#${prod.id}${
            prod.inventories
              ? ` · ${Object.entries(prod.inventories)
                  .filter(([, q]) => q > 0)
                  .map(([loc, q]) => `${loc}: ${q}`)
                  .join(" | ")}`
              : ""
          }`,
          leftSection: (
            <IconBox
              size={18}
              stroke={1.5}
              color={inStock ? "var(--mantine-color-success-6)" : "var(--mantine-color-gray-6)"}
            />
          ),
          rightSection: (
            <Group gap={4}>
              {brand && (
                <Badge size="xs" color={brand.color} variant="light">
                  {brand.label}
                </Badge>
              )}
              {condition && (
                <Badge size="xs" color={condition.color} variant="outline">
                  {condition.label}
                </Badge>
              )}
              <Badge
                size="xs"
                variant={inStock ? "filled" : "outline"}
                color={inStock ? "success" : "gray"}
              >
                {inStock ? `${prod.total_stock} un` : "Sem saldo"}
              </Badge>
            </Group>
          ),
          onClick: () => {
            navigate(
              `/produtos?search=${encodeURIComponent(query)}&openId=${prod.id}`,
            );
          },
        });
      }
    }

    // Ação para abrir busca completa na tela de produtos
    actions.push({
      id: "search-product-all",
      label: `Ver todos os produtos com "${query}"`,
      description: "Pesquisar códigos, modelos e equivalências no catálogo",
      onClick: () => navigate(`/produtos?search=${encodeURIComponent(query)}`),
      leftSection: <IconSearch size={18} stroke={1.5} color="var(--accent)" />,
    });

    return [
      {
        group: "Produtos e Estoque",
        actions,
      },
    ];
  }, [query, searchResults?.data, navigate]);

  // "/" only outside text fields, so it never steals a typed slash.
  useHotkeys([["/", () => spotlight.open()]]);

  return (
    <Spotlight
      actions={[...navGroups, ...dynamicActions]}
      nothingFound={
        isFetching ? (
          <Group justify="center" gap="xs" p="md">
            <Loader size="xs" />
            <Text size="sm" c="dimmed">
              Consultando estoque...
            </Text>
          </Group>
        ) : (
          "Nenhum atalho ou produto encontrado"
        )
      }
      highlightQuery
      query={query}
      onQueryChange={setQuery}
      searchProps={{
        leftSection: isFetching ? (
          <Loader size="xs" />
        ) : (
          <IconSearch size={18} stroke={1.5} />
        ),
        placeholder: "Buscar produto por código/nome ou ir para uma tela…",
      }}
      // Ctrl+K / Ctrl+P also work while typing in a field.
      shortcut={["mod + k", "mod + p"]}
      tagsToIgnore={[]}
      clearQueryOnClose
      radius="lg"
      scrollable
      maxHeight={460}
    />
  );
}
