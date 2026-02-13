import { useEffect, useState } from "react";
import {
  Group,
  Loader,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Title,
  Pagination,
  Badge,
  Button,
  Modal,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { useForm } from "@mantine/form";
import { useDebouncedValue, useDisclosure } from "@mantine/hooks";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";

import { api } from "../lib/apiClient";
import type { MovementCreate, SuccessResponse, MovementOut, Product } from "../lib/api";

const MOVEMENT_TYPES = [
  { value: "ENTRADA", label: "Entrada" },
  { value: "SAIDA", label: "Saida" },
  { value: "TRANSFERENCIA", label: "Transferencia" },
];

const MOVEMENT_NATURES = [
  { value: "OPERACAO_NORMAL", label: "Operacao normal" },
  { value: "TRANSFERENCIA_EXTERNA", label: "Transferencia externa" },
  { value: "DEVOLUCAO", label: "Devolucao" },
  { value: "AJUSTE", label: "Ajuste" },
];

const LOCATIONS = [
  { value: "CANOAS", label: "Canoas" },
  { value: "PF", label: "Passo Fundo" },
];

type MovementFilters = {
  produto_id: string;
  tipo: "" | MovementCreate["tipo"];
  natureza: "" | NonNullable<MovementCreate["natureza"]>;
  origem: "" | "CANOAS" | "PF";
  destino: "" | "CANOAS" | "PF";
  date_from: Date | null;
  date_to: Date | null;
};

function movementColor(tipo: MovementOut["tipo"]) {
  if (tipo === "ENTRADA") return "green";
  if (tipo === "SAIDA") return "red";
  return "yellow";
}

function movementNatureLabel(natureza: MovementOut["natureza"]) {
  return MOVEMENT_NATURES.find((item) => item.value === natureza)?.label ?? natureza;
}

export default function MovementsPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState("10");
  const [sort, setSort] = useState<string>("-data");
  const [productSearch, setProductSearch] = useState("");
  const [showProductId, setShowProductId] = useState(false);
  const [debouncedProductSearch] = useDebouncedValue(productSearch, 300);

  useEffect(() => {
    setPage(1);
  }, [pageSize, sort]);

  const filtersForm = useForm<MovementFilters>({
    initialValues: {
      produto_id: "",
      tipo: "",
      natureza: "",
      origem: "",
      destino: "",
      date_from: null,
      date_to: null,
    },
  });

  const productLookupQuery = useQuery<SuccessResponse<Product[]>>({
    queryKey: ["movimentacoes-product-lookup", debouncedProductSearch],
    queryFn: ({ signal }) =>
      api.listProducts(
        {
          query: debouncedProductSearch,
          page: 1,
          page_size: 20,
          sort: "nome",
        },
        { signal }
      ),
    enabled: debouncedProductSearch.trim().length >= 2,
    staleTime: 30_000,
  });

  const productOptions = (productLookupQuery.data?.data ?? []).map((product) => ({
    value: String(product.id),
    label: `${product.nome} (#${product.id})`,
  }));

  const listQuery = useQuery<SuccessResponse<MovementOut[]>>({
    queryKey: ["movimentacoes", page, pageSize, sort, filtersForm.values],
    queryFn: ({ signal }) =>
      api.listMovements(
        {
          produto_id: filtersForm.values.produto_id
            ? Number(filtersForm.values.produto_id)
            : undefined,
          tipo: filtersForm.values.tipo || undefined,
          natureza: filtersForm.values.natureza || undefined,
          origem: filtersForm.values.origem || undefined,
          destino: filtersForm.values.destino || undefined,
          date_from: filtersForm.values.date_from
            ? dayjs(filtersForm.values.date_from).toISOString()
            : undefined,
          date_to: filtersForm.values.date_to
            ? dayjs(filtersForm.values.date_to).toISOString()
            : undefined,
          page,
          page_size: Number(pageSize),
          sort,
        },
        { signal }
      ),
  });

  const totalItems = listQuery.data?.meta?.total_items ?? 0;
  const totalPages = Math.max(listQuery.data?.meta?.total_pages ?? 1, 1);

  const [historyOpened, historyHandlers] = useDisclosure(false);
  const [historyProductId, setHistoryProductId] = useState<number | null>(null);

  const historyQuery = useQuery<SuccessResponse<MovementOut[]>>({
    queryKey: ["historico", historyProductId],
    queryFn: ({ signal }) =>
      api.getProductHistory(historyProductId!, { page: 1, page_size: 20, sort: "-data" }, { signal }),
    enabled: !!historyProductId,
  });

  const openHistory = (productId: number) => {
    setHistoryProductId(productId);
    historyHandlers.open();
  };

  const closeHistory = () => {
    historyHandlers.close();
    setHistoryProductId(null);
  };

  return (
    <Stack gap="xl">
      <Stack gap="sm">
        <Title order={2}>Historico de movimentacoes</Title>
        <Group align="end">
          <Switch
            label="Mostrar ID"
            checked={showProductId}
            onChange={(event) => setShowProductId(event.currentTarget.checked)}
          />
          {showProductId && (
            <TextInput
              label="Produto ID"
              value={filtersForm.values.produto_id}
              onChange={(event) => filtersForm.setFieldValue("produto_id", event.currentTarget.value)}
              w={140}
            />
          )}
          <Select
            label="Produto (nome)"
            placeholder="Buscar por nome"
            data={productOptions}
            searchable
            clearable
            w={280}
            value={filtersForm.values.produto_id || null}
            onChange={(value) => filtersForm.setFieldValue("produto_id", value ?? "")}
            searchValue={productSearch}
            onSearchChange={setProductSearch}
            nothingFoundMessage={
              productSearch.trim().length < 2 ? "Digite ao menos 2 letras" : "Nenhum produto"
            }
            rightSection={productLookupQuery.isFetching ? <Loader size="xs" /> : undefined}
          />
          <Select label="Tipo" data={MOVEMENT_TYPES} {...filtersForm.getInputProps("tipo")} w={180} />
          <Select label="Natureza" data={MOVEMENT_NATURES} {...filtersForm.getInputProps("natureza")} w={220} />
          <Select label="Origem" data={LOCATIONS} {...filtersForm.getInputProps("origem")} w={140} />
          <Select label="Destino" data={LOCATIONS} {...filtersForm.getInputProps("destino")} w={140} />
          <DatePickerInput
            label="De"
            value={filtersForm.values.date_from}
            onChange={(value) => filtersForm.setFieldValue("date_from", value as Date | null)}
            w={170}
          />
          <DatePickerInput
            label="Ate"
            value={filtersForm.values.date_to}
            onChange={(value) => filtersForm.setFieldValue("date_to", value as Date | null)}
            w={170}
          />
          <Select
            label="Por pagina"
            data={["10", "20", "50"]}
            value={pageSize}
            onChange={(value) => value && setPageSize(value)}
            w={120}
          />
          <Button variant="light" onClick={() => setSort(sort === "-data" ? "data" : "-data")}
          >
            Ordenar: {sort === "-data" ? "Mais recentes" : "Mais antigos"}
          </Button>
        </Group>

        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>ID</Table.Th>
              <Table.Th>Produto</Table.Th>
              <Table.Th>Tipo</Table.Th>
              <Table.Th>Natureza</Table.Th>
              <Table.Th>Qtd</Table.Th>
              <Table.Th>Origem</Table.Th>
              <Table.Th>Destino</Table.Th>
              <Table.Th>Documento</Table.Th>
              <Table.Th>Local externo</Table.Th>
              <Table.Th>Observacao</Table.Th>
              <Table.Th>Data</Table.Th>
              <Table.Th>Acoes</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {listQuery.data?.data?.map((mov: MovementOut) => (
              <Table.Tr key={mov.id}>
                <Table.Td>{mov.id}</Table.Td>
                <Table.Td>{mov.produto_nome || `ID ${mov.produto_id}`}</Table.Td>
                <Table.Td>
                  <Badge color={movementColor(mov.tipo)} variant="light">
                    {mov.tipo}
                  </Badge>
                </Table.Td>
                <Table.Td>{movementNatureLabel(mov.natureza)}</Table.Td>
                <Table.Td>{mov.quantidade}</Table.Td>
                <Table.Td>{mov.origem || "-"}</Table.Td>
                <Table.Td>{mov.destino || "-"}</Table.Td>
                <Table.Td>{mov.documento || "-"}</Table.Td>
                <Table.Td>{mov.local_externo || "-"}</Table.Td>
                <Table.Td>{mov.observacao || "-"}</Table.Td>
                <Table.Td>{dayjs(mov.data).format("DD/MM/YYYY HH:mm")}</Table.Td>
                <Table.Td>
                  <Button size="xs" variant="light" onClick={() => openHistory(mov.produto_id)}>
                    Ver historico
                  </Button>
                </Table.Td>
              </Table.Tr>
            ))}
            {listQuery.data?.data?.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={12}>
                  <Text c="dimmed" ta="center">
                    Nenhuma movimentacao encontrada
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>

        <Group justify="space-between">
          <Text size="sm" c="dimmed">Total: {totalItems}</Text>
          <Pagination value={page} onChange={setPage} total={totalPages} />
        </Group>
      </Stack>

      <Modal opened={historyOpened} onClose={closeHistory} title="Historico do produto" size="lg">
        <Table striped>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>ID</Table.Th>
              <Table.Th>Tipo</Table.Th>
              <Table.Th>Natureza</Table.Th>
              <Table.Th>Qtd</Table.Th>
              <Table.Th>Origem</Table.Th>
              <Table.Th>Destino</Table.Th>
              <Table.Th>Documento</Table.Th>
              <Table.Th>Local externo</Table.Th>
              <Table.Th>Observacao</Table.Th>
              <Table.Th>Data</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {historyQuery.data?.data?.map((mov: MovementOut) => (
              <Table.Tr key={mov.id}>
                <Table.Td>{mov.id}</Table.Td>
                <Table.Td>
                  <Badge color={movementColor(mov.tipo)} variant="light">
                    {mov.tipo}
                  </Badge>
                </Table.Td>
                <Table.Td>{movementNatureLabel(mov.natureza)}</Table.Td>
                <Table.Td>{mov.quantidade}</Table.Td>
                <Table.Td>{mov.origem || "-"}</Table.Td>
                <Table.Td>{mov.destino || "-"}</Table.Td>
                <Table.Td>{mov.documento || "-"}</Table.Td>
                <Table.Td>{mov.local_externo || "-"}</Table.Td>
                <Table.Td>{mov.observacao || "-"}</Table.Td>
                <Table.Td>{dayjs(mov.data).format("DD/MM/YYYY HH:mm")}</Table.Td>
              </Table.Tr>
            ))}
            {historyQuery.data?.data?.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={10}>
                  <Text c="dimmed" ta="center">Sem historico</Text>
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </Modal>
    </Stack>
  );
}
