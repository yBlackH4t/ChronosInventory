import { Badge, Card, Group, SimpleGrid, Stack, Text } from "@mantine/core";
import dayjs from "dayjs";

import type { CompareServerStatusOut, RemoteCompareServerOut, StockCompareOut } from "../../lib/api";

type Props = {
  compareResult: StockCompareOut | null;
  compareServerStatus?: CompareServerStatusOut | null;
  remoteServerInfo?: RemoteCompareServerOut | null;
  localStatusConfirmedAt: string | null;
  remoteStatusCheckedAt: string | null;
  remoteSnapshotIsOlder: boolean;
};

function metricLabelColor(isAvailable: boolean): "green" | "orange" | "gray" {
  if (isAvailable) return "green";
  return "gray";
}

export default function StockCompareOverviewCards({
  compareResult,
  compareServerStatus,
  remoteServerInfo,
  localStatusConfirmedAt,
  remoteStatusCheckedAt,
  remoteSnapshotIsOlder,
}: Props) {
  const localLatest = compareServerStatus?.local_snapshot?.manifest?.published_at;
  const remoteLatest = remoteServerInfo?.compare_manifest?.published_at;

  return (
    <SimpleGrid cols={{ base: 1, sm: 2, xl: 4 }}>
      <Card withBorder p="md">
        <Stack gap={6}>
          <Group justify="space-between" align="start">
            <Text size="xs" c="dimmed">
              Snapshot local
            </Text>
            <Badge variant="light" color={metricLabelColor(Boolean(localLatest))}>
              {localLatest ? "LATEST pronto" : "Sem snapshot"}
            </Badge>
          </Group>
          <Text fw={700}>{localLatest ? dayjs(localLatest).format("DD/MM/YYYY HH:mm") : "Nao publicado"}</Text>
          <Text size="sm" c="dimmed">
            Confirmado em {localStatusConfirmedAt || "aguardando status"}
          </Text>
        </Stack>
      </Card>

      <Card withBorder p="md">
        <Stack gap={6}>
          <Group justify="space-between" align="start">
            <Text size="xs" c="dimmed">
              Snapshot remoto
            </Text>
            <Badge variant="light" color={remoteServerInfo?.reachable ? "green" : remoteServerInfo ? "orange" : "gray"}>
              {remoteServerInfo?.reachable ? "Servidor online" : remoteServerInfo ? "Sem snapshot" : "Nao consultado"}
            </Badge>
          </Group>
          <Text fw={700}>{remoteLatest ? dayjs(remoteLatest).format("DD/MM/YYYY HH:mm") : "Nao publicado"}</Text>
          <Group gap="xs">
            {remoteSnapshotIsOlder ? (
              <Badge variant="light" color="orange">
                Mais antigo que o local
              </Badge>
            ) : remoteLatest ? (
              <Badge variant="light" color="green">
                Latest remoto em uso
              </Badge>
            ) : null}
          </Group>
          <Text size="sm" c="dimmed">
            Consultado em {remoteStatusCheckedAt || "ainda nao consultado"}
          </Text>
        </Stack>
      </Card>

      <Card withBorder p="md">
        <Stack gap={6}>
          <Text size="xs" c="dimmed">
            Comparativo carregado
          </Text>
          <Text fw={700}>{compareResult ? `${compareResult.rows.length} itens` : "Sem comparacao"}</Text>
          <Text size="sm" c="dimmed">
            Divergentes: {compareResult?.summary.divergent_items ?? 0}
          </Text>
          <Text size="sm" c="dimmed">
            So na base A/B: {(compareResult?.summary.only_left_items ?? 0) + (compareResult?.summary.only_right_items ?? 0)}
          </Text>
        </Stack>
      </Card>

      <Card withBorder p="md">
        <Stack gap={6}>
          <Text size="xs" c="dimmed">
            Retencao local
          </Text>
          <Text fw={700}>{compareServerStatus?.history_items_count ?? 0} snapshots</Text>
          <Text size="sm" c="dimmed">
            Limite automatico: {compareServerStatus?.history_retention_limit ?? 10}
          </Text>
          <Text size="sm" c="dimmed">
            Porta atual: {compareServerStatus?.server_port ?? "-"}
          </Text>
        </Stack>
      </Card>
    </SimpleGrid>
  );
}
