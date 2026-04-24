import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput,
  Textarea,
  Title,
} from "@mantine/core";
import dayjs from "dayjs";

import type {
  OfficialBaseHistoryItemOut,
  OfficialBaseRole,
  OfficialBaseStatusOut,
  RemoteShareStatusOut,
} from "../../lib/api";
import EmptyState from "../ui/EmptyState";
import { OfficialBaseHistoryTable } from "./OfficialBaseHistoryTable";

type OfficialBaseSectionProps = {
  loading: boolean;
  errorMessage: string | null;
  onRetry: () => void;
  status: OfficialBaseStatusOut | null | undefined;
  roleInput: OfficialBaseRole;
  onRoleChange: (value: OfficialBaseRole) => void;
  machineLabelInput: string;
  onMachineLabelChange: (value: string) => void;
  publisherNameInput: string;
  onPublisherNameChange: (value: string) => void;
  serverPortInput: number | null;
  onServerPortChange: (value: number | null) => void;
  remoteServerUrlInput: string;
  onRemoteServerUrlChange: (value: string) => void;
  onSaveConfig: () => void;
  saveConfigLoading: boolean;
  serverSwitchLabel: string;
  serverIsRunning: boolean;
  serverToggleBusy: boolean;
  onToggleServer: (checked: boolean) => void;
  onTestRemoteServer: () => void;
  testRemoteLoading: boolean;
  remoteStatus: RemoteShareStatusOut | null;
  notesInput: string;
  onNotesChange: (value: string) => void;
  onPublish: () => void;
  publishLoading: boolean;
  onApply: () => void;
  applyLoading: boolean;
  formatBytes: (size: number) => string;
  historyItems: OfficialBaseHistoryItemOut[];
  historyLoading: boolean;
  canDeleteHistory: boolean;
  deletePending: boolean;
  onDeleteHistory: (item: OfficialBaseHistoryItemOut) => void;
  onDeleteLatest: () => void;
};

