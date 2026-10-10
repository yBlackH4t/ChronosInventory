import { useState, type ReactNode } from "react";
import {
  Badge,
  Button,
  CopyButton,
  Group,
  Loader,
  Paper,
  ScrollArea,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  Text,
} from "@mantine/core";
import {
  IconCheck,
  IconCopy,
  IconExternalLink,
  IconInfoCircle,
  IconSettings,
  IconTags,
  IconTruck,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/apiClient";
import { brandColor } from "../../lib/brands";
import { useProfileScope } from "../../state/profileScope";
import type { ProductCatalogLink } from "../../types/api";

type ProductCatalogTabProps = {
  productId: number;
};

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <Text size="xs" fw={600} c="dimmed" tt="uppercase" lts="0.06em">
      {children}
    </Text>
  );
}

function CodeChip({ code }: { code: string }) {
  return (
    <CopyButton value={code} timeout={1600}>
      {({ copied, copy }) => (
        <button
          type="button"
          className="code-chip"
          data-copied={copied || undefined}
          onClick={copy}
          title={copied ? "Copiado" : "Copiar código"}
        >
          {code}
          <span className="code-chip-icon">
            {copied ? <IconCheck size={12} /> : <IconCopy size={12} />}
          </span>
        </button>
      )}
    </CopyButton>
  );
}

function RelatedPieceCard({
  rel,
  onOpenProduct,
}: {
  rel: ProductCatalogLink["relacionados"][0];
  onOpenProduct: (productId: number, code: string) => void;
}) {
  const { data: searchRes, isLoading } = useQuery({
    queryKey: ["related-piece-stock", rel.codigo],
    queryFn: ({ signal }) =>
      api.listProducts({ query: rel.codigo, page: 1, page_size: 1 }, { signal }),
    staleTime: 60_000,
  });

  const matchedProduct = searchRes?.data?.[0];
  const inStock = (matchedProduct?.total_stock ?? 0) > 0;

  return (
    <Paper
      p="xs"
      radius="sm"
      withBorder
      bg="var(--mantine-color-default-hover)"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      <Group gap="xs" wrap="nowrap" style={{ flex: 1, minWidth: 200 }}>
        <Badge
          size="xs"
          variant="light"
          color={rel.tipo === "COMPONENTE" ? "cyan" : "indigo"}
          style={{ flexShrink: 0 }}
        >
          {rel.tipo === "COMPONENTE" ? "Conjunto Central" : "Turbo Completo"}
        </Badge>
        <CodeChip code={rel.codigo} />
        {rel.descricao && (
          <Text size="xs" c="dimmed" truncate="end">
            {rel.descricao}
          </Text>
        )}
      </Group>

      <Group gap="xs" wrap="nowrap">
        {isLoading ? (
          <Loader size="xs" />
        ) : matchedProduct ? (
          <Group gap={6} wrap="nowrap">
            <Badge
              size="xs"
              variant={inStock ? "filled" : "outline"}
              color={inStock ? "teal" : "gray"}
            >
              {inStock
                ? `Estoque: ${matchedProduct.total_stock} un`
                : "Sem saldo"}
            </Badge>
            <Button
              size="compact-xs"
              variant="subtle"
              color="blue"
              leftSection={<IconExternalLink size={12} />}
              onClick={() => onOpenProduct(matchedProduct.id, rel.codigo)}
            >
              Ver no catálogo
            </Button>
          </Group>
        ) : (
          <Badge size="xs" variant="dot" color="gray">
            Não cadastrado
          </Badge>
        )}
      </Group>
    </Paper>
  );
}

