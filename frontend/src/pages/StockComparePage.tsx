import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Card,
  Group,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useMutation, useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";

import DataTable from "../components/ui/DataTable";
import EmptyState from "../components/ui/EmptyState";
import FilterToolbar from "../components/ui/FilterToolbar";
import PageHeader from "../components/ui/PageHeader";
import type {
  PublishedCompareBaseOut,
  PublishedCompareStatusOut,
  StockCompareOut,
  StockCompareRowOut,
  StockProfilesStateOut,
  SuccessResponse,
} from "../lib/api";
import { api } from "../lib/apiClient";
import { notifyError, notifySuccess } from "../lib/notify";
import { isTauri } from "../lib/tauri";
import { loadTabState, saveTabState } from "../state/tabStateCache";

type CompareFilter =
  | "DIFFERENT"
  | "ALL"
  | "CANOAS"
  | "PF"
  | "ONLY_LEFT"
  | "ONLY_RIGHT"
  | "NAME"
  | "ACTIVE"
  | "IDENTICAL";

type CompareTabState = {
  leftPath: string;
  rightPath: string;
  leftLabel: string;
  rightLabel: string;
  filter: CompareFilter;
  search: string;
  selectedPublishedMachine: string;
};

const STOCK_COMPARE_TAB_ID = "stock-compare";
const DEFAULT_COMPARE_STATE: CompareTabState = {
  leftPath: "",
  rightPath: "",
  leftLabel: "Minha base",
  rightLabel: "Base colega",
  filter: "DIFFERENT",
  search: "",
  selectedPublishedMachine: "",
};

const FILTER_OPTIONS: { value: CompareFilter; label: string }[] = [
  { value: "DIFFERENT", label: "Somente divergentes" },
  { value: "ALL", label: "Todos" },
  { value: "CANOAS", label: "Diferença em Canoas" },
  { value: "PF", label: "Diferença em PF" },
  { value: "ONLY_LEFT", label: "Só na base A" },
  { value: "ONLY_RIGHT", label: "Só na base B" },
  { value: "NAME", label: "Nome divergente" },
  { value: "ACTIVE", label: "Ativo/inativo divergente" },
  { value: "IDENTICAL", label: "Somente iguais" },
];

const STATUS_META: Record<string, { label: string; color: string }> = {
  IDENTICAL: { label: "Igual", color: "gray" },
  CANOAS: { label: "Canoas", color: "blue" },
  PF: { label: "PF", color: "orange" },
  ONLY_LEFT: { label: "Só A", color: "red" },
  ONLY_RIGHT: { label: "Só B", color: "green" },
  NAME: { label: "Nome", color: "violet" },
  ACTIVE: { label: "Status", color: "yellow" },
};

