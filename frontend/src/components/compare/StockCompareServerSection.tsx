import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Group,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { IconTrash } from "@tabler/icons-react";
import dayjs from "dayjs";

import type { CompareServerStatusOut, PublishedCompareBaseOut, RemoteCompareServerOut } from "../../lib/api";

type Props = {
  currentDbPath: string;
  activeProfileName: string;
  compareServerStatus?: CompareServerStatusOut | null;
  compareServerHistory: PublishedCompareBaseOut[];
  historyLoading: boolean;
  onRefreshHistory: () => void;
  localStatusConfirmedAt: string | null;
  remoteServerUrl: string;
  onRemoteServerUrlChange: (value: string) => void;
  remoteStatusCheckedAt: string | null;
  remoteServerInfo: RemoteCompareServerOut | null;
  remoteReachable: boolean | null;
  remoteCheckError: string | null;
  remoteSnapshotIsOlder: boolean;
  onInspectRemoteServer: () => void;
  inspectRemoteLoading: boolean;
  onCompareRemote: () => void;
  compareRemoteLoading: boolean;
  onPublishSnapshot: () => void;
  publishSnapshotLoading: boolean;
  onDeleteLatestSnapshot: () => void;
  deleteLatestSnapshotLoading: boolean;
  onDeleteHistorySnapshot: (manifestPath: string) => void;
  deleteHistorySnapshotLoading: boolean;
  deletingHistoryManifestPath?: string | null;
  formatBytes: (size: number) => string;
};