export function ProductCatalogTab({ productId }: ProductCatalogTabProps) {
  const navigate = useNavigate();
  const { profileScopeKey } = useProfileScope();
  const [selected, setSelected] = useState<{ productId: number; index: string }>(
    { productId, index: "0" },
  );
  const activeCatalogIndex =
    selected.productId === productId ? selected.index : "0";

  const catalogQuery = useQuery({
    queryKey: ["produto-catalogo", profileScopeKey, productId],
    queryFn: ({ signal }) => api.getProductCatalog(productId, { signal }),
    staleTime: 5 * 60_000,
  });

  if (catalogQuery.isLoading) {
    return (
      <Group justify="center" gap="sm" p="xl">
        <Loader size="sm" />
        <Text size="sm" c="dimmed">
          Carregando catálogo…
        </Text>
      </Group>
    );
  }

  const data = catalogQuery.data?.data;

  if (!data || data.vinculos.length === 0) {
    return (
      <div className="stock-tile" style={{ padding: 20 }}>
        <Group justify="center" gap="sm">
          <IconInfoCircle size={18} stroke={1.5} color="var(--text-subtle)" />
          <Text size="sm" c="dimmed">
            {catalogQuery.isError
              ? "Não foi possível carregar o catálogo deste produto."
              : "Nenhuma ficha de catálogo vinculada a este produto ainda."}
          </Text>
        </Group>
      </div>
    );
  }

  const currentLink: ProductCatalogLink =
    data.vinculos[Number(activeCatalogIndex)] || data.vinculos[0];

  return (
    <Stack gap="md">
      {/* Mais de uma ficha (ex: turbo completo e variação) */}
      {data.vinculos.length > 1 && (
        <ScrollArea type="never">
          <SegmentedControl
            size="xs"
            value={activeCatalogIndex}
            onChange={(index) => setSelected({ productId, index })}
            data={data.vinculos.map((v, idx) => ({
              value: String(idx),
              label: `${v.fonte} ${v.codigo}`,
            }))}
          />
        </ScrollArea>
      )}

      {/* Cabeçalho da ficha selecionada */}
      <Stack gap={4}>
        <Group gap="xs" wrap="wrap">
          <Text fw={650} size="md">
            {currentLink.fonte}
          </Text>
          <Text size="md" c="dimmed" className="mono">
            {currentLink.codigo}
          </Text>
          <Badge size="xs" variant="default">
            {currentLink.grupo || "TURBO"}
          </Badge>
        </Group>
        <Text size="sm" c="dimmed">
          {currentLink.descricao}
          {currentLink.modelo ? ` · Modelo ${currentLink.modelo}` : ""}
        </Text>
      </Stack>

      <Tabs defaultValue="marcas" key={`${productId}-${activeCatalogIndex}`}>
        <Tabs.List>
          <Tabs.Tab value="marcas" leftSection={<IconTags size={15} stroke={1.5} />}>
            Equivalências{" "}
            <Text component="span" size="xs" c="dimmed" className="num">
              {currentLink.referencias.length}
            </Text>
          </Tabs.Tab>
          <Tabs.Tab value="aplicacoes" leftSection={<IconTruck size={15} stroke={1.5} />}>
            Aplicações{" "}
            <Text component="span" size="xs" c="dimmed" className="num">
              {currentLink.aplicacoes.length}
            </Text>
          </Tabs.Tab>
          <Tabs.Tab value="ficha" leftSection={<IconSettings size={15} stroke={1.5} />}>
            Ficha técnica{" "}
            <Text component="span" size="xs" c="dimmed" className="num">
              {currentLink.especificacoes.length}
            </Text>
          </Tabs.Tab>
        </Tabs.List>

        {/* 1. Equivalências por marca */}
        <Tabs.Panel value="marcas" pt="md">
          <Stack gap="md">
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
              {currentLink.referencias.map((refGroup) => (
                <div key={refGroup.fabricante} className="stock-tile">
                  <Group gap="xs" mb={8}>
                    <Badge
                      color={brandColor(refGroup.fabricante)}
                      variant="light"
                      size="sm"
                    >
                      {refGroup.fabricante}
                    </Badge>
                    <Text size="xs" c="dimmed" className="num">
                      {refGroup.numeros.length}{" "}
                      {refGroup.numeros.length === 1 ? "código" : "códigos"}
                    </Text>
                  </Group>

                  <ScrollArea.Autosize mah={180}>
                    <Group gap={6} wrap="wrap">
                      {refGroup.numeros.map((num) => (
                        <CodeChip key={num} code={num} />
                      ))}
                    </Group>
                  </ScrollArea.Autosize>
                </div>
              ))}
            </SimpleGrid>

            {/* Componentes relacionados (ex: conjunto central e turbos equivalentes) */}
            {currentLink.relacionados.length > 0 && (
              <Stack gap={8}>
                <SectionLabel>
                  {currentLink.grupo === "TURBO"
                    ? "Conjuntos Centrais & Componentes Compatíveis"
                    : "Turbos & Peças Relacionadas"}
                </SectionLabel>
                <Stack gap={6}>
                  {currentLink.relacionados.map((rel, idx) => (
                    <RelatedPieceCard
                      key={idx}
                      rel={rel}
                      onOpenProduct={(relProductId, relCode) => {
                        navigate(
                          `/produtos?search=${encodeURIComponent(
                            relCode,
                          )}&openId=${relProductId}`,
                        );
                      }}
                    />
                  ))}
                </Stack>
              </Stack>
            )}
          </Stack>
        </Tabs.Panel>

        {/* 2. Aplicações e motorizações */}
        <Tabs.Panel value="aplicacoes" pt="md">
          {currentLink.aplicacoes.length === 0 ? (
            <Text size="sm" c="dimmed" p="md">
              Nenhuma aplicação informada nesta ficha.
            </Text>
          ) : (
            <div className="table-shell">
              <ScrollArea.Autosize mah={360}>
                <Table verticalSpacing="xs">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Montadora</Table.Th>
                      <Table.Th>Veículo / modelo</Table.Th>
                      <Table.Th>Motor</Table.Th>
                      <Table.Th>Tipo</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {currentLink.aplicacoes.map((app, idx) => (
                      <Table.Tr key={idx}>
                        <Table.Td fw={600}>{app.montadora || "Diversos"}</Table.Td>
                        <Table.Td>{app.veiculo}</Table.Td>
                        <Table.Td>
                          {app.motor ? (
                            <Text size="sm">{app.motor}</Text>
                          ) : (
                            <Text size="sm" c="var(--text-subtle)">
                              —
                            </Text>
                          )}
                        </Table.Td>
                        <Table.Td>
                          {app.tipo ? (
                            <Text size="xs" c="dimmed">
                              {app.tipo}
                            </Text>
                          ) : (
                            <Text size="sm" c="var(--text-subtle)">
                              —
                            </Text>
                          )}
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </ScrollArea.Autosize>
            </div>
          )}
        </Tabs.Panel>

        {/* 3. Ficha técnica (medidas e especificações) */}
        <Tabs.Panel value="ficha" pt="md">
          {currentLink.especificacoes.length === 0 ? (
            <Text size="sm" c="dimmed" p="md">
              Nenhuma especificação técnica informada nesta ficha.
            </Text>
          ) : (
            <div className="table-shell">
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing={0}>
                {currentLink.especificacoes.map((spec, idx) => (
                  <Group
                    key={idx}
                    justify="space-between"
                    wrap="nowrap"
                    px="sm"
                    py={8}
                    style={{ borderBottom: "1px solid var(--border)" }}
                  >
                    <Text size="xs" c="dimmed">
                      {spec.campo}
                    </Text>
                    <Text size="xs" fw={600} ta="right">
                      {spec.valor}
                    </Text>
                  </Group>
                ))}
              </SimpleGrid>
            </div>
          )}

          {currentLink.observacao && (
            <Stack gap={6} mt="md">
              <SectionLabel>Observações de aplicação / montagem</SectionLabel>
              <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
                {currentLink.observacao}
              </Text>
            </Stack>
          )}
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
