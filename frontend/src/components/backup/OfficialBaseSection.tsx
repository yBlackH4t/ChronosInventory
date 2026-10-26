import {
  Accordion,
  Alert,
  Button,
  CopyButton,
  Group,
  Loader,
  NumberInput,
  PasswordInput,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Textarea,
} from "@mantine/core";
import {
  IconAlertTriangle,
  IconCheck,
  IconCopy,
  IconDownload,
  IconUpload,
} from "@tabler/icons-react";
import dayjs from "dayjs";

import type {
  OfficialBaseHistoryItemOut,
  OfficialBaseRole,
  OfficialBaseStatusOut,
  RemoteShareStatusOut,
} from "../../lib/api";
import EmptyState from "../ui/EmptyState";
import { OfficialBaseHistoryTable } from "./OfficialBaseHistoryTable";
import Panel from "../ui/Panel";
import StatusDot from "../ui/StatusDot";
import ProgressButton from "../ui/ProgressButton";

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
  serverTokenInput: string;
  onServerTokenChange: (value: string) => void;
  onSaveServerToken: () => void;
  onRemoveServerToken: () => void;
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
  /** A última publicação deu erro (o botão não mostra o ✓). */
  publishFailed?: boolean;
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
  serverTokenInput,
  onServerTokenChange,
  onSaveServerToken,
  onRemoveServerToken,
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
  publishFailed = false,
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
  const latest = status?.server_latest_manifest;
  const isPublisher = roleInput === "publisher";
  const emptyDatabase = (status?.current_products_count ?? 0) === 0;

  if (loading) {
    return (
      <Group justify="center" p="xl">
        <Loader size="sm" />
      </Group>
    );
  }

  if (errorMessage) {
    return (
      <EmptyState
        message="Falha ao carregar a base oficial"
        description={errorMessage}
        actionLabel="Tentar novamente"
        onAction={onRetry}
      />
    );
  }

  const comparisonRows: { label: string; local: string; published: string }[] = [
    {
      label: "Produtos",
      local: String(status?.current_products_count ?? 0),
      published: latest ? String(latest.products_count ?? 0) : "—",
    },
    {
      label: "Com estoque",
      local: String(status?.current_products_with_stock_count ?? 0),
      published: latest ? String(latest.products_with_stock_count ?? 0) : "—",
    },
    {
      label: "Movimentações",
      local: String(status?.current_movements_count ?? 0),
      published: latest ? String(latest.movements_count ?? 0) : "—",
    },
    {
      label: "Tamanho",
      local: formatBytes(status?.current_database_size ?? 0),
      published: latest ? formatBytes(latest.database_size ?? 0) : "—",
    },
  ];

  return (
    <Stack gap="md">
      {/* Servidor desta máquina */}
      <Panel
        title="Servidor desta máquina"
        subtitle={
          serverIsRunning
            ? "Quem estiver na mesma rede pode baixar a base oficial pelos endereços abaixo."
            : "Ligue o servidor para distribuir a base oficial sem depender de pasta compartilhada."
        }
        actions={
          <Switch
            label={serverSwitchLabel}
            checked={serverIsRunning}
            onChange={(event) => onToggleServer(event.currentTarget.checked)}
            disabled={serverToggleBusy}
            labelPosition="left"
          />
        }
      >
        <Stack gap="sm">
          <Group gap="lg" wrap="wrap">
            <StatusDot tone={serverIsRunning ? "success" : "neutral"}>
              Servidor {serverIsRunning ? "ativo" : "parado"}
            </StatusDot>
            <StatusDot tone={isPublisher ? "info" : "neutral"}>
              {isPublisher ? "Computador principal" : "Outro computador"}
            </StatusDot>
            <StatusDot tone={status?.remote_server_url ? "info" : "neutral"}>
              {status?.remote_server_url ? "Servidor remoto configurado" : "Sem servidor remoto"}
            </StatusDot>
            <StatusDot tone={status?.server_token_set ? "success" : "warning"}>
              {status?.server_token_set ? "Senha configurada" : "Sem senha"}
            </StatusDot>
            {status?.app_compatible_with_server_latest === false && (
              <StatusDot tone="danger">App incompatível com a última base</StatusDot>
            )}
          </Group>
          {serverIsRunning && !status?.server_token_set && (
            <Alert
              color="warning"
              variant="light"
              icon={<IconAlertTriangle size={18} />}
              title="Servidor desprotegido"
            >
              Sem senha: qualquer aparelho do Wi-Fi pode baixar o estoque.
            </Alert>
          )}
          {status?.server_urls?.length ? (
            <Group gap="xs" wrap="wrap">
              {status.server_urls.map((url) => (
                <CopyButton key={url} value={url} timeout={1500}>
                  {({ copied, copy }) => (
                    <button
                      type="button"
                      className="code-chip"
                      data-copied={copied || undefined}
                      onClick={copy}
                      title="Copiar endereço"
                    >
                      {url}
                      <span className="code-chip-icon">
                        {copied ? <IconCheck size={12} /> : <IconCopy size={12} />}
                      </span>
                    </button>
                  )}
                </CopyButton>
              ))}
            </Group>
          ) : null}
        </Stack>
      </Panel>

      {/* Comparativo */}
      <Panel
        flush
        title="Esta máquina × base publicada"
        subtitle={
          latest
            ? `Publicada em ${dayjs(latest.published_at).format("DD/MM/YYYY HH:mm")} por ${latest.publisher_name || latest.publisher_machine} · app mínimo ${latest.min_app_version} · banco ${latest.db_version}`
            : "Nenhuma base oficial publicada neste servidor ainda."
        }
        actions={
          latest && isPublisher ? (
            <Button
              size="xs"
              variant="subtle"
              color="danger"
              onClick={onDeleteLatest}
              loading={deletePending}
            >
              Excluir base publicada
            </Button>
          ) : undefined
        }
      >
        <Table verticalSpacing="xs">
          <Table.Thead>
            <Table.Tr>
              <Table.Th />
              <Table.Th ta="right">Esta máquina</Table.Th>
              <Table.Th ta="right">Publicada</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {comparisonRows.map((row) => (
              <Table.Tr key={row.label}>
                <Table.Td c="dimmed">{row.label}</Table.Td>
                <Table.Td ta="right" fw={600} className="num">
                  {row.local}
                </Table.Td>
                <Table.Td ta="right" className="num">
                  {row.published}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        <Stack gap={4} px="lg" py="sm">
          <Text size="xs" c="dimmed" className="mono" truncate="end">
            {status?.current_database_path || "—"}
          </Text>
          {latest?.notes ? (
            <Text size="xs" c="dimmed">
              Notas da publicação: {latest.notes}
            </Text>
          ) : null}
          <Text size="xs" c="dimmed">
            Se os números divergirem muito, confira antes de publicar ou aplicar a base.
          </Text>
        </Stack>
      </Panel>

      {emptyDatabase && (
        <Alert
          color="danger"
          variant="light"
          icon={<IconAlertTriangle size={18} />}
          title="Esta base está vazia"
        >
          Publicar agora distribuiria um estoque zerado. Confirme se o app está
          apontando para o banco certo antes de publicar.
        </Alert>
      )}

      {/* Ações */}
      <Panel title="Sincronizar">
        <Stack gap="sm">
          {isPublisher && (
            <Textarea
              label="Observação da publicação"
              placeholder="Ex: base conferida após inventário de Canoas"
              autosize
              minRows={2}
              value={notesInput}
              onChange={(event) => onNotesChange(event.currentTarget.value)}
            />
          )}
          <Group gap="xs" wrap="wrap">
            {isPublisher && (
              <ProgressButton
                leftSection={<IconUpload size={16} stroke={1.5} />}
                onClick={onPublish}
                busy={publishLoading}
                failed={publishFailed}
                busyLabel="Publicando…"
                doneLabel="Base publicada"
                disabled={emptyDatabase}
              >
                Publicar base oficial
              </ProgressButton>
            )}
            <Button
              variant="default"
              leftSection={<IconDownload size={16} stroke={1.5} />}
              onClick={onApply}
              loading={applyLoading}
              disabled={!remoteServerUrlInput.trim()}
            >
              Baixar do servidor remoto
            </Button>
          </Group>
          {remoteStatus && (
            <Stack gap={2}>
              <StatusDot tone={remoteStatus.official_available ? "success" : "warning"}>
                {remoteStatus.message}
              </StatusDot>
              <Text size="xs" c="dimmed">
                {remoteStatus.server_url} · {remoteStatus.machine_label || "—"}
                {remoteStatus.official_manifest
                  ? ` · base de ${dayjs(remoteStatus.official_manifest.published_at).format("DD/MM/YYYY HH:mm")} · ${remoteStatus.official_manifest.products_count ?? 0} produtos`
                  : ""}
              </Text>
            </Stack>
          )}
        </Stack>
      </Panel>

      {/* Configuração (recolhida) */}
      <div className="surface-panel" style={{ overflow: "hidden" }}>
        <Accordion chevronPosition="right">
          <Accordion.Item value="config" style={{ borderBottom: 0 }}>
            <Accordion.Control>
              <Text size="sm" fw={600}>
                Configuração da conexão
              </Text>
              <Text size="xs" c="dimmed">
                Papel, identificação, porta e servidor remoto
              </Text>
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="sm">
                <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="sm">
                  <Select
                    label="Papel desta máquina"
                    data={[
                      { value: "consumer", label: "Outro computador" },
                      { value: "publisher", label: "Computador principal" },
                    ]}
                    value={roleInput}
                    onChange={(value) =>
                      onRoleChange((value as OfficialBaseRole) || "consumer")
                    }
                    allowDeselect={false}
                  />
                  <TextInput
                    label="Identificação da máquina"
                    value={machineLabelInput}
                    onChange={(event) =>
                      onMachineLabelChange(event.currentTarget.value)
                    }
                  />
                  <TextInput
                    label="Nome do publicador"
                    value={publisherNameInput}
                    onChange={(event) =>
                      onPublisherNameChange(event.currentTarget.value)
                    }
                  />
                  <NumberInput
                    label="Porta do servidor"
                    value={serverPortInput ?? undefined}
                    onChange={(value) =>
                      onServerPortChange(typeof value === "number" ? value : null)
                    }
                    min={1024}
                    max={65535}
                  />
                  <TextInput
                    label="Servidor remoto"
                    placeholder="http://192.168.0.15:8765"
                    value={remoteServerUrlInput}
                    onChange={(event) =>
                      onRemoteServerUrlChange(event.currentTarget.value)
                    }
                    style={{ gridColumn: "span 2" }}
                  />
                  <Stack gap="xs" style={{ gridColumn: "span 3" }}>
                    <Group align="flex-end" gap="xs" wrap="wrap">
                      <PasswordInput
                        label="Senha do servidor (a mesma em todas as máquinas)"
                        placeholder={
                          status?.server_token_set
                            ? "Senha configurada (digite para alterar)"
                            : "Mínimo de 6 caracteres"
                        }
                        description={
                          status?.server_token_set
                            ? "Senha configurada. A mesma senha deve ser usada em todas as máquinas."
                            : "Protege o servidor local contra acessos não autorizados no Wi-Fi/rede."
                        }
                        value={serverTokenInput}
                        onChange={(event) =>
                          onServerTokenChange(event.currentTarget.value)
                        }
                        flex={1} miw={260}
                      />
                      <Button
                        variant="light"
                        onClick={onSaveServerToken}
                        loading={saveConfigLoading}
                        disabled={serverTokenInput.trim().length < 6}
                      >
                        Salvar senha
                      </Button>
                      {status?.server_token_set && (
                        <Button
                          variant="subtle"
                          color="danger"
                          onClick={onRemoveServerToken}
                          loading={saveConfigLoading}
                        >
                          Remover senha
                        </Button>
                      )}
                    </Group>
                    {status?.server_token_set && (
                      <Text size="xs" c="success" fw={500}>
                        ✓ Senha configurada
                      </Text>
                    )}
                  </Stack>
                </SimpleGrid>
                <Group justify="space-between" wrap="wrap">
                  <Text size="xs" c="dimmed" className="mono" truncate="end">
                    {status?.config_path || ""}
                  </Text>
                  <Group gap="xs">
                    <Button
                      variant="default"
                      onClick={onTestRemoteServer}
                      loading={testRemoteLoading}
                      disabled={!remoteServerUrlInput.trim()}
                    >
                      Testar servidor remoto
                    </Button>
                    <Button onClick={() => onSaveConfig()} loading={saveConfigLoading}>
                      Salvar configuração
                    </Button>
                  </Group>
                </Group>
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
      </div>

      {/* Histórico */}
      <Panel
        flush
        title="Histórico de publicações"
        actions={historyLoading ? <Loader size="xs" /> : undefined}
      >
        <OfficialBaseHistoryTable
          items={historyItems}
          loading={historyLoading}
          canDelete={canDeleteHistory}
          deletePending={deletePending}
          onDelete={onDeleteHistory}
        />
      </Panel>
    </Stack>
  );
}
