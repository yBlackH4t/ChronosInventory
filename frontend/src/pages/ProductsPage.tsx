import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconBarcode, IconEdit, IconPlus, IconStar, IconStarFilled, IconTrash } from "@tabler/icons-react";
import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";

import { api } from "../lib/apiClient";
import DataTable from "../components/ui/DataTable";
import EmptyState from "../components/ui/EmptyState";
import FilterToolbar from "../components/ui/FilterToolbar";
import PageHeader from "../components/ui/PageHeader";
import { useProfileScope } from "../state/profileScope";
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
import { clearTabState, loadTabState, saveTabState } from "../state/tabStateCache";

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
type MovementNature = "OPERACAO_NORMAL" | "TRANSFERENCIA_EXTERNA" | "DEVOLUCAO" | "AJUSTE";
type AdjustmentReason =
  | "AVARIA"
  | "PERDA"
  | "CORRECAO_INVENTARIO"
  | "ERRO_OPERACIONAL"
  | "TRANSFERENCIA";
const MAX_IMAGES = 5;

const MOVEMENT_NATURE_OPTIONS: { value: MovementNature; label: string }[] = [
  { value: "OPERACAO_NORMAL", label: "Operacao normal" },
  { value: "TRANSFERENCIA_EXTERNA", label: "Transferencia externa" },
  { value: "DEVOLUCAO", label: "Devolucao" },
  { value: "AJUSTE", label: "Ajuste" },
];

const ADJUSTMENT_REASON_OPTIONS: { value: AdjustmentReason; label: string }[] = [
  { value: "AVARIA", label: "Avaria" },
  { value: "PERDA", label: "Perda" },
  { value: "CORRECAO_INVENTARIO", label: "Correcao inventario" },
  { value: "ERRO_OPERACIONAL", label: "Erro operacional" },
  { value: "TRANSFERENCIA", label: "Transferencia" },
];

function movementColor(tipo: MovementType) {
  if (tipo === "ENTRADA") return "green";
  if (tipo === "SAIDA") return "red";
  return "yellow";
}

function movementNatureLabel(natureza: MovementNature) {
  return MOVEMENT_NATURE_OPTIONS.find((item) => item.value === natureza)?.label ?? natureza;
}

function adjustmentReasonLabel(reason?: AdjustmentReason | null) {
  if (!reason) return "-";
  return ADJUSTMENT_REASON_OPTIONS.find((item) => item.value === reason)?.label ?? reason;
}

function movementNatureOptionsByType(tipo: MovementType): { value: MovementNature; label: string }[] {
  if (tipo === "ENTRADA") {
    return MOVEMENT_NATURE_OPTIONS.filter((item) =>
      item.value === "OPERACAO_NORMAL" || item.value === "DEVOLUCAO" || item.value === "AJUSTE"
    );
  }
  if (tipo === "SAIDA") {
    return MOVEMENT_NATURE_OPTIONS.filter((item) =>
      item.value === "OPERACAO_NORMAL" || item.value === "TRANSFERENCIA_EXTERNA" || item.value === "AJUSTE"
    );
  }
  return MOVEMENT_NATURE_OPTIONS.filter((item) => item.value !== "DEVOLUCAO" && item.value !== "TRANSFERENCIA_EXTERNA");
}

const PRODUCTS_TAB_ID = "products";

type ProductsTabState = {
  query: string;
  page: number;
  pageSize: string;
  sort: string;
  selectedId: number | null;
  drawerOpened: boolean;
  historyPage: number;
  historyPageSize: string;
  scrollY: number;
};

const DEFAULT_PRODUCTS_TAB_STATE: ProductsTabState = {
  query: "",
  page: 1,
  pageSize: "10",
  sort: "nome",
  selectedId: null,
  drawerOpened: false,
  historyPage: 1,
  historyPageSize: "10",
  scrollY: 0,
};

