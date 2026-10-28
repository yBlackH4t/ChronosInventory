import { Button, Group, SimpleGrid, Stack, Text } from "@mantine/core";
import { IconArrowRight, IconStack2 } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { api } from "../../lib/apiClient";
import type { Product } from "../../lib/api";
import { assembledViaCore, productRef } from "../../lib/productView";

const CORE_NAME = /CONJ|CENTRAL|MIOLO/i;

type Props = {
  product: Product;
  locations: { value: string; label: string }[];
};

// Turbo montado que a empresa fatura pelo conjunto central (2.7.8). Na ficha do turbo mostra o
// saldo do conjunto, que é onde se movimenta e fatura; na ficha do conjunto, os turbos montados
// nele. O saldo é um só, o do conjunto: aqui ele é só mostrado.
export default function AssembledViaCorePanel({ product, locations }: Props) {
  const navigate = useNavigate();
  const assembled = assembledViaCore(product);
  const isCore = CORE_NAME.test(product.nome) && product.linked_count > 0;

  const linkedQuery = useQuery({
    queryKey: ["produtos", "vinculados", product.id],
    queryFn: ({ signal }) => api.getLinkedProducts(product.id, { signal }),
    enabled: isCore,
    staleTime: 60_000,
  });
  const turbos = (linkedQuery.data?.data ?? []).filter((p) => assembledViaCore(p));

  const open = (id: number) => navigate(`/produtos?openId=${id}`);

  if (assembled) {
    return (
      <div className="pm-assembled-panel">
        <Group justify="space-between" align="flex-start" wrap="nowrap" gap="sm">
          <Stack gap={2} miw={0} style={{ flex: 1 }}>
            <Group gap={6} wrap="nowrap">
              <IconStack2 size={16} stroke={1.75} className="pm-assembled-icon" aria-hidden />
              <Text size="sm" fw={600}>
                {assembled.total > 0 ? "Tem montada" : "Montada: sem saldo no conjunto"}
              </Text>
            </Group>
            <Text size="xs" c="dimmed">
              Faturada como {productRef(assembled.coreId, assembled.coreName)}. O saldo é do conjunto: movimente
              e fature por ele. Não soma no total desta peça.
            </Text>
          </Stack>
          <Button
            size="compact-sm"
            variant="light"
            color="violet"
            rightSection={<IconArrowRight size={14} />}
            style={{ flexShrink: 0 }}
            onClick={() => open(assembled.coreId)}
          >
            Abrir conjunto
          </Button>
        </Group>
        {assembled.total > 0 && (
          <SimpleGrid cols={{ base: 2, sm: Math.min(locations.length + 1, 4) }} spacing="xs" mt="xs">
            {locations.map((loc) => {
              const qty = assembled.inventories[Number(loc.value)] ?? 0;
              return (
                <div key={loc.value} className="stock-tile">
                  <Text size="xs" c="dimmed" fw={500} lineClamp={1}>
                    {loc.label}
                  </Text>
                  <div className="pm-tile-value" data-zero={qty === 0 || undefined}>
                    {qty.toLocaleString("pt-BR")}
                  </div>
                </div>
              );
            })}
            <div className="stock-tile">
              <Text size="xs" c="dimmed" fw={500}>
                Montadas
              </Text>
              <div className="pm-tile-value pm-assembled-total">{assembled.total.toLocaleString("pt-BR")}</div>
            </div>
          </SimpleGrid>
        )}
      </div>
    );
  }

  if (turbos.length === 0) return null;
  return (
    <div className="pm-assembled-panel">
      <Group gap={6} wrap="nowrap" mb={6}>
        <IconStack2 size={16} stroke={1.75} className="pm-assembled-icon" aria-hidden />
        <Text size="sm" fw={600}>
          Montado como
        </Text>
      </Group>
      <Stack gap={4}>
        {turbos.map((turbo) => (
          <Group key={turbo.id} justify="space-between" wrap="nowrap" gap="sm">
            <Text size="sm" lineClamp={1} title={turbo.nome}>
              {productRef(turbo.id, turbo.nome)}
            </Text>
            <Button
              size="compact-xs"
              variant="subtle"
              color="violet"
              rightSection={<IconArrowRight size={12} />}
              onClick={() => open(turbo.id)}
            >
              Abrir
            </Button>
          </Group>
        ))}
      </Stack>
      <Text size="xs" c="dimmed" mt={6}>
        O saldo deste conjunto aparece como montada nessas peças, sem contar duas vezes.
      </Text>
    </div>
  );
}
