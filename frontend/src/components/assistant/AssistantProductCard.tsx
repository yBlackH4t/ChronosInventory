import { Badge, Button, Card, Group, SimpleGrid, Stack, Text } from "@mantine/core";
import { IconExternalLink } from "@tabler/icons-react";
import { useNavigate } from "react-router-dom";

import type { AssistantProduct } from "../../types/assistant";
import type { ProductVisualItem } from "../../lib/api";
import { detectBrand, detectCondition } from "../../lib/brands";
import { VERSION_COLORS, stockLevelColor } from "../../lib/semantic";
import ProductThumb from "../products/ProductThumb";

// Resposta "temos ou não temos" como cartão: foto, marca, versão e saldo por local.
export default function AssistantProductCard({
  product,
  visual,
}: {
  product: AssistantProduct;
  visual?: ProductVisualItem;
}) {
  const navigate = useNavigate();
  const brand = detectBrand(product.nome);
  const condition = detectCondition(product.nome);
  const core = product.estoque_total > 0 ? null : product.montada_no_conjunto ?? null;
  const temos = product.estoque_total > 0 || !!core;
  // Montada pelo conjunto: os números são do conjunto, que é onde se fatura.
  const locais = Object.entries(core ? core.estoque_por_local : product.estoque_por_local);
  const total = core ? core.estoque_total : product.estoque_total;
  const openProduct = () =>
    navigate(`/produtos?search=${encodeURIComponent(product.nome)}&openId=${product.id}`);

  return (
    <Card p="sm" radius="md" withBorder mt="xs">
      <Group gap="sm" wrap="nowrap" align="flex-start">
        <ProductThumb size={56} base64={visual?.thumb_base64} alt={product.nome} />
        <Stack gap={6} miw={0} style={{ flex: 1 }}>
          <Group gap={6} wrap="wrap">
            <Badge size="sm" color={temos ? "success" : "danger"} variant="filled">
              {core ? "Temos montada" : temos ? "Temos" : "Sem estoque"}
            </Badge>
            {brand ? (
              <Badge size="xs" color={brand.color} variant="light">
                {brand.label}
              </Badge>
            ) : null}
            <Badge size="xs" color={VERSION_COLORS[condition.label]} variant="outline">
              {condition.label}
            </Badge>
          </Group>
          <Text fw={600} size="sm" lineClamp={2}>
            {product.nome}
          </Text>
          {core ? (
            <Text size="xs" c="dimmed">
              Faturar pelo conjunto #{core.id} {core.nome}
            </Text>
          ) : null}
          <SimpleGrid cols={{ base: 2, sm: Math.min(Math.max(locais.length, 1) + 1, 4) }} spacing={6}>
            {locais.map(([local, qtde]) => (
              <div key={local} className="stock-tile" style={{ padding: "6px 10px" }}>
                <Text size="xs" c="dimmed" truncate>
                  {local}
                </Text>
                <Text fz={20} fw={700} lh={1.2} className="num" c={`var(--mantine-color-${stockLevelColor(qtde)}-light-color)`}>
                  {qtde}
                </Text>
              </div>
            ))}
            <div className="stock-tile" style={{ padding: "6px 10px" }}>
              <Text size="xs" c="dimmed">
                {core ? "Montadas" : "Total"}
              </Text>
              <Text
                fz={20}
                fw={700}
                lh={1.2}
                className="num"
                c={`var(--mantine-color-${stockLevelColor(total)}-light-color)`}
              >
                {total}
              </Text>
            </div>
          </SimpleGrid>
          <Group gap="xs">
            <Button
              size="compact-sm"
              variant="light"
              leftSection={<IconExternalLink size={14} />}
              onClick={openProduct}
            >
              Abrir produto
            </Button>
            {core ? (
              <Button
                size="compact-sm"
                variant="subtle"
                color="violet"
                onClick={() => navigate(`/produtos?openId=${core.id}`)}
              >
                Abrir conjunto
              </Button>
            ) : null}
          </Group>
        </Stack>
      </Group>
    </Card>
  );
}