function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size < 1024) return `${size || 0} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

function stockBadgeColor(value: number): string {
  if (value === 0) return "gray";
  return value > 0 ? "green" : "red";
}

function boolLabel(value: boolean | null | undefined): string {
  if (value === null || value === undefined) return "-";
  return value ? "Ativo" : "Inativo";
}

function publishedBaseOption(item: PublishedCompareBaseOut) {
  const dateLabel = item.manifest.published_at
    ? dayjs(item.manifest.published_at).format("DD/MM/YYYY HH:mm")
    : "sem data";
  return {
    value: item.machine_label,
    label: `${item.machine_label} | ${dateLabel} | ${item.manifest.total_items} itens`,
  };
}

export default function StockComparePage() {
  const persistedState = useMemo(
    () => loadTabState<CompareTabState>(STOCK_COMPARE_TAB_ID) ?? DEFAULT_COMPARE_STATE,
    []
  );
  const [leftPath, setLeftPath] = useState(persistedState.leftPath);
  const [rightPath, setRightPath] = useState(persistedState.rightPath);
  const [leftLabel, setLeftLabel] = useState(persistedState.leftLabel);
  const [rightLabel, setRightLabel] = useState(persistedState.rightLabel);
  const [filter, setFilter] = useState<CompareFilter>(persistedState.filter);
  const [search, setSearch] = useState(persistedState.search);
  const [selectedPublishedMachine, setSelectedPublishedMachine] = useState(persistedState.selectedPublishedMachine);
  const [compareResult, setCompareResult] = useState<StockCompareOut | null>(null);

  const stockProfilesQuery = useQuery<SuccessResponse<StockProfilesStateOut>>({
    queryKey: ["stock-profiles"],
    queryFn: ({ signal }) => api.listStockProfiles({ signal }),
    staleTime: 30_000,
  });

  const publishedStatusQuery = useQuery<SuccessResponse<PublishedCompareStatusOut>>({
    queryKey: ["published-compare-status"],
    queryFn: ({ signal }) => api.getPublishedCompareStatus({ signal }),
    staleTime: 15_000,
  });

  useEffect(() => {
    saveTabState<CompareTabState>(STOCK_COMPARE_TAB_ID, {
      leftPath,
      rightPath,
      leftLabel,
      rightLabel,
      filter,
      search,
      selectedPublishedMachine,
    });
  }, [filter, leftLabel, leftPath, rightLabel, rightPath, search, selectedPublishedMachine]);

  useEffect(() => {
    const currentPath = stockProfilesQuery.data?.data?.current_database_path || "";
    if (!currentPath || leftPath.trim()) return;
    setLeftPath(currentPath);
  }, [leftPath, stockProfilesQuery.data?.data?.current_database_path]);

  const publishedBases = useMemo(
    () => (publishedStatusQuery.data?.data?.available_bases ?? []).filter((item) => !item.is_current_machine),
    [publishedStatusQuery.data?.data?.available_bases]
  );

  useEffect(() => {
    if (selectedPublishedMachine && publishedBases.some((item) => item.machine_label === selectedPublishedMachine)) {
      return;
    }
    if (publishedBases.length > 0) {
      setSelectedPublishedMachine(publishedBases[0].machine_label);
    }
  }, [publishedBases, selectedPublishedMachine]);

  const compareMutation = useMutation<SuccessResponse<StockCompareOut>, Error>({
    mutationFn: () =>
      api.compareStockDatabases({
        left_path: leftPath.trim(),
        right_path: rightPath.trim(),
        left_label: leftLabel.trim() || "Base A",
        right_label: rightLabel.trim() || "Base B",
      }),
    onSuccess: (response) => {
      setCompareResult(response.data);
      notifySuccess("Comparativo concluído.");
    },
    onError: (error) => notifyError(error),
  });

  const publishSnapshotMutation = useMutation<SuccessResponse<unknown>, Error>({
    mutationFn: () => api.publishCompareSnapshot(),
    onSuccess: async () => {
      notifySuccess("Base atual publicada para comparação.");
      await publishedStatusQuery.refetch();
    },
    onError: (error) => notifyError(error),
  });

  const comparePublishedMutation = useMutation<SuccessResponse<StockCompareOut>, Error>({
    mutationFn: () => api.compareWithPublishedSnapshot(selectedPublishedMachine),
    onSuccess: (response) => {
      setCompareResult(response.data);
      notifySuccess("Comparativo com base publicada concluído.");
    },
    onError: (error) => notifyError(error),
  });

  const chooseDatabaseFile = async (target: "left" | "right") => {
    if (!isTauri()) {
      notifyError(new Error("Seleção de arquivo integrada disponível apenas no app desktop. Digite o caminho manualmente."));
      return;
    }
    try {
      const { open } = await import("@tauri-apps/api/dialog");
      const selected = await open({
        multiple: false,
        filters: [{ name: "Banco SQLite", extensions: ["db", "sqlite", "sqlite3"] }],
      });
      if (typeof selected !== "string" || !selected.trim()) return;
      if (target === "left") {
        setLeftPath(selected);
      } else {
        setRightPath(selected);
      }
    } catch (error) {
      notifyError(error, "Não foi possível selecionar o arquivo.");
    }
  };

  const startManualCompare = () => {
    if (!leftPath.trim() || !rightPath.trim()) {
      notifyError(new Error("Informe as duas bases para comparar."));
      return;
    }
    compareMutation.mutate();
  };

  const startPublishedCompare = () => {
    if (!selectedPublishedMachine) {
      notifyError(new Error("Escolha uma base publicada para comparar."));
      return;
    }
    comparePublishedMutation.mutate();
  };

  const rows = useMemo(() => {
    const source = compareResult?.rows ?? [];
    const query = search.trim().toUpperCase();
    return source.filter((row) => {
      const matchesFilter =
        filter === "ALL"
          ? true
          : filter === "DIFFERENT"
            ? row.has_difference
            : filter === "IDENTICAL"
              ? !row.has_difference
              : row.statuses.includes(filter);

      if (!matchesFilter) return false;
      if (!query) return true;

      return (
        String(row.product_id).includes(query) ||
        (row.display_name || "").toUpperCase().includes(query) ||
        (row.left_name || "").toUpperCase().includes(query) ||
        (row.right_name || "").toUpperCase().includes(query)
      );
    });
  }, [compareResult?.rows, filter, search]);

  const currentDbPath = stockProfilesQuery.data?.data?.current_database_path || "";
  const activeProfileName = stockProfilesQuery.data?.data?.active_profile_name || "Atual";
  const publishedStatus = publishedStatusQuery.data?.data;
  const selectedPublishedBase =
    publishedBases.find((item) => item.machine_label === selectedPublishedMachine) ?? null;

  return (
    <Stack gap="lg">
      <PageHeader
        title="Comparar estoques"
        subtitle="Publique a base da máquina e compare com um clique. Se precisar, a comparação manual continua disponível abaixo."
      />

      <Card withBorder>
        <Stack gap="md">
          <Title order={4}>Comparação publicada na rede</Title>
          <Text size="sm" c="dimmed">
            Cada máquina pode publicar um snapshot próprio para comparação. Assim você evita copiar o `.db` manualmente toda vez.
          </Text>

          {!publishedStatus?.configured ? (
            <EmptyState message="Configure primeiro a pasta compartilhada em Backup > Base oficial compartilhada para usar este fluxo simplificado." />
          ) : (
            <>
              <SimpleGrid cols={{ base: 1, md: 2 }}>
                <Card withBorder>
                  <Stack gap={6}>
                    <Text fw={600}>Minha máquina</Text>
                    <Text size="sm">Máquina: {publishedStatus.machine_label}</Text>
                    <Text size="sm">Perfil atual: {activeProfileName}</Text>
                    <Text size="sm" c="dimmed">{currentDbPath}</Text>
                    <Text size="sm" c="dimmed">
                      Pasta compartilhada: {publishedStatus.official_base_dir || "-"}
                    </Text>
                    {publishedStatus.local_snapshot ? (
                      <Text size="sm" c="dimmed">
                        Última publicação: {dayjs(publishedStatus.local_snapshot.manifest.published_at).format("DD/MM/YYYY HH:mm")}
                      </Text>
                    ) : (
                      <Text size="sm" c="dimmed">Esta máquina ainda não publicou snapshot de comparação.</Text>
                    )}
                    <Button onClick={() => publishSnapshotMutation.mutate()} loading={publishSnapshotMutation.isPending}>
                      Publicar minha base para comparação
                    </Button>
                  </Stack>
                </Card>

                <Card withBorder>
                  <Stack gap={6}>
                    <Text fw={600}>Base remota publicada</Text>
                    <Select
                      label="Escolha a máquina"
                      data={publishedBases.map(publishedBaseOption)}
                      value={selectedPublishedMachine}
                      onChange={(value) => setSelectedPublishedMachine(value || "")}
                      placeholder="Selecione uma base publicada"
                      searchable
                      nothingFoundMessage="Nenhuma base publicada encontrada"
                    />
                    {selectedPublishedBase ? (
                      <>
                        <Text size="sm">
                          Publicada em: {dayjs(selectedPublishedBase.manifest.published_at).format("DD/MM/YYYY HH:mm")}
                        </Text>
                        <Text size="sm">
                          Itens: {selectedPublishedBase.manifest.total_items} | Ativos: {selectedPublishedBase.manifest.active_items} | Com estoque: {selectedPublishedBase.manifest.with_stock_items}
                        </Text>
                        <Text size="sm" c="dimmed">
                          Snapshot: {selectedPublishedBase.zip_path}
                        </Text>
                      </>
                    ) : (
                      <Text size="sm" c="dimmed">
                        Nenhuma base remota selecionada ainda.
                      </Text>
                    )}
                    <Group>
                      <Button
                        onClick={startPublishedCompare}
                        loading={comparePublishedMutation.isPending}
                        disabled={!selectedPublishedBase}
                      >
                        Comparar com base publicada
                      </Button>
                      <Button variant="light" onClick={() => publishedStatusQuery.refetch()}>
                        Atualizar lista
                      </Button>
                    </Group>
                  </Stack>
                </Card>
              </SimpleGrid>

              <Text size="xs" c="dimmed">
                As bases publicadas ficam dentro da mesma pasta compartilhada, em uma subpasta `compare`, separadas por máquina.
              </Text>
            </>
          )}
        </Stack>
      </Card>

      <Card withBorder>
        <Stack gap="md">
          <Title order={4}>Comparação manual</Title>
          <Text size="sm" c="dimmed">
            Mantida como plano B. Use quando quiser comparar dois arquivos específicos sem depender da base publicada.
          </Text>
          <SimpleGrid cols={{ base: 1, md: 2 }}>
            <Card withBorder>
              <Stack gap="sm">
                <Text fw={600}>Base A</Text>
                <TextInput
                  label="Nome da base"
                  value={leftLabel}
                  onChange={(event) => setLeftLabel(event.currentTarget.value)}
                  placeholder="Ex: Minha base"
                />
                <TextInput
                  label="Caminho do arquivo"
                  value={leftPath}
                  onChange={(event) => setLeftPath(event.currentTarget.value)}
                  placeholder="Ex: \\\\SERVIDOR\\Pasta\\estoque.db"
                />
                <Group>
                  <Button variant="light" onClick={() => chooseDatabaseFile("left")}>
                    Escolher arquivo
                  </Button>
                  <Button
                    variant="subtle"
                    onClick={() => setLeftPath(currentDbPath)}
                    disabled={!currentDbPath}
                  >
                    Usar base atual
                  </Button>
                </Group>
              </Stack>
            </Card>

            <Card withBorder>
              <Stack gap="sm">
                <Text fw={600}>Base B</Text>
                <TextInput
                  label="Nome da base"
                  value={rightLabel}
                  onChange={(event) => setRightLabel(event.currentTarget.value)}
                  placeholder="Ex: Base colega"
                />
                <TextInput
                  label="Caminho do arquivo"
                  value={rightPath}
                  onChange={(event) => setRightPath(event.currentTarget.value)}
                  placeholder="Ex: \\\\SERVIDOR\\Pasta\\colega\\estoque.db"
                />
                <Group>
                  <Button variant="light" onClick={() => chooseDatabaseFile("right")}>
                    Escolher arquivo
                  </Button>
                </Group>
              </Stack>
            </Card>
          </SimpleGrid>

          <Group justify="space-between" wrap="wrap">
            <Badge variant="light">Comparação por ID do produto</Badge>
            <Button onClick={startManualCompare} loading={compareMutation.isPending}>
              Comparar manualmente
            </Button>
          </Group>
        </Stack>
      </Card>

      {compareResult ? (
        <>
          <SimpleGrid cols={{ base: 2, md: 5 }}>
            <Card withBorder p="sm" style={{ cursor: "pointer" }} onClick={() => setFilter("DIFFERENT")}>
              <Text size="xs" c="dimmed">Divergentes</Text>
              <Text fw={700} size="xl" c="red">{compareResult.summary.divergent_items}</Text>
            </Card>
            <Card withBorder p="sm" style={{ cursor: "pointer" }} onClick={() => setFilter("CANOAS")}>
              <Text size="xs" c="dimmed">Diferenças em Canoas</Text>
              <Text fw={700} size="xl" c="blue">{compareResult.summary.canoas_mismatch_items}</Text>
            </Card>
            <Card withBorder p="sm" style={{ cursor: "pointer" }} onClick={() => setFilter("PF")}>
              <Text size="xs" c="dimmed">Diferenças em PF</Text>
              <Text fw={700} size="xl" c="orange">{compareResult.summary.pf_mismatch_items}</Text>
            </Card>
            <Card withBorder p="sm" style={{ cursor: "pointer" }} onClick={() => setFilter("ONLY_LEFT")}>
              <Text size="xs" c="dimmed">Só na base A</Text>
              <Text fw={700} size="xl">{compareResult.summary.only_left_items}</Text>
            </Card>
            <Card withBorder p="sm" style={{ cursor: "pointer" }} onClick={() => setFilter("ONLY_RIGHT")}>
              <Text size="xs" c="dimmed">Só na base B</Text>
              <Text fw={700} size="xl">{compareResult.summary.only_right_items}</Text>
            </Card>
          </SimpleGrid>

          <SimpleGrid cols={{ base: 1, md: 2 }}>
            <Card withBorder>
              <Stack gap={4}>
                <Text fw={600}>{compareResult.left.label}</Text>
                <Text size="sm" c="dimmed">{compareResult.left.path}</Text>
                <Text size="sm">Itens: {compareResult.left.total_items}</Text>
                <Text size="sm">Ativos: {compareResult.left.active_items}</Text>
                <Text size="sm">Com estoque: {compareResult.left.with_stock_items}</Text>
                <Text size="sm">Tamanho: {formatBytes(compareResult.left.file_size)}</Text>
              </Stack>
            </Card>
            <Card withBorder>
              <Stack gap={4}>
                <Text fw={600}>{compareResult.right.label}</Text>
                <Text size="sm" c="dimmed">{compareResult.right.path}</Text>
                <Text size="sm">Itens: {compareResult.right.total_items}</Text>
                <Text size="sm">Ativos: {compareResult.right.active_items}</Text>
                <Text size="sm">Com estoque: {compareResult.right.with_stock_items}</Text>
                <Text size="sm">Tamanho: {formatBytes(compareResult.right.file_size)}</Text>
              </Stack>
            </Card>
          </SimpleGrid>

          <FilterToolbar>
            <Group align="end" wrap="wrap">
              <Select
                label="Filtro"
                data={FILTER_OPTIONS}
                value={filter}
                onChange={(value) => setFilter((value as CompareFilter) || "DIFFERENT")}
                allowDeselect={false}
                w={240}
              />
              <TextInput
                label="Buscar item"
                placeholder="ID ou nome"
                value={search}
                onChange={(event) => setSearch(event.currentTarget.value)}
                w={280}
              />
              <Button variant="subtle" onClick={() => { setFilter("DIFFERENT"); setSearch(""); }}>
                Limpar filtros
              </Button>
            </Group>
          </FilterToolbar>

          <DataTable minWidth={1500}>
            <Table striped highlightOnHover withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>ID</Table.Th>
                  <Table.Th>Produto</Table.Th>
                  <Table.Th>{compareResult.left.label} Canoas</Table.Th>
                  <Table.Th>{compareResult.right.label} Canoas</Table.Th>
                  <Table.Th>Dif. Canoas</Table.Th>
                  <Table.Th>{compareResult.left.label} PF</Table.Th>
                  <Table.Th>{compareResult.right.label} PF</Table.Th>
                  <Table.Th>Dif. PF</Table.Th>
                  <Table.Th>{compareResult.left.label} status</Table.Th>
                  <Table.Th>{compareResult.right.label} status</Table.Th>
                  <Table.Th>Análise</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rows.map((row: StockCompareRowOut) => (
                  <Table.Tr key={row.product_id}>
                    <Table.Td>{row.product_id}</Table.Td>
                    <Table.Td>
                      <Stack gap={2}>
                        <Text fw={600}>{row.display_name || "-"}</Text>
                        {row.left_name && row.right_name && row.left_name !== row.right_name && (
                          <Text size="xs" c="dimmed">
                            A: {row.left_name} | B: {row.right_name}
                          </Text>
                        )}
                      </Stack>
                    </Table.Td>
                    <Table.Td>{row.left_qtd_canoas ?? "-"}</Table.Td>
                    <Table.Td>{row.right_qtd_canoas ?? "-"}</Table.Td>
                    <Table.Td>
                      <Badge color={stockBadgeColor(row.diff_canoas)} variant="light">
                        {row.diff_canoas}
                      </Badge>
                    </Table.Td>
                    <Table.Td>{row.left_qtd_pf ?? "-"}</Table.Td>
                    <Table.Td>{row.right_qtd_pf ?? "-"}</Table.Td>
                    <Table.Td>
                      <Badge color={stockBadgeColor(row.diff_pf)} variant="light">
                        {row.diff_pf}
                      </Badge>
                    </Table.Td>
                    <Table.Td>{boolLabel(row.left_ativo)}</Table.Td>
                    <Table.Td>{boolLabel(row.right_ativo)}</Table.Td>
                    <Table.Td>
                      <Group gap={6}>
                        {row.statuses.map((status) => (
                          <Badge
                            key={`${row.product_id}-${status}`}
                            color={STATUS_META[status]?.color || "gray"}
                            variant="light"
                          >
                            {STATUS_META[status]?.label || status}
                          </Badge>
                        ))}
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
                {rows.length === 0 && (
                  <Table.Tr>
                    <Table.Td colSpan={11}>
                      <EmptyState message="Nenhum item encontrado para o filtro atual." />
                    </Table.Td>
                  </Table.Tr>
                )}
              </Table.Tbody>
            </Table>
          </DataTable>
        </>
      ) : (
        <Card withBorder>
          <EmptyState message="Publique uma base ou escolha duas bases manuais para iniciar a comparação." />
        </Card>
      )}
    </Stack>
  );
}
