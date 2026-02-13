import { useEffect, useMemo, useState } from "react";
import {
  ActionIcon,
  Badge,
  Button,
  Divider,
  Drawer,
  FileButton,
  Group,
  Image,
  Loader,
  Modal,
  NumberInput,
  Pagination,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
  Textarea,
  Tooltip,
  Title,
} from "@mantine/core";
import { useDebouncedValue, useDisclosure } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import { useForm } from "@mantine/form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconEdit, IconPlus, IconStar, IconStarFilled, IconTrash } from "@tabler/icons-react";
import dayjs from "dayjs";

import { api } from "../lib/apiClient";
import type {
  MovementCreate,
  MovementOut,
  Product,
  ProductCreate,
  ProductImageItem,
  ProductImagesUploadOut,
  SuccessResponse,
} from "../lib/api";
import { notifyError, notifySuccess } from "../lib/notify";

const PAGE_SIZES = [
  { value: "10", label: "10" },
  { value: "20", label: "20" },
  { value: "50", label: "50" },
];

const SORT_OPTIONS = [
  { value: "nome", label: "Nome A-Z" },
  { value: "-nome", label: "Nome Z-A" },
  { value: "id", label: "ID crescente" },
  { value: "-id", label: "ID decrescente" },
];

const LOCATIONS = [
  { value: "CANOAS", label: "Canoas" },
  { value: "PF", label: "Passo Fundo" },
];

type MovementType = "ENTRADA" | "SAIDA" | "TRANSFERENCIA";
const MAX_IMAGES = 5;

function movementColor(tipo: MovementType) {
  if (tipo === "ENTRADA") return "green";
  if (tipo === "SAIDA") return "red";
  return "yellow";
}

