import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Badge,
  Button,
  Group,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useDebouncedValue, useDisclosure } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import { useForm } from "@mantine/form";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconPlus } from "@tabler/icons-react";
import { useNavigate } from "react-router-dom";

import { api } from "../lib/apiClient";
import FilterToolbar from "../components/ui/FilterToolbar";
import PageHeader from "../components/ui/PageHeader";
import { ProductDetailsDrawer } from "../components/products/ProductDetailsDrawer";
import { ProductFormModal } from "../components/products/ProductFormModal";
import { ProductsListTable } from "../components/products/ProductsListTable";
import { useProductMovement } from "../hooks/useProductMovement";
import {
  adjustmentReasonLabel,
  movementColor,
  movementNatureLabel,
  movementNatureOptionsByType,
  PRODUCT_ADJUSTMENT_REASON_OPTIONS,
  PRODUCT_LOCATIONS,
} from "../lib/productMovement";
import { useProfileScope } from "../state/profileScope";
import type {
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
  { value: "-total_stock", label: "Maior estoque total" },
  { value: "total_stock", label: "Menor estoque total" },
  { value: "-qtd_canoas", label: "Maior quantidade em Canoas" },
  { value: "qtd_canoas", label: "Menor quantidade em Canoas" },
  { value: "-qtd_pf", label: "Maior quantidade em PF" },
  { value: "qtd_pf", label: "Menor quantidade em PF" },
];
const MAX_IMAGES = 5;

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
  const {
    action,
    movementForm,
    selectAction,
    handleMovementSubmit,
    createMovementLoading,
  } = useProductMovement({ selectedId, profileScopeKey });

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
            placeholder="Buscar por nome ou #ID"
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

      <ProductsListTable
        rows={rows}
        page={page}
        pageSize={pageSize}
        selectedId={selectedId}
        totalItems={totalItems}
        totalPages={totalPages}
        loading={productsQuery.isLoading}
        errorMessage={productsErrorMessage}
        query={query}
        onRetry={() => void productsQuery.refetch()}
        onClearSearch={() => {
          setQuery("");
          setPage(1);
        }}
        onOpenDetails={openDetails}
        onOpenSingleLabel={openSingleLabel}
        onOpenEdit={openEdit}
        onConfirmDelete={confirmDelete}
        onPageChange={setPage}
      />

      <ProductFormModal
        opened={formOpened}
        onClose={handleFormClose}
        editing={editing}
        createForm={createForm}
        editForm={editForm}
        onCreateSubmit={handleCreateSubmit}
        onEditSubmit={handleEditSubmit}
        createLoading={createMutation.isPending}
        editLoading={patchMutation.isPending}
      />

      <ProductDetailsDrawer
        opened={drawerOpened}
        onClose={closeDetails}
        currentProduct={currentProduct}
        loading={detailQuery.isLoading}
        observacao={observacao}
        onObservacaoChange={setObservacao}
        onSaveObservacao={() => {
          if (!currentProduct) return;
          patchObservacaoMutation.mutate({
            id: currentProduct.id,
            observacao: observacao.trim(),
          });
        }}
        saveObservacaoLoading={patchObservacaoMutation.isPending}
        descriptionOpened={descOpened}
        onOpenDescription={descHandlers.open}
        onCloseDescription={descHandlers.close}
        imagesLoading={imagesQuery.isLoading}
        imageItems={imagesQuery.data?.data?.items ?? []}
        imagesTotal={imagesQuery.data?.data?.total ?? 0}
        maxImages={MAX_IMAGES}
        onAddImages={handleAddImages}
        onSetPrimaryImage={(imageId) => setPrimaryImageMutation.mutate(imageId)}
        setPrimaryImageLoading={setPrimaryImageMutation.isPending}
        onDeleteImage={(imageId) => deleteImageMutation.mutate(imageId)}
        deleteImageLoading={deleteImageMutation.isPending}
        uploadImagesLoading={uploadImagesMutation.isPending}
        action={action}
        onSelectAction={selectAction}
        movementForm={movementForm}
        onSubmitMovement={handleMovementSubmit}
        locations={PRODUCT_LOCATIONS.map((item) => ({ value: item.value, label: item.label }))}
        adjustmentReasonOptions={PRODUCT_ADJUSTMENT_REASON_OPTIONS}
        movementNatureOptionsByType={movementNatureOptionsByType}
        createMovementLoading={createMovementLoading}
        pageSizes={PAGE_SIZES}
        historyPageSize={historyPageSize}
        onHistoryPageSizeChange={(value) => {
          setHistoryPageSize(value);
          setHistoryPage(1);
        }}
        historyLoading={historyQuery.isLoading}
        historyErrorMessage={historyQuery.error instanceof Error ? historyQuery.error.message : null}
        historyRows={historyQuery.data?.data ?? []}
        historyTotalItems={historyQuery.data?.meta?.total_items ?? 0}
        historyPage={historyPage}
        historyTotalPages={historyTotalPages}
        onHistoryPageChange={setHistoryPage}
        movementColor={movementColor}
        movementNatureLabel={movementNatureLabel}
        adjustmentReasonLabel={adjustmentReasonLabel}
        onRetryHistory={() => void historyQuery.refetch()}
      />
    </Stack>
  );
}
