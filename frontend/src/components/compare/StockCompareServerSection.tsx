import {
  ActionIcon,
  Button,
  Group,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import {
  IconArrowsDiff,
  IconRefresh,
  IconTrash,
  IconUpload,
} from "@tabler/icons-react";
import dayjs from "dayjs";

import Panel from "../ui/Panel";
import StatusDot, { KeyValue } from "../ui/StatusDot";
import type {
  CompareServerStatusOut,
  PublishedCompareBaseOut,
  RemoteCompareServerOut,
} from "../../lib/api";

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
  const localSnapshot = compareServerStatus?.local_snapshot;
  const remoteManifest = remoteServerInfo?.compare_manifest;

  return (
    <Stack gap="md">
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        {/* Esta máquina */}
        <Panel
          title="Esta máquina"
          subtitle="Publique a cópia do estoque para que outro computador possa comparar com você."
        >
          <Stack gap="sm">
            <Group gap="lg" wrap="wrap">
              <StatusDot tone={compareServerStatus?.server_running ? "success" : "neutral"}>
                Servidor {compareServerStatus?.server_running ? "ativo" : "parado"}
              </StatusDot>
              <StatusDot tone={compareServerStatus?.local_snapshot_available ? "info" : "neutral"}>
                {compareServerStatus?.local_snapshot_available
                  ? "Cópia do estoque publicada"
                  : "Sem cópia do estoque"}
              </StatusDot>
            </Group>
            <Stack gap={0}>
              <KeyValue label="Máquina" value={compareServerStatus?.machine_label || "—"} />
              <KeyValue label="Perfil" value={activeProfileName} />
              <KeyValue label="Porta" value={compareServerStatus?.server_port || "—"} />
              <KeyValue
                label="Última cópia do estoque"
                value={
                  localSnapshot
                    ? dayjs(localSnapshot.manifest.published_at).format("DD/MM/YYYY HH:mm")
                    : "—"
                }
              />
              <KeyValue label="Confirmado em" value={localStatusConfirmedAt || "—"} />
            </Stack>
            {compareServerStatus?.server_urls?.length ? (
              <Text size="xs" c="dimmed" className="mono">
                {compareServerStatus.server_urls.join("  ·  ")}
              </Text>
            ) : null}
            <Text size="xs" c="dimmed" className="mono" truncate="end" title={currentDbPath}>
              {currentDbPath}
            </Text>
            <Group justify="space-between" mt={4}>
              <Button
                size="xs"
                variant="subtle"
                color="danger"
                onClick={onDeleteLatestSnapshot}
                disabled={!compareServerStatus?.local_snapshot_available}
                loading={deleteLatestSnapshotLoading}
              >
                Excluir cópia do estoque
              </Button>
              <Button
                leftSection={<IconUpload size={16} stroke={1.5} />}
                onClick={onPublishSnapshot}
                loading={publishSnapshotLoading}
              >
                Publicar cópia do estoque
              </Button>
            </Group>
          </Stack>
        </Panel>

        {/* Servidor remoto */}
        <Panel
          title="Outro computador"
          subtitle="Informe o endereço do servidor do colega e compare com a cópia do estoque dele."
          actions={
            <StatusDot
              tone={remoteReachable === null ? "neutral" : remoteReachable ? "success" : "danger"}
            >
              {remoteReachable === null
                ? "Não verificado"
                : remoteReachable
                  ? "Online"
                  : "Offline"}
            </StatusDot>
          }
        >
          <Stack gap="sm">
            <TextInput
              label="Endereço do servidor"
              placeholder="http://192.168.0.15:8765"
              value={remoteServerUrl}
              onChange={(event) => onRemoteServerUrlChange(event.currentTarget.value)}
            />
            {remoteServerInfo ? (
              <Stack gap={0}>
                <KeyValue
                  label="Máquina"
                  value={`${remoteServerInfo.machine_label || "—"} · app ${remoteServerInfo.app_version || "—"}`}
                />
                <KeyValue
                  label="Cópia do estoque"
                  value={
                    remoteManifest
                      ? dayjs(remoteManifest.published_at).format("DD/MM/YYYY HH:mm")
                      : "Não publicado"
                  }
                />
                {remoteManifest ? (
                  <KeyValue
                    label="Itens"
                    value={`${remoteManifest.total_items} · ${remoteManifest.active_items} ativos · ${remoteManifest.with_stock_items} com estoque`}
                  />
                ) : null}
                <KeyValue label="Consultado em" value={remoteStatusCheckedAt || "—"} />
              </Stack>
            ) : (
              <Text size="xs" c="dimmed">
                Consulte o servidor para conferir se ele já publicou a cópia do estoque.
              </Text>
            )}
            {remoteSnapshotIsOlder && (
              <StatusDot tone="warning" size="xs">
                A cópia do estoque remota é mais antiga que a desta máquina
              </StatusDot>
            )}
            {remoteCheckError ? (
              <Text size="xs" c="var(--danger)">
                {remoteCheckError}
              </Text>
            ) : null}
            <Group justify="flex-end" gap="xs" mt={4}>
              <Button
                variant="default"
                onClick={onInspectRemoteServer}
                loading={inspectRemoteLoading}
                disabled={!remoteServerUrl.trim()}
              >
                Consultar
              </Button>
              <Button
                leftSection={<IconArrowsDiff size={16} stroke={1.5} />}
                onClick={onCompareRemote}
                loading={compareRemoteLoading}
                disabled={!remoteServerUrl.trim()}
              >
                Comparar
              </Button>
            </Group>
          </Stack>
        </Panel>
      </SimpleGrid>

      <Panel
        flush
        title="Histórico de snapshots"
        subtitle={`Mantém automaticamente os últimos ${compareServerStatus?.history_retention_limit ?? 10}.`}
        actions={
          <ActionIcon
            color="gray"
            aria-label="Atualizar histórico"
            onClick={onRefreshHistory}
            loading={historyLoading}
          >
            <IconRefresh size={16} stroke={1.5} />
          </ActionIcon>
        }
      >
        {compareServerHistory.length === 0 ? (
          <Text size="sm" c="dimmed" px="lg" py="md">
            {historyLoading
              ? "Carregando…"
              : "Ainda não existe histórico de snapshots nesta máquina."}
          </Text>
        ) : (
          <Table.ScrollContainer minWidth={640}>
            <Table verticalSpacing="xs">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Publicado em</Table.Th>
                  <Table.Th ta="right">Itens</Table.Th>
                  <Table.Th ta="right">Ativos</Table.Th>
                  <Table.Th ta="right">Com estoque</Table.Th>
                  <Table.Th ta="right">Tamanho</Table.Th>
                  <Table.Th w={56} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {compareServerHistory.map((item) => (
                  <Table.Tr key={item.manifest_path}>
                    <Table.Td className="num">
                      {dayjs(item.manifest.published_at).format("DD/MM/YYYY HH:mm")}
                    </Table.Td>
                    <Table.Td ta="right" className="num">
                      {item.manifest.total_items}
                    </Table.Td>
                    <Table.Td ta="right" className="num">
                      {item.manifest.active_items}
                    </Table.Td>
                    <Table.Td ta="right" className="num">
                      {item.manifest.with_stock_items}
                    </Table.Td>
                    <Table.Td ta="right" c="dimmed" className="num">
                      {formatBytes(item.manifest.file_size)}
                    </Table.Td>
                    <Table.Td>
                      <Group justify="flex-end" className="row-actions">
                        <ActionIcon
                          color="gray"
                          className="action-danger"
                          aria-label="Excluir cópia do estoque"
                          onClick={() => onDeleteHistorySnapshot(item.manifest_path)}
                          loading={
                            deleteHistorySnapshotLoading &&
                            deletingHistoryManifestPath === item.manifest_path
                          }
                        >
                          <IconTrash size={16} stroke={1.5} />
                        </ActionIcon>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Panel>
    </Stack>
  );
}