export function OfficialBaseSection({
  loading,
  errorMessage,
  onRetry,
  status,
  roleInput,
  onRoleChange,
  machineLabelInput,
  onMachineLabelChange,
  publisherNameInput,
  onPublisherNameChange,
  serverPortInput,
  onServerPortChange,
  remoteServerUrlInput,
  onRemoteServerUrlChange,
  onSaveConfig,
  saveConfigLoading,
  serverSwitchLabel,
  serverIsRunning,
  serverToggleBusy,
  onToggleServer,
  onTestRemoteServer,
  testRemoteLoading,
  remoteStatus,
  notesInput,
  onNotesChange,
  onPublish,
  publishLoading,
  onApply,
  applyLoading,
  formatBytes,
  historyItems,
  historyLoading,
  canDeleteHistory,
  deletePending,
  onDeleteHistory,
  onDeleteLatest,
}: OfficialBaseSectionProps) {
  const latestOfficialManifest = status?.server_latest_manifest;

  if (loading) {
    return (
      <Card withBorder>
        <Stack>
          <Title order={4}>Base oficial compartilhada</Title>
          <Loader size="sm" />
        </Stack>
      </Card>
    );
  }

  if (errorMessage) {
    return (
      <Card withBorder>
        <Stack>
          <Title order={4}>Base oficial compartilhada</Title>
          <EmptyState
            message={errorMessage}
            actionLabel="Tentar novamente"
            onAction={onRetry}
          />
        </Stack>
      </Card>
    );
  }

  return (
    <Card withBorder>
      <Stack>
        <Title order={4}>Base oficial compartilhada</Title>

        <Alert color={status?.server_running ? "blue" : "orange"} variant="light">
          {status?.server_running
            ? "Servidor local ativo. Quem estiver na rede pode usar o endereco abaixo para baixar a base oficial ou comparar snapshots."
            : "Ligue o servidor local desta maquina para distribuir a base oficial sem depender de pasta compartilhada."}
        </Alert>

        <Group gap="sm" wrap="wrap">
          <Badge variant="light" color={status?.role === "publisher" ? "blue" : "gray"}>
            Papel: {status?.role === "publisher" ? "Publisher" : "Consumer"}
          </Badge>
          <Badge variant="light" color={status?.server_running ? "green" : "orange"}>
            Servidor {status?.server_running ? "ativo" : "parado"}
          </Badge>
          <Badge variant="light" color={status?.server_latest_available ? "green" : "gray"}>
            {status?.server_latest_available ? "Base oficial local publicada" : "Sem base oficial local"}
          </Badge>
          <Badge variant="light" color={status?.remote_server_url ? "indigo" : "gray"}>
            {status?.remote_server_url ? "Servidor remoto configurado" : "Sem servidor remoto"}
          </Badge>
          {status?.app_compatible_with_server_latest === false && (
            <Badge variant="light" color="red">
              App local incompativel com a ultima base
            </Badge>
          )}
        </Group>

        <Group align="end" wrap="wrap">
          <Select
            label="Papel desta maquina"
            data={[
              { value: "consumer", label: "Consumer" },
              { value: "publisher", label: "Publisher" },
            ]}
            value={roleInput}
            onChange={(value) => onRoleChange((value as OfficialBaseRole) || "consumer")}
            w={160}
            allowDeselect={false}
          />
          <TextInput
            label="Identificacao da maquina"
            value={machineLabelInput}
            onChange={(event) => onMachineLabelChange(event.currentTarget.value)}
            w={220}
          />
          <TextInput
            label="Nome do publicador"
            value={publisherNameInput}
            onChange={(event) => onPublisherNameChange(event.currentTarget.value)}
            w={220}
          />
          <NumberInput
            label="Porta do servidor"
            value={serverPortInput ?? undefined}
            onChange={(value) => onServerPortChange(typeof value === "number" ? value : null)}
            min={1024}
            max={65535}
            w={160}
          />
          <TextInput
            label="Servidor remoto"
            placeholder="http://192.168.0.15:8765"
            value={remoteServerUrlInput}
            onChange={(event) => onRemoteServerUrlChange(event.currentTarget.value)}
            w={320}
          />
          <Button onClick={onSaveConfig} loading={saveConfigLoading}>
            Salvar configuracao
          </Button>
          <Switch
            label={serverSwitchLabel}
            description={serverIsRunning ? "Servidor ativo nesta maquina" : "Servidor parado nesta maquina"}
            checked={serverIsRunning}
            onChange={(event) => onToggleServer(event.currentTarget.checked)}
            disabled={serverToggleBusy}
            size="md"
            onLabel="ON"
            offLabel="OFF"
          />
          <Button
            variant="light"
            onClick={onTestRemoteServer}
            loading={testRemoteLoading}
            disabled={!remoteServerUrlInput.trim()}
          >
            Testar servidor remoto
          </Button>
        </Group>

        <Text size="sm" c="dimmed">
          Config local: {status?.config_path || "-"}
        </Text>

        {status?.server_urls?.length ? (
          <Alert color={status?.server_running ? "green" : "gray"} variant="light">
            <Stack gap={4}>
              <Text size="sm">Enderecos desta maquina: {status.server_urls.join(" | ")}</Text>
            </Stack>
          </Alert>
        ) : null}

        {remoteStatus && (
          <Alert color={remoteStatus.official_available ? "green" : "orange"} variant="light">
            <Stack gap={4}>
              <Text size="sm">{remoteStatus.message}</Text>
              <Text size="sm">
                Servidor: {remoteStatus.server_url} | Maquina: {remoteStatus.machine_label || "-"}
              </Text>
              {remoteStatus.official_manifest && (
                <Text size="sm">
                  Base remota: {dayjs(remoteStatus.official_manifest.published_at).format("DD/MM/YYYY HH:mm")} | Produtos:{" "}
                  {remoteStatus.official_manifest.products_count ?? 0}
                </Text>
              )}
            </Stack>
          </Alert>
        )}

        <Card withBorder bg="var(--surface-muted)">
          <Stack gap="xs">
            <Text fw={600}>Base ativa desta maquina</Text>
            <Text size="sm">Banco em uso: {status?.current_database_path || "-"}</Text>
            <Group gap="sm" wrap="wrap">
              <Badge variant="light" color="blue">
                Produtos: {status?.current_products_count ?? 0}
              </Badge>
              <Badge variant="light" color="teal">
                Com estoque: {status?.current_products_with_stock_count ?? 0}
              </Badge>
              <Badge variant="light" color="grape">
                Movimentacoes: {status?.current_movements_count ?? 0}
              </Badge>
              <Badge variant="light" color="gray">
                Tamanho: {formatBytes(status?.current_database_size ?? 0)}
              </Badge>
            </Group>
            {(status?.current_products_count ?? 0) === 0 && (
              <Alert color="red" variant="light">
                Esta base esta vazia. Se voce publicar agora, vai distribuir um estoque zerado.
                Se estiver em modo dev, confirme se o app esta apontando para o banco certo antes de publicar.
              </Alert>
            )}
          </Stack>
        </Card>

        {latestOfficialManifest ? (
          <Card withBorder bg="var(--surface-muted)">
            <Stack gap="xs">
              <Group justify="space-between" wrap="wrap">
                <Group gap="xs">
                  <Text fw={600}>Ultima base publicada neste servidor</Text>
                  <Badge color="green" variant="light">
                    LATEST
                  </Badge>
                </Group>
                <Group gap="xs">
                  <Text size="sm" c="dimmed">
                    {dayjs(latestOfficialManifest.published_at).format("DD/MM/YYYY HH:mm")}
                  </Text>
                  {roleInput === "publisher" && (
                    <Button
                      size="xs"
                      color="red"
                      variant="light"
                      onClick={onDeleteLatest}
                      loading={deletePending}
                    >
                      Excluir base atual
                    </Button>
                  )}
                </Group>
              </Group>
              <Text size="sm">
                Publicada por: {latestOfficialManifest.publisher_name || latestOfficialManifest.publisher_machine}
              </Text>
              <Text size="sm">
                App minimo: {latestOfficialManifest.min_app_version} | Banco: {latestOfficialManifest.db_version}
              </Text>
              <Text size="sm">Notas: {latestOfficialManifest.notes || "Sem observacoes."}</Text>
              <Group gap="sm" wrap="wrap">
                <Badge variant="light" color="blue">
                  Produtos: {latestOfficialManifest.products_count ?? 0}
                </Badge>
                <Badge variant="light" color="teal">
                  Com estoque: {latestOfficialManifest.products_with_stock_count ?? 0}
                </Badge>
                <Badge variant="light" color="grape">
                  Movimentacoes: {latestOfficialManifest.movements_count ?? 0}
                </Badge>
                <Badge variant="light" color="gray">
                  Tamanho: {formatBytes(latestOfficialManifest.database_size ?? 0)}
                </Badge>
              </Group>
            </Stack>
          </Card>
        ) : (
          <Text size="sm" c="dimmed">
            Nenhuma base oficial publicada neste servidor ainda.
          </Text>
        )}

        {latestOfficialManifest && (
          <SimpleGrid cols={{ base: 1, md: 2 }}>
            <Card withBorder>
              <Stack gap={4}>
                <Text fw={600}>Comparativo rapido</Text>
                <Text size="sm">
                  Produtos locais: {status?.current_products_count ?? 0} | publicados: {latestOfficialManifest.products_count ?? 0}
                </Text>
                <Text size="sm">
                  Com estoque local: {status?.current_products_with_stock_count ?? 0} | publicados:{" "}
                  {latestOfficialManifest.products_with_stock_count ?? 0}
                </Text>
                <Text size="sm">
                  Movimentacoes locais: {status?.current_movements_count ?? 0} | publicadas:{" "}
                  {latestOfficialManifest.movements_count ?? 0}
                </Text>
              </Stack>
            </Card>
            <Card withBorder>
              <Stack gap={4}>
                <Text fw={600}>Leitura operacional</Text>
                <Text size="sm">
                  Se estes numeros divergirem muito, confira antes de publicar ou aplicar a base.
                </Text>
                <Text size="sm" c="dimmed">
                  Isso ajuda a evitar sobrescrever o colega com uma base errada ou desatualizada.
                </Text>
              </Stack>
            </Card>
          </SimpleGrid>
        )}

        {roleInput === "publisher" && (
          <Textarea
            label="Observacao da publicacao"
            placeholder="Ex: base conferida apos inventario de Canoas"
            minRows={2}
            value={notesInput}
            onChange={(event) => onNotesChange(event.currentTarget.value)}
          />
        )}

        <Group>
          {roleInput === "publisher" && (
            <Button
              onClick={onPublish}
              loading={publishLoading}
              disabled={(status?.current_products_count ?? 0) === 0}
            >
              Publicar base oficial neste servidor
            </Button>
          )}
          <Button
            variant="light"
            color="orange"
            onClick={onApply}
            loading={applyLoading}
            disabled={!remoteServerUrlInput.trim()}
          >
            Baixar base oficial do servidor remoto
          </Button>
        </Group>

        <Card withBorder>
          <Stack gap="sm">
            <Group justify="space-between" wrap="wrap">
              <Text fw={600}>Historico recente de publicacoes</Text>
              {historyLoading && <Loader size="xs" />}
            </Group>
            <OfficialBaseHistoryTable
              items={historyItems}
              loading={historyLoading}
              canDelete={canDeleteHistory}
              deletePending={deletePending}
              onDelete={onDeleteHistory}
            />
          </Stack>
        </Card>
      </Stack>
    </Card>
  );
}