export default function ProductsPage() {
  const [query, setQuery] = useState("");
  const [debounced] = useDebouncedValue(query, 350);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState("10");
  const [sort, setSort] = useState("nome");

  const queryClient = useQueryClient();

  useEffect(() => {
    setPage(1);
  }, [debounced, pageSize, sort]);

  const productsQuery = useQuery<SuccessResponse<Product[]>>({
    queryKey: ["produtos", debounced, page, pageSize, sort],
    queryFn: ({ signal }) =>
      api.listProducts(
        {
          query: debounced,
          page,
          page_size: Number(pageSize),
          sort,
        },
        { signal }
      ),
  });

  const createMutation = useMutation<SuccessResponse<Product>, Error, ProductCreate>({
    mutationFn: (payload: ProductCreate) => api.createProduct(payload),
    onSuccess: () => {
      notifySuccess("Produto criado");
      queryClient.invalidateQueries({ queryKey: ["produtos"] });
    },
    onError: (error) => notifyError(error),
  });

  const patchMutation = useMutation<
    SuccessResponse<Product>,
    Error,
    { id: number; payload: { nome: string; observacao: string } }
  >({
    mutationFn: (args) => api.patchProduct(args.id, args.payload),
    onSuccess: () => {
      notifySuccess("Produto atualizado");
      queryClient.invalidateQueries({ queryKey: ["produtos"] });
      queryClient.invalidateQueries({ queryKey: ["produto", editing?.id] });
    },
    onError: (error) => notifyError(error),
  });

  const deleteMutation = useMutation<
    SuccessResponse<{ id: number; nome: string; message: string }>,
    Error,
    number
  >({
    mutationFn: (id: number) => api.deleteProduct(id),
    onSuccess: () => {
      notifySuccess("Produto removido");
      queryClient.invalidateQueries({ queryKey: ["produtos"] });
    },
    onError: (error) => notifyError(error),
  });

  const [formOpened, formHandlers] = useDisclosure(false);
  const [editing, setEditing] = useState<Product | null>(null);

  const createForm = useForm<ProductCreate>({
    initialValues: {
      nome: "",
      qtd_canoas: 0,
      qtd_pf: 0,
    },
    validate: {
      nome: (value) => (value.trim().length === 0 ? "Nome obrigatorio" : null),
      qtd_canoas: (value) => (value < 0 ? "Nao pode ser negativo" : null),
      qtd_pf: (value) => (value < 0 ? "Nao pode ser negativo" : null),
    },
  });

  const editForm = useForm<{ nome: string; observacao: string }>({
    initialValues: {
      nome: "",
      observacao: "",
    },
    validate: {
      nome: (value) => (value.trim().length === 0 ? "Nome obrigatorio" : null),
    },
  });

  const openCreate = () => {
    setEditing(null);
    createForm.setValues({ nome: "", qtd_canoas: 0, qtd_pf: 0 });
    formHandlers.open();
  };

  const openEdit = (product: Product) => {
    setEditing(product);
    editForm.setValues({
      nome: product.nome,
      observacao: product.observacao ?? "",
    });
    formHandlers.open();
  };

  const handleCreateSubmit = createForm.onSubmit((values) => {
    createMutation.mutate(values);
    formHandlers.close();
  });

  const handleEditSubmit = editForm.onSubmit((values) => {
    if (!editing) return;
    patchMutation.mutate({
      id: editing.id,
      payload: { nome: values.nome.trim(), observacao: values.observacao.trim() },
    });
    formHandlers.close();
  });

  const confirmDelete = (product: Product) => {
    modals.openConfirmModal({
      title: "Excluir produto",
      children: <Text size="sm">Tem certeza que deseja excluir {product.nome}?</Text>,
      labels: { confirm: "Excluir", cancel: "Cancelar" },
      confirmProps: { color: "red" },
      onConfirm: () => deleteMutation.mutate(product.id),
    });
  };

  const [drawerOpened, drawerHandlers] = useDisclosure(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedSnapshot, setSelectedSnapshot] = useState<Product | null>(null);

  const openDetails = (product: Product) => {
    setSelectedId(product.id);
    setSelectedSnapshot(product);
    drawerHandlers.open();
  };

  const closeDetails = () => {
    drawerHandlers.close();
    setSelectedId(null);
    setSelectedSnapshot(null);
  };

  const detailQuery = useQuery<SuccessResponse<Product>>({
    queryKey: ["produto", selectedId],
    queryFn: ({ signal }) => api.getProduct(selectedId!, { signal }),
    enabled: !!selectedId,
  });

  const currentProduct = detailQuery.data?.data ?? selectedSnapshot;

  const imagesQuery = useQuery<SuccessResponse<{ items: ProductImageItem[]; total: number; max_images: number }>>({
    queryKey: ["produto-imagens", selectedId],
    queryFn: ({ signal }) => api.listProductImages(selectedId!, { signal }),
    enabled: !!selectedId,
    retry: false,
  });

  const uploadImagesMutation = useMutation<
    SuccessResponse<ProductImagesUploadOut>,
    Error,
    File[]
  >({
    mutationFn: (files: File[]) => api.uploadProductImages(selectedId!, files),
    onSuccess: () => {
      notifySuccess("Imagem(ns) adicionada(s)");
      queryClient.invalidateQueries({ queryKey: ["produto-imagens", selectedId] });
      queryClient.invalidateQueries({ queryKey: ["produtos"] });
    },
    onError: (error) => notifyError(error),
  });

  const setPrimaryImageMutation = useMutation<
    SuccessResponse<{ id: number; message: string }>,
    Error,
    number
  >({
    mutationFn: (imageId: number) => api.setPrimaryProductImage(selectedId!, imageId),
    onSuccess: () => {
      notifySuccess("Imagem principal definida");
      queryClient.invalidateQueries({ queryKey: ["produto-imagens", selectedId] });
    },
    onError: (error) => notifyError(error),
  });

  const deleteImageMutation = useMutation<
    SuccessResponse<{ id: number; message: string }>,
    Error,
    number
  >({
    mutationFn: (imageId: number) => api.deleteProductImage(selectedId!, imageId),
    onSuccess: () => {
      notifySuccess("Imagem removida");
      queryClient.invalidateQueries({ queryKey: ["produto-imagens", selectedId] });
      queryClient.invalidateQueries({ queryKey: ["produtos"] });
    },
    onError: (error) => notifyError(error),
  });

  const handleAddImages = (files: File[] | null) => {
    if (!files || files.length === 0) return;
    const currentTotal = imagesQuery.data?.data?.total ?? 0;
    if (currentTotal + files.length > MAX_IMAGES) {
      notifyError(new Error(`Limite de ${MAX_IMAGES} imagens por produto.`));
      return;
    }
    uploadImagesMutation.mutate(files);
  };

  const [observacao, setObservacao] = useState("");

  useEffect(() => {
    if (currentProduct) {
      setObservacao(currentProduct.observacao ?? "");
    }
  }, [currentProduct?.id, currentProduct?.observacao]);

  const patchObservacaoMutation = useMutation<
    SuccessResponse<Product>,
    Error,
    { id: number; observacao: string }
  >({
    mutationFn: ({ id, observacao }) => api.patchProduct(id, { observacao }),
    onSuccess: () => {
      notifySuccess("Observacao atualizada");
      queryClient.invalidateQueries({ queryKey: ["produtos"] });
      queryClient.invalidateQueries({ queryKey: ["produto", selectedId] });
    },
    onError: (error) => notifyError(error),
  });

  const [action, setAction] = useState<MovementType | null>(null);

  const movementForm = useForm<MovementCreate>({
    initialValues: {
      tipo: "ENTRADA",
      produto_id: 0,
      quantidade: 1,
      origem: "CANOAS",
      destino: "CANOAS",
      observacao: "",
    },
    validate: {
      quantidade: (value) => (value <= 0 ? "Quantidade invalida" : null),
      origem: (value, values) =>
        values.tipo !== "ENTRADA" && !value ? "Origem obrigatoria" : null,
      destino: (value, values) =>
        values.tipo !== "SAIDA" && !value ? "Destino obrigatorio" : null,
    },
  });

  const createMovementMutation = useMutation<SuccessResponse<MovementOut>, Error, MovementCreate>({
    mutationFn: (payload: MovementCreate) => api.createMovement(payload),
    onSuccess: () => {
      notifySuccess("Movimentacao registrada");
      queryClient.invalidateQueries({ queryKey: ["produtos"] });
      queryClient.invalidateQueries({ queryKey: ["produto", selectedId] });
      queryClient.invalidateQueries({ queryKey: ["historico", selectedId] });
    },
    onError: (error) => notifyError(error),
  });

  const selectAction = (next: MovementType) => {
    if (action === next) {
      setAction(null);
      return;
    }
    setAction(next);
    movementForm.setValues({
      tipo: next,
      produto_id: selectedId ?? 0,
      quantidade: 1,
      origem: next === "ENTRADA" ? undefined : "CANOAS",
      destino: next === "SAIDA" ? undefined : "CANOAS",
      observacao: "",
    });
  };

  const handleMovementSubmit = movementForm.onSubmit((values) => {
    if (!selectedId) return;
    if (values.tipo === "TRANSFERENCIA" && values.origem === values.destino) {
      movementForm.setFieldError("destino", "Destino deve ser diferente da origem");
      return;
    }

    createMovementMutation.mutate({
      ...values,
      produto_id: selectedId,
      origem: values.tipo === "ENTRADA" ? undefined : values.origem,
      destino: values.tipo === "SAIDA" ? undefined : values.destino,
    });
  });

  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState("10");

  useEffect(() => {
    setHistoryPage(1);
  }, [historyPageSize, selectedId]);

  const historyQuery = useQuery<SuccessResponse<MovementOut[]>>({
    queryKey: ["historico", selectedId, historyPage, historyPageSize],
    queryFn: ({ signal }) =>
      api.getProductHistory(
        selectedId!,
        { page: historyPage, page_size: Number(historyPageSize), sort: "-data" },
        { signal }
      ),
    enabled: !!selectedId,
  });

  const [descOpened, descHandlers] = useDisclosure(false);

  const totalItems = productsQuery.data?.meta?.total_items ?? 0;
  const totalPages = Math.max(productsQuery.data?.meta?.total_pages ?? 1, 1);
  const historyTotalPages = Math.max(historyQuery.data?.meta?.total_pages ?? 1, 1);

  const rows = useMemo(() => {
    return productsQuery.data?.data ?? [];
  }, [productsQuery.data?.data]);

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Title order={2}>Produtos</Title>
        <Button leftSection={<IconPlus size={16} />} onClick={openCreate}>
          Novo produto
        </Button>
      </Group>

      <Group align="end" wrap="wrap">
        <TextInput
          placeholder="Buscar por nome"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          w={260}
        />
        <Select
          data={PAGE_SIZES}
          value={pageSize}
          onChange={(value) => value && setPageSize(value)}
          w={120}
          label="Por pagina"
        />
        <Select
          data={SORT_OPTIONS}
          value={sort}
          onChange={(value) => value && setSort(value)}
          w={200}
          label="Ordenacao"
        />
      </Group>

      {productsQuery.isLoading ? (
        <Group justify="center" mt="xl">
          <Loader />
        </Group>
      ) : (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>#</Table.Th>
              <Table.Th>ID</Table.Th>
              <Table.Th>Nome</Table.Th>
              <Table.Th>Canoas</Table.Th>
              <Table.Th>PF</Table.Th>
              <Table.Th>Total</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Acoes</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((product: Product, index: number) => {
              const position = (page - 1) * Number(pageSize) + index + 1;
              const inStock = product.total_stock > 0;
              const rowClass = inStock ? "row-in-stock" : "row-out-stock";

              return (
                <Table.Tr
                  key={product.id}
                  className={rowClass}
                  onClick={() => openDetails(product)}
                  style={{ cursor: "pointer" }}
                >
                  <Table.Td>{position}</Table.Td>
                  <Table.Td>{product.id}</Table.Td>
                  <Table.Td>{product.nome}</Table.Td>
                  <Table.Td>{product.qtd_canoas}</Table.Td>
                  <Table.Td>{product.qtd_pf}</Table.Td>
                  <Table.Td>
                    <Badge variant="light">{product.total_stock}</Badge>
                  </Table.Td>
                  <Table.Td>
                    <Badge color={inStock ? "green" : "red"} variant="light">
                      {inStock ? "Em estoque" : "Sem estoque"}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs" onClick={(event) => event.stopPropagation()}>
                      <ActionIcon variant="light" onClick={() => openEdit(product)}>
                        <IconEdit size={16} />
                      </ActionIcon>
                      <ActionIcon color="red" variant="light" onClick={() => confirmDelete(product)}>
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              );
            })}
            {rows.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={8}>
                  <Text c="dimmed" ta="center">
                    Nenhum produto encontrado
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      )}

      <Group justify="space-between">
        <Text size="sm" c="dimmed">
          Total: {totalItems}
        </Text>
        <Pagination value={page} onChange={setPage} total={totalPages} />
      </Group>

      <Modal
        opened={formOpened}
        onClose={formHandlers.close}
        title={editing ? "Editar produto" : "Novo produto"}
      >
        {editing ? (
          <form onSubmit={handleEditSubmit}>
            <Stack>
              <TextInput label="Nome" {...editForm.getInputProps("nome")} />
              <Textarea label="Descricao" minRows={3} {...editForm.getInputProps("observacao")} />
              <Button type="submit" loading={patchMutation.isPending}>
                Salvar
              </Button>
            </Stack>
          </form>
        ) : (
          <form onSubmit={handleCreateSubmit}>
            <Stack>
              <TextInput label="Nome" {...createForm.getInputProps("nome")} />
              <NumberInput label="Qtd Canoas" min={0} {...createForm.getInputProps("qtd_canoas")} />
              <NumberInput label="Qtd PF" min={0} {...createForm.getInputProps("qtd_pf")} />
              <Button type="submit" loading={createMutation.isPending}>
                Salvar
              </Button>
            </Stack>
          </form>
        )}
      </Modal>

      <Drawer
        opened={drawerOpened}
        onClose={closeDetails}
        title={currentProduct ? `Produto ${currentProduct.nome}` : "Detalhes do produto"}
        position="right"
        size="xl"
      >
        {detailQuery.isLoading && (
          <Group justify="center" mt="md">
            <Loader />
          </Group>
        )}

        {currentProduct && (
          <Stack gap="md">
            <Group align="flex-start" justify="space-between" wrap="wrap">
              <Stack gap="xs" maw={360}>
                <Text size="sm" c="dimmed">ID</Text>
                <Text fw={600}>{currentProduct.id}</Text>
                <Text size="sm" c="dimmed">Canoas</Text>
                <Text fw={600}>{currentProduct.qtd_canoas}</Text>
                <Text size="sm" c="dimmed">PF</Text>
                <Text fw={600}>{currentProduct.qtd_pf}</Text>
                <Text size="sm" c="dimmed">Total</Text>
                <Text fw={600}>{currentProduct.total_stock}</Text>

                <Textarea
                  label="Descricao"
                  value={observacao}
                  onChange={(event) => setObservacao(event.currentTarget.value)}
                  minRows={3}
                />
                <Group gap="xs">
                  <Button
                    variant="light"
                    onClick={() =>
                      patchObservacaoMutation.mutate({
                        id: currentProduct.id,
                        observacao: observacao.trim(),
                      })
                    }
                    loading={patchObservacaoMutation.isPending}
                  >
                    Salvar descricao
                  </Button>
                  <Button variant="subtle" onClick={descHandlers.open}>
                    Ver descricao
                  </Button>
                </Group>
              </Stack>

              <Stack gap="xs" maw={420}>
                <Group justify="space-between" align="center">
                  <Text size="sm" c="dimmed">Imagens</Text>
                  <Badge variant="light">
                    {imagesQuery.data?.data?.total ?? 0}/{MAX_IMAGES}
                  </Badge>
                </Group>

                {imagesQuery.isLoading && <Loader size="sm" />}

                {!imagesQuery.isLoading && (imagesQuery.data?.data?.items?.length ?? 0) === 0 && (
                  <Text size="sm" c="dimmed">Sem imagem cadastrada.</Text>
                )}

                {(imagesQuery.data?.data?.items?.length ?? 0) > 0 && (
                  <SimpleGrid cols={2} spacing="sm">
                    {(imagesQuery.data?.data?.items ?? []).map((img) => (
                      <Stack key={img.id} gap={4}>
                        <Image
                          src={`data:${img.mime_type};base64,${img.image_base64}`}
                          alt={`${currentProduct.nome} ${img.id}`}
                          fit="cover"
                          h={120}
                          radius="sm"
                        />
                        <Group justify="space-between" wrap="nowrap">
                          <Tooltip label={img.is_primary ? "Imagem principal" : "Definir como principal"}>
                            <ActionIcon
                              variant="light"
                              color={img.is_primary ? "yellow" : "gray"}
                              onClick={() => !img.is_primary && setPrimaryImageMutation.mutate(img.id)}
                              loading={setPrimaryImageMutation.isPending}
                            >
                              {img.is_primary ? <IconStarFilled size={16} /> : <IconStar size={16} />}
                            </ActionIcon>
                          </Tooltip>
                          <ActionIcon
                            color="red"
                            variant="light"
                            onClick={() => deleteImageMutation.mutate(img.id)}
                            loading={deleteImageMutation.isPending}
                          >
                            <IconTrash size={16} />
                          </ActionIcon>
                        </Group>
                      </Stack>
                    ))}
                  </SimpleGrid>
                )}

                <FileButton
                  multiple
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(files) => handleAddImages((files as File[] | null) ?? null)}
                >
                  {(props) => (
                    <Button
                      {...props}
                      variant="light"
                      loading={uploadImagesMutation.isPending}
                      disabled={(imagesQuery.data?.data?.total ?? 0) >= MAX_IMAGES}
                    >
                      Adicionar imagens
                    </Button>
                  )}
                </FileButton>
              </Stack>
            </Group>

            <Divider />

            <Stack gap="sm">
              <Title order={4}>Acoes</Title>
              <Group gap="sm">
                <Button
                  variant={action === "ENTRADA" ? "filled" : "light"}
                  onClick={() => selectAction("ENTRADA")}
                >
                  Dar entrada
                </Button>
                <Button
                  color="red"
                  variant={action === "SAIDA" ? "filled" : "light"}
                  onClick={() => selectAction("SAIDA")}
                >
                  Dar saida
                </Button>
                <Button
                  color="yellow"
                  variant={action === "TRANSFERENCIA" ? "filled" : "light"}
                  onClick={() => selectAction("TRANSFERENCIA")}
                >
                  Fazer transferencia
                </Button>
              </Group>

              {action && (
                <form onSubmit={handleMovementSubmit}>
                  <Group align="end" wrap="wrap" mt="sm">
                    <NumberInput
                      label="Quantidade"
                      min={1}
                      w={140}
                      {...movementForm.getInputProps("quantidade")}
                    />
                    {action !== "ENTRADA" && (
                      <Select
                        label="Origem"
                        data={LOCATIONS}
                        w={160}
                        {...movementForm.getInputProps("origem")}
                      />
                    )}
                    {action !== "SAIDA" && (
                      <Select
                        label="Destino"
                        data={LOCATIONS}
                        w={160}
                        {...movementForm.getInputProps("destino")}
                      />
                    )}
                    <TextInput
                      label="Observacao"
                      w={240}
                      {...movementForm.getInputProps("observacao")}
                    />
                    <Button type="submit" loading={createMovementMutation.isPending}>
                      Confirmar
                    </Button>
                  </Group>
                </form>
              )}
            </Stack>

            <Divider />

            <Tabs defaultValue="historico">
              <Tabs.List>
                <Tabs.Tab value="historico">Historico</Tabs.Tab>
              </Tabs.List>

              <Tabs.Panel value="historico" pt="md">
                <Stack gap="sm">
                  <Group align="end" wrap="wrap">
                    <Select
                      label="Por pagina"
                      data={PAGE_SIZES}
                      value={historyPageSize}
                      onChange={(value) => value && setHistoryPageSize(value)}
                      w={120}
                    />
                  </Group>

                  <Table striped highlightOnHover>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>ID</Table.Th>
                        <Table.Th>Tipo</Table.Th>
                        <Table.Th>Qtd</Table.Th>
                        <Table.Th>Origem</Table.Th>
                        <Table.Th>Destino</Table.Th>
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
                          <Table.Td>{mov.quantidade}</Table.Td>
                          <Table.Td>{mov.origem || "-"}</Table.Td>
                          <Table.Td>{mov.destino || "-"}</Table.Td>
                          <Table.Td>{dayjs(mov.data).format("DD/MM/YYYY HH:mm")}</Table.Td>
                        </Table.Tr>
                      ))}
                      {historyQuery.data?.data?.length === 0 && (
                        <Table.Tr>
                          <Table.Td colSpan={6}>
                            <Text c="dimmed" ta="center">
                              Sem historico
                            </Text>
                          </Table.Td>
                        </Table.Tr>
                      )}
                    </Table.Tbody>
                  </Table>

                  <Group justify="space-between">
                    <Text size="sm" c="dimmed">
                      Total: {historyQuery.data?.meta?.total_items ?? 0}
                    </Text>
                    <Pagination
                      value={historyPage}
                      onChange={setHistoryPage}
                      total={historyTotalPages}
                    />
                  </Group>
                </Stack>
              </Tabs.Panel>
            </Tabs>
          </Stack>
        )}
      </Drawer>

      <Modal opened={descOpened} onClose={descHandlers.close} title="Descricao" size="lg">
        <Stack gap="sm">
          <ScrollArea h={260} offsetScrollbars>
            <Text style={{ whiteSpace: "pre-wrap" }} size="md">
              {observacao || "Sem descricao."}
            </Text>
          </ScrollArea>
          <Button
            variant="light"
            onClick={() => navigator.clipboard.writeText(observacao || "")}
          >
            Copiar descricao
          </Button>
        </Stack>
      </Modal>
    </Stack>
  );
}