export default function StockCompareServerSection({
  currentDbPath,
  activeProfileName,
  compareServerStatus,
  compareServerHistory,
  historyLoading,
  onRefreshHistory,
  localStatusConfirmedAt,
  remoteServerUrl,
  onRemoteServerUrlChange,
  remoteStatusCheckedAt,
  remoteServerInfo,
  remoteReachable,
  remoteCheckError,
  remoteSnapshotIsOlder,
  onInspectRemoteServer,
  inspectRemoteLoading,
  onCompareRemote,
  compareRemoteLoading,
  onPublishSnapshot,
  publishSnapshotLoading,
  onDeleteLatestSnapshot,
  deleteLatestSnapshotLoading,
  onDeleteHistorySnapshot,
  deleteHistorySnapshotLoading,
  deletingHistoryManifestPath,
  formatBytes,
}: Props) {
  return (
    <Card withBorder>
      <Stack gap="md">
        <Title order={4}>Comparacao por servidor local</Title>
        <Text size="sm" c="dimmed">
          Cada maquina publica o proprio snapshot. Do outro lado, basta informar o endereco do servidor remoto e comparar.
        </Text>

        <SimpleGrid cols={{ base: 1, md: 2 }}>
          <Card withBorder>
            <Stack gap={6}>
              <Group justify="space-between" align="start">
                <Text fw={600}>Minha maquina</Text>
                <Group gap="xs">
                  <Badge variant="light" color={compareServerStatus?.server_running ? "green" : "orange"}>
                    Servidor {compareServerStatus?.server_running ? "ativo" : "parado"}
                  </Badge>
                  <Badge variant="light" color={compareServerStatus?.local_snapshot_available ? "blue" : "gray"}>
                    {compareServerStatus?.local_snapshot_available ? "Snapshot publicado" : "Sem snapshot"}
                  </Badge>
                  {compareServerStatus?.local_snapshot_available ? (
                    <Badge variant="light" color="green">
                      LATEST
                    </Badge>
                  ) : null}
                </Group>
              </Group>
              <Text size="sm">Maquina: {compareServerStatus?.machine_label || "-"}</Text>
              <Text size="sm">Perfil atual: {activeProfileName}</Text>
              <Text size="sm">Porta: {compareServerStatus?.server_port || "-"}</Text>
              <Text size="sm" c="dimmed">
                {currentDbPath}
              </Text>
              {compareServerStatus?.server_urls?.length ? (
                <Text size="sm" c="dimmed">
                  Endereco(s): {compareServerStatus.server_urls.join(" | ")}
                </Text>
              ) : null}
              <Text size="sm" c="dimmed">
                Ultima confirmacao local: {localStatusConfirmedAt || "Aguardando"}
              </Text>
              <Text size="sm" c="dimmed">
                Historico local: {compareServerStatus?.history_items_count ?? 0} snapshot(s) | Retencao automatica:{" "}
                {compareServerStatus?.history_retention_limit ?? 10}
              </Text>
              {compareServerStatus?.local_snapshot ? (
                <>
                  <Text size="sm" c="dimmed">
                    Ultima publicacao:{" "}
                    {dayjs(compareServerStatus.local_snapshot.manifest.published_at).format("DD/MM/YYYY HH:mm")}
                  </Text>
                  <Text size="sm" c="dimmed">
                    Comparacoes remotas usam sempre este snapshot latest enquanto voce nao publicar outro.
                  </Text>
                </>
              ) : (
                <Text size="sm" c="dimmed">
                  Esta maquina ainda nao publicou snapshot de comparacao.
                </Text>
              )}
              <Group>
                <Button onClick={onPublishSnapshot} loading={publishSnapshotLoading}>
                  Publicar minha base para comparacao
                </Button>
                <Button
                  variant="light"
                  color="red"
                  onClick={onDeleteLatestSnapshot}
                  disabled={!compareServerStatus?.local_snapshot_available}
                  loading={deleteLatestSnapshotLoading}
                >
                  Excluir snapshot atual
                </Button>
              </Group>
            </Stack>
          </Card>

          <Card withBorder>
            <Stack gap={6}>
              <Group justify="space-between" align="start">
                <Text fw={600}>Servidor remoto</Text>
                <Badge
                  variant="light"
                  color={remoteReachable === null ? "gray" : remoteReachable ? "green" : "red"}
                >
                  {remoteReachable === null ? "Nao verificado" : remoteReachable ? "Online" : "Offline"}
                </Badge>
              </Group>
              <TextInput
                label="Endereco do servidor"
                placeholder="http://192.168.0.15:8765"
                value={remoteServerUrl}
                onChange={(event) => onRemoteServerUrlChange(event.currentTarget.value)}
              />
              <Text size="sm" c="dimmed">
                Ultima confirmacao remota: {remoteStatusCheckedAt || "Ainda nao consultado"}
              </Text>
              {remoteServerInfo ? (
                <>
                  <Text size="sm">
                    Maquina: {remoteServerInfo.machine_label || "-"} | App: {remoteServerInfo.app_version || "-"}
                  </Text>
                  <Text size="sm">Porta: {remoteServerInfo.server_port || "-"}</Text>
                  <Text size="sm">
                    Snapshot remoto:{" "}
                    {remoteServerInfo.compare_manifest
                      ? dayjs(remoteServerInfo.compare_manifest.published_at).format("DD/MM/YYYY HH:mm")
                      : "nao publicado"}
                  </Text>
                  {remoteServerInfo.compare_manifest ? (
                    <Group gap="xs">
                      <Badge variant="light" color="green" w="fit-content">
                        Usando snapshot latest do servidor remoto
                      </Badge>
                      {remoteSnapshotIsOlder ? (
                        <Badge variant="light" color="orange" w="fit-content">
                          Remoto mais antigo que o latest local
                        </Badge>
                      ) : null}
                    </Group>
                  ) : null}
                  {remoteServerInfo.compare_manifest ? (
                    <Text size="sm" c="dimmed">
                      Snapshot latest publicado por{" "}
                      {remoteServerInfo.compare_manifest.machine_label || remoteServerInfo.machine_label || "maquina remota"}{" "}
                      em {dayjs(remoteServerInfo.compare_manifest.published_at).format("DD/MM/YYYY HH:mm:ss")}.
                    </Text>
                  ) : null}
                  {remoteServerInfo.compare_manifest ? (
                    <Text size="sm">
                      Itens: {remoteServerInfo.compare_manifest.total_items} | Ativos:{" "}
                      {remoteServerInfo.compare_manifest.active_items} | Com estoque:{" "}
                      {remoteServerInfo.compare_manifest.with_stock_items}
                    </Text>
                  ) : null}
                </>
              ) : (
                <Text size="sm" c="dimmed">
                  Consulte o servidor remoto para conferir se ele ja publicou o snapshot.
                </Text>
              )}
              {remoteCheckError ? (
                <Text size="sm" c="red">
                  {remoteCheckError}
                </Text>
              ) : null}
              <Group>
                <Button
                  variant="light"
                  onClick={onInspectRemoteServer}
                  loading={inspectRemoteLoading}
                  disabled={!remoteServerUrl.trim()}
                >
                  Consultar servidor
                </Button>
                <Button
                  onClick={onCompareRemote}
                  loading={compareRemoteLoading}
                  disabled={!remoteServerUrl.trim()}
                >
                  Comparar com servidor remoto
                </Button>
              </Group>
            </Stack>
          </Card>
        </SimpleGrid>

        <Card withBorder>
          <Stack gap="sm">
            <Group justify="space-between" align="start">
              <div>
                <Text fw={600}>Historico local de snapshots</Text>
                <Text size="sm" c="dimmed">
                  O servidor mantem automaticamente apenas os ultimos{" "}
                  {compareServerStatus?.history_retention_limit ?? 10} snapshots.
                </Text>
              </div>
              <Button variant="subtle" size="xs" onClick={onRefreshHistory}>
                Atualizar historico
              </Button>
            </Group>

            {historyLoading ? (
              <Text size="sm" c="dimmed">
                Carregando historico...
              </Text>
            ) : compareServerHistory.length === 0 ? (
              <Text size="sm" c="dimmed">
                Ainda nao existe historico de snapshots nesta maquina.
              </Text>
            ) : (
              <Table.ScrollContainer minWidth={720}>
                <Table striped highlightOnHover withTableBorder>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Publicado em</Table.Th>
                      <Table.Th>Itens</Table.Th>
                      <Table.Th>Ativos</Table.Th>
                      <Table.Th>Com estoque</Table.Th>
                      <Table.Th>Tamanho</Table.Th>
                      <Table.Th>Acoes</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {compareServerHistory.map((item) => (
                      <Table.Tr key={item.manifest_path}>
                        <Table.Td>{dayjs(item.manifest.published_at).format("DD/MM/YYYY HH:mm")}</Table.Td>
                        <Table.Td>{item.manifest.total_items}</Table.Td>
                        <Table.Td>{item.manifest.active_items}</Table.Td>
                        <Table.Td>{item.manifest.with_stock_items}</Table.Td>
                        <Table.Td>{formatBytes(item.manifest.file_size)}</Table.Td>
                        <Table.Td>
                          <ActionIcon
                            color="red"
                            variant="light"
                            onClick={() => onDeleteHistorySnapshot(item.manifest_path)}
                            loading={deleteHistorySnapshotLoading && deletingHistoryManifestPath === item.manifest_path}
                          >
                            <IconTrash size={16} />
                          </ActionIcon>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            )}
          </Stack>
        </Card>
      </Stack>
    </Card>
  );
}