export default function ProductsPage() {
  const navigate = useNavigate();
  const { profileScopeKey } = useProfileScope();
  const persistedState = useMemo(
    () => loadTabState<ProductsTabState>(PRODUCTS_TAB_ID) ?? DEFAULT_PRODUCTS_TAB_STATE,
    []
  );
  const [query, setQuery] = useState(persistedState.query);
  const [debounced] = useDebouncedValue(query, 350);
  const [page, setPage] = useState(persistedState.page);
  const [pageSize, setPageSize] = useState(persistedState.pageSize);
  const [sort, setSort] = useState(persistedState.sort);
  const [scrollY, setScrollY] = useState(persistedState.scrollY);

  const queryClient = useQueryClient();
  const searchInputRef = useRef<HTMLInputElement>(null);

  const productsQuery = useQuery<SuccessResponse<Product[]>>({
    queryKey: ["produtos", profileScopeKey, debounced, page, pageSize, sort],
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
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const createMutation = useMutation<SuccessResponse<Product>, Error, ProductCreate>({
    mutationFn: (payload: ProductCreate) => api.createProduct(payload),
    onSuccess: (response) => {
      notifySuccess("Produto criado");
      const createdId = response.data.id;
      setSelectedId(createdId);
      setSelectedSnapshot(response.data);
      createForm.reset();
      createForm.resetDirty();
      formHandlers.close();
      queryClient.invalidateQueries({ queryKey: ["produtos", profileScopeKey] });
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
      if (editing?.id) {
        setSelectedId(editing.id);
      }
      editForm.resetDirty();
      formHandlers.close();
      queryClient.invalidateQueries({ queryKey: ["produtos", profileScopeKey] });
      queryClient.invalidateQueries({ queryKey: ["produto", profileScopeKey, editing?.id] });
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
      queryClient.invalidateQueries({ queryKey: ["produtos", profileScopeKey] });
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
    createForm.resetDirty();
    formHandlers.open();
  };

  const openEdit = (product: Product) => {
    setEditing(product);
    editForm.setValues({
      nome: product.nome,
      observacao: product.observacao ?? "",
    });
    editForm.resetDirty();
    formHandlers.open();
  };

  const handleCreateSubmit = createForm.onSubmit((values) => {
    if ((values.qtd_canoas ?? 0) + (values.qtd_pf ?? 0) <= 0) {
      const msg = "Estoque inicial nao pode ser 0. Use entrada/devolucao para registrar depois.";
      createForm.setFieldError("qtd_canoas", msg);
      createForm.setFieldError("qtd_pf", msg);
      return;
    }
    createMutation.mutate(values);
  });

  const handleEditSubmit = editForm.onSubmit((values) => {
    if (!editing) return;
    patchMutation.mutate({
      id: editing.id,
      payload: { nome: values.nome.trim(), observacao: values.observacao.trim() },
    });
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

  const [drawerOpened, setDrawerOpened] = useState<boolean>(persistedState.drawerOpened);
  const [selectedId, setSelectedId] = useState<number | null>(persistedState.selectedId);
  const [selectedSnapshot, setSelectedSnapshot] = useState<Product | null>(null);

  const openDetails = (product: Product) => {
    setSelectedId(product.id);
    setSelectedSnapshot(product);
    setDrawerOpened(true);
    setHistoryPage(1);
  };

  const openSingleLabel = (productId: number) => {
    navigate(`/etiquetas?ids=${productId}`);
  };

  const closeDetails = () => {
    setDrawerOpened(false);
    setSelectedSnapshot(null);
  };

  const detailQuery = useQuery<SuccessResponse<Product>>({
    queryKey: ["produto", profileScopeKey, selectedId],
    queryFn: ({ signal }) => api.getProduct(selectedId!, { signal }),
    enabled: !!selectedId && drawerOpened,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

  const currentProduct = detailQuery.data?.data ?? selectedSnapshot;

  const imagesQuery = useQuery<SuccessResponse<{ items: ProductImageItem[]; total: number; max_images: number }>>({
    queryKey: ["produto-imagens", profileScopeKey, selectedId],
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
      queryClient.invalidateQueries({ queryKey: ["produto-imagens", profileScopeKey, selectedId] });
      queryClient.invalidateQueries({ queryKey: ["produtos", profileScopeKey] });
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
      queryClient.invalidateQueries({ queryKey: ["produto-imagens", profileScopeKey, selectedId] });
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
      queryClient.invalidateQueries({ queryKey: ["produto-imagens", profileScopeKey, selectedId] });
      queryClient.invalidateQueries({ queryKey: ["produtos", profileScopeKey] });
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

  const [observacaoDraft, setObservacaoDraft] = useState<{ productId: number | null; value: string }>({
    productId: null,
    value: "",
  });
  const currentProductId = currentProduct?.id ?? null;
  const observacao =
    observacaoDraft.productId === currentProductId
      ? observacaoDraft.value
      : (currentProduct?.observacao ?? "");
  const setObservacao = (value: string) => {
    setObservacaoDraft({ productId: currentProductId, value });
  };

  const patchObservacaoMutation = useMutation<
    SuccessResponse<Product>,
    Error,
    { id: number; observacao: string }
  >({
    mutationFn: ({ id, observacao }) => api.patchProduct(id, { observacao }),
    onSuccess: () => {
      notifySuccess("Observacao atualizada");
      queryClient.invalidateQueries({ queryKey: ["produtos", profileScopeKey] });
      queryClient.invalidateQueries({ queryKey: ["produto", profileScopeKey, selectedId] });
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
      natureza: "OPERACAO_NORMAL",
      local_externo: "",
      documento: "",
      movimento_ref_id: undefined,
      motivo_ajuste: undefined,
    },
    validate: {
      quantidade: (value) => (value <= 0 ? "Quantidade invalida" : null),
      origem: (value, values) =>
        values.tipo !== "ENTRADA" && !value ? "Origem obrigatoria" : null,
      destino: (value, values) =>
        values.tipo !== "SAIDA" && !value ? "Destino obrigatorio" : null,
      natureza: (value, values) => {
        if (!value) return "Natureza obrigatoria";
        if (value === "DEVOLUCAO" && values.tipo !== "ENTRADA") {
          return "Devolucao so pode ser ENTRADA";
        }
        if (value === "TRANSFERENCIA_EXTERNA" && values.tipo !== "SAIDA") {
          return "Transferencia externa so pode ser SAIDA";
        }
        return null;
      },
      local_externo: (value, values) =>
        values.natureza === "TRANSFERENCIA_EXTERNA" && !(value || "").trim()
          ? "Informe o local externo"
          : null,
      movimento_ref_id: (value, values) => {
        if (values.natureza === "DEVOLUCAO" && (!value || value < 1)) {
          return "Informe o movimento de referencia";
        }
        if (value !== undefined && value !== null && value < 1) {
          return "Movimento de referencia invalido";
        }
        return null;
      },
      motivo_ajuste: (value, values) => {
        if (values.natureza === "AJUSTE" && !value) {
          return "Informe o motivo do ajuste";
        }
        return null;
      },
      observacao: (value, values) =>
        values.natureza === "AJUSTE" && !(value || "").trim()
          ? "Observacao obrigatoria para ajuste"
          : null,
    },
  });

  const createMovementMutation = useMutation<SuccessResponse<MovementOut>, Error, MovementCreate>({
    mutationFn: (payload: MovementCreate) => api.createMovement(payload),
    onSuccess: () => {
      notifySuccess("Movimentacao registrada");
      queryClient.invalidateQueries({ queryKey: ["produtos", profileScopeKey] });
      queryClient.invalidateQueries({ queryKey: ["produto", profileScopeKey, selectedId] });
      queryClient.invalidateQueries({ queryKey: ["historico", profileScopeKey, selectedId] });
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
      natureza: "OPERACAO_NORMAL",
      local_externo: "",
      documento: "",
      movimento_ref_id: undefined,
      motivo_ajuste: undefined,
    });
  };

  const handleMovementSubmit = movementForm.onSubmit((values) => {
    if (!selectedId) return;
    if (values.tipo === "TRANSFERENCIA" && values.origem === values.destino) {
      movementForm.setFieldError("destino", "Destino deve ser diferente da origem");
      return;
    }
    if (values.natureza === "DEVOLUCAO" && values.tipo !== "ENTRADA") {
      movementForm.setFieldError("natureza", "Devolucao so pode ser ENTRADA");
      return;
    }
    if (values.natureza === "TRANSFERENCIA_EXTERNA" && values.tipo !== "SAIDA") {
      movementForm.setFieldError("natureza", "Transferencia externa so pode ser SAIDA");
      return;
    }
    if (values.natureza === "TRANSFERENCIA_EXTERNA" && !(values.local_externo || "").trim()) {
      movementForm.setFieldError("local_externo", "Informe o local externo");
      return;
    }
    if (values.natureza === "DEVOLUCAO" && (!values.movimento_ref_id || values.movimento_ref_id < 1)) {
      movementForm.setFieldError("movimento_ref_id", "Informe o movimento de referencia");
      return;
    }
    if (values.natureza === "AJUSTE" && !values.motivo_ajuste) {
      movementForm.setFieldError("motivo_ajuste", "Informe o motivo do ajuste");
      return;
    }
    if (values.natureza === "AJUSTE" && !(values.observacao || "").trim()) {
      movementForm.setFieldError("observacao", "Observacao obrigatoria para ajuste");
      return;
    }

    createMovementMutation.mutate({
      ...values,
      produto_id: selectedId,
      origem: values.tipo === "ENTRADA" ? undefined : values.origem,
      destino: values.tipo === "SAIDA" ? undefined : values.destino,
      motivo_ajuste: values.natureza === "AJUSTE" ? values.motivo_ajuste : undefined,
      observacao: values.observacao?.trim() || undefined,
      local_externo: values.local_externo?.trim() || undefined,
      documento: values.documento?.trim() || undefined,
      movimento_ref_id: values.movimento_ref_id || undefined,
    });
  });

  const [historyPage, setHistoryPage] = useState(persistedState.historyPage);
  const [historyPageSize, setHistoryPageSize] = useState(persistedState.historyPageSize);

  const historyQuery = useQuery<SuccessResponse<MovementOut[]>>({
    queryKey: ["historico", profileScopeKey, selectedId, historyPage, historyPageSize],
    queryFn: ({ signal }) =>
      api.getProductHistory(
        selectedId!,
        { page: historyPage, page_size: Number(historyPageSize), sort: "-data" },
        { signal }
      ),
    enabled: !!selectedId,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const [descOpened, descHandlers] = useDisclosure(false);

  const totalItems = productsQuery.data?.meta?.total_items ?? 0;
  const totalPages = Math.max(productsQuery.data?.meta?.total_pages ?? 1, 1);
  const historyTotalPages = Math.max(historyQuery.data?.meta?.total_pages ?? 1, 1);
  const productsErrorMessage = productsQuery.error instanceof Error ? productsQuery.error.message : null;

  const rows = useMemo(() => {
    return productsQuery.data?.data ?? [];
  }, [productsQuery.data?.data]);

  const activeViewCount = useMemo(() => {
    let count = 0;
    if (query.trim()) count += 1;
    if (sort !== DEFAULT_PRODUCTS_TAB_STATE.sort) count += 1;
    if (pageSize !== DEFAULT_PRODUCTS_TAB_STATE.pageSize) count += 1;
    return count;
  }, [pageSize, query, sort]);

  const persistState = useCallback((nextScrollY = scrollY) => {
    saveTabState<ProductsTabState>(PRODUCTS_TAB_ID, {
      query,
      page,
      pageSize,
      sort,
      selectedId,
      drawerOpened,
      historyPage,
      historyPageSize,
      scrollY: nextScrollY,
    });
  }, [drawerOpened, historyPage, historyPageSize, page, pageSize, query, scrollY, selectedId, sort]);

  useEffect(() => {
    persistState();
  }, [persistState]);

  useEffect(() => {
    if (!persistedState.scrollY || persistedState.scrollY <= 0) return;
    const timer = window.setTimeout(() => {
      window.scrollTo({ top: persistedState.scrollY, behavior: "auto" });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [persistedState.scrollY]);

  useEffect(() => {
    let timeout: number | null = null;
    const onScroll = () => {
      if (timeout !== null) return;
      timeout = window.setTimeout(() => {
        setScrollY(window.scrollY);
        timeout = null;
      }, 180);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      if (timeout !== null) window.clearTimeout(timeout);
      window.removeEventListener("scroll", onScroll);
      persistState(window.scrollY);
    };
  }, [persistState]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const resetView = () => {
    setQuery(DEFAULT_PRODUCTS_TAB_STATE.query);
    setPage(DEFAULT_PRODUCTS_TAB_STATE.page);
    setPageSize(DEFAULT_PRODUCTS_TAB_STATE.pageSize);
    setSort(DEFAULT_PRODUCTS_TAB_STATE.sort);
    setHistoryPage(DEFAULT_PRODUCTS_TAB_STATE.historyPage);
    setHistoryPageSize(DEFAULT_PRODUCTS_TAB_STATE.historyPageSize);
    setSelectedId(null);
    setSelectedSnapshot(null);
    setDrawerOpened(false);
    clearTabState(PRODUCTS_TAB_ID);
    window.scrollTo({ top: 0, behavior: "auto" });
  };

  const handleFormClose = () => {
    if (createMutation.isPending || patchMutation.isPending) return;
    const dirty = editing ? editForm.isDirty() : createForm.isDirty();
    if (!dirty) {
      formHandlers.close();
      return;
    }

    modals.openConfirmModal({
      title: "Descartar alteracoes?",
      children: (
        <Text size="sm">
          Existem alteracoes nao salvas. Deseja fechar e descartar o formulario?
        </Text>
      ),
      labels: { confirm: "Descartar", cancel: "Continuar editando" },
      confirmProps: { color: "red" },
      onConfirm: () => {
        if (editing) {
          editForm.reset();
          editForm.resetDirty();
        } else {
          createForm.reset();
          createForm.resetDirty();
        }
        formHandlers.close();
      },
    });
  };

  return (
    <Stack gap="md">
      <PageHeader
        title="Produtos"
        subtitle="Catalogo com controle de estoque, imagens e historico de movimentacoes."
        actions={(
          <Button leftSection={<IconPlus size={16} />} onClick={openCreate}>
            Novo produto
          </Button>
        )}
      />

      <FilterToolbar>
        <Group align="end" wrap="wrap">
          <TextInput
            placeholder="Buscar por nome"
            label="Busca"
            value={query}
            onChange={(event) => {
              setQuery(event.currentTarget.value);
              setPage(1);
            }}
            w={260}
            ref={searchInputRef}
          />
          <Select
            data={PAGE_SIZES}
            value={pageSize}
            onChange={(value) => {
              if (!value) return;
              setPageSize(value);
              setPage(1);
            }}
            w={120}
            label="Por pagina"
          />
          <Select
            data={SORT_OPTIONS}
            value={sort}
            onChange={(value) => {
              if (!value) return;
              setSort(value);
              setPage(1);
            }}
            w={200}
            label="Ordenacao"
          />
          <Badge variant="light">
            Filtros ativos: {activeViewCount}
          </Badge>
          <Button
            variant="subtle"
            onClick={() => {
              setQuery("");
              setPage(1);
            }}
            disabled={!query.trim()}
          >
            Limpar busca
          </Button>
          <Button variant="subtle" onClick={resetView}>
            Resetar visao
          </Button>
        </Group>
      </FilterToolbar>

      {productsQuery.isLoading ? (
        <Group justify="center" mt="xl">
          <Loader />
        </Group>
      ) : productsErrorMessage ? (
        <EmptyState
          message={`Falha ao carregar produtos: ${productsErrorMessage}`}
          actionLabel="Tentar novamente"
          onAction={() => void productsQuery.refetch()}
        />
      ) : (
        <DataTable minWidth={860}>
          <Table striped highlightOnHover withTableBorder>
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
                const rowClass = `${inStock ? "row-in-stock" : "row-out-stock"} ${selectedId === product.id ? "row-selected" : ""}`;

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
                        <Tooltip label="Gerar etiqueta">
                          <ActionIcon variant="light" onClick={() => openSingleLabel(product.id)}>
                            <IconBarcode size={16} />
                          </ActionIcon>
                        </Tooltip>
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
                    <EmptyState
                      message="Nenhum produto encontrado"
                      actionLabel={query.trim() ? "Limpar busca" : undefined}
                      onAction={
                        query.trim()
                          ? () => {
                              setQuery("");
                              setPage(1);
                            }
                          : undefined
                      }
                    />
                  </Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </DataTable>
      )}

      <Group justify="space-between">
        <Text size="sm" c="dimmed">
          Total: {totalItems}
        </Text>
        <Pagination value={page} onChange={setPage} total={totalPages} />
      </Group>

      <Modal
        opened={formOpened}
        onClose={handleFormClose}
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
                    <Select
                      label="Natureza"
                      data={movementNatureOptionsByType(movementForm.values.tipo)}
                      w={220}
                      {...movementForm.getInputProps("natureza")}
                    />
                    {movementForm.values.natureza === "TRANSFERENCIA_EXTERNA" && (
                      <TextInput
                        label="Local externo"
                        w={220}
                        placeholder="Ex: Matriz, Maringa"
                        {...movementForm.getInputProps("local_externo")}
                      />
                    )}
                    {movementForm.values.natureza === "AJUSTE" && (
                      <Select
                        label="Motivo do ajuste"
                        data={ADJUSTMENT_REASON_OPTIONS}
                        w={220}
                        {...movementForm.getInputProps("motivo_ajuste")}
                      />
                    )}
                    <TextInput
                      label="Documento (NF)"
                      w={180}
                      placeholder="Ex: NF 12345"
                      {...movementForm.getInputProps("documento")}
                    />
                    {movementForm.values.natureza === "DEVOLUCAO" && (
                      <NumberInput
                        label="Mov. referencia"
                        min={1}
                        w={170}
                        {...movementForm.getInputProps("movimento_ref_id")}
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
                      onChange={(value) => {
                        if (!value) return;
                        setHistoryPageSize(value);
                        setHistoryPage(1);
                      }}
                      w={120}
                    />
                  </Group>

                  {historyQuery.isLoading ? (
                    <Group justify="center" py="md">
                      <Loader size="sm" />
                    </Group>
                  ) : historyQuery.error instanceof Error ? (
                    <EmptyState
                      message={`Falha ao carregar historico: ${historyQuery.error.message}`}
                      actionLabel="Tentar novamente"
                      onAction={() => void historyQuery.refetch()}
                    />
                  ) : (
                    <>
                      <Table striped highlightOnHover>
                        <Table.Thead>
                          <Table.Tr>
                            <Table.Th>ID</Table.Th>
                            <Table.Th>Tipo</Table.Th>
                            <Table.Th>Natureza</Table.Th>
                            <Table.Th>Qtd</Table.Th>
                            <Table.Th>Origem</Table.Th>
                            <Table.Th>Destino</Table.Th>
                            <Table.Th>Documento</Table.Th>
                            <Table.Th>Motivo ajuste</Table.Th>
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
                              <Table.Td>{adjustmentReasonLabel(mov.motivo_ajuste as AdjustmentReason | undefined)}</Table.Td>
                              <Table.Td>{mov.local_externo || "-"}</Table.Td>
                              <Table.Td>{mov.observacao || "-"}</Table.Td>
                              <Table.Td>{dayjs(mov.data).format("DD/MM/YYYY HH:mm")}</Table.Td>
                            </Table.Tr>
                          ))}
                          {historyQuery.data?.data?.length === 0 && (
                            <Table.Tr>
                              <Table.Td colSpan={11}>
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
                    </>
                  )}
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
