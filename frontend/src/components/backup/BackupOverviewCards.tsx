import { Badge, Card, Group, SimpleGrid, Stack, Text } from "@mantine/core";
import dayjs from "dayjs";

import type { BackupAutoConfigOut, BackupListItemOut, BackupValidateOut, OfficialBaseStatusOut } from "../../lib/api";

type Props = {
  currentValidation?: BackupValidateOut | null;
  backups: BackupListItemOut[];
  autoConfig?: BackupAutoConfigOut | null;
  officialBaseStatus?: OfficialBaseStatusOut | null;
  formatBytes: (size: number) => string;
};

export function BackupOverviewCards({
  currentValidation,
  backups,
  autoConfig,
  officialBaseStatus,
  formatBytes,
}: Props) {
  const latestBackup = backups[0] ?? null;
  const latestOfficial = officialBaseStatus?.server_latest_manifest;

  return (
    <SimpleGrid cols={{ base: 1, sm: 2, xl: 4 }}>
      <Card withBorder p="md">
        <Stack gap={6}>
          <Group justify="space-between">
            <Text size="xs" c="dimmed">
              Integridade do banco
            </Text>
            <Badge variant="light" color={currentValidation?.ok ? "green" : currentValidation ? "red" : "gray"}>
              {currentValidation?.ok ? "Integro" : currentValidation ? "Com erro" : "Aguardando"}
            </Badge>
          </Group>
          <Text fw={700}>{currentValidation?.result || "Sem validacao recente"}</Text>
          <Text size="sm" c="dimmed">
            Banco atual: {officialBaseStatus?.current_products_count ?? 0} produtos |{" "}
            {officialBaseStatus?.current_products_with_stock_count ?? 0} com estoque
          </Text>
        </Stack>
      </Card>

      <Card withBorder p="md">
        <Stack gap={6}>
          <Text size="xs" c="dimmed">
            Backups locais
          </Text>
          <Text fw={700}>{backups.length} arquivo(s)</Text>
          <Text size="sm" c="dimmed">
            Auto-backup: {autoConfig?.enabled ? "ativo" : "desligado"}
          </Text>
          <Text size="sm" c="dimmed">
            {latestBackup
              ? `Mais recente: ${dayjs(latestBackup.created_at).format("DD/MM/YYYY HH:mm")} | ${formatBytes(latestBackup.size)}`
              : "Nenhum backup criado ainda"}
          </Text>
        </Stack>
      </Card>

      <Card withBorder p="md">
        <Stack gap={6}>
          <Group justify="space-between">
            <Text size="xs" c="dimmed">
              Base oficial
            </Text>
            <Badge variant="light" color={latestOfficial ? "green" : "gray"}>
              {latestOfficial ? "Latest publicada" : "Sem latest"}
            </Badge>
          </Group>
          <Text fw={700}>
            {latestOfficial
              ? dayjs(latestOfficial.published_at).format("DD/MM/YYYY HH:mm")
              : "Nenhuma base oficial"}
          </Text>
          <Text size="sm" c="dimmed">
            {latestOfficial
              ? `Publicado por ${latestOfficial.publisher_name || latestOfficial.publisher_machine}`
              : "Publique uma base oficial quando quiser distribuir a referencia do estoque"}
          </Text>
        </Stack>
      </Card>

      <Card withBorder p="md">
        <Stack gap={6}>
          <Group justify="space-between">
            <Text size="xs" c="dimmed">
              Servidor local
            </Text>
            <Badge variant="light" color={officialBaseStatus?.server_running ? "green" : "orange"}>
              {officialBaseStatus?.server_running ? "Ativo" : "Parado"}
            </Badge>
          </Group>
          <Text fw={700}>
            {officialBaseStatus?.server_running
              ? `Porta ${officialBaseStatus.server_port ?? "-"}`
              : "Nao distribuindo snapshots"}
          </Text>
          <Text size="sm" c="dimmed">
            {officialBaseStatus?.remote_server_url
              ? `Servidor remoto configurado: ${officialBaseStatus.remote_server_url}`
              : "Sem servidor remoto configurado"}
          </Text>
        </Stack>
      </Card>
    </SimpleGrid>
  );
}
