import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActionIcon,
  Badge,
  Button,
  Chip,
  Group,
  Kbd,
  Popover,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useDebouncedValue, useDisclosure } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import { useForm } from "@mantine/form";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  IconAdjustmentsHorizontal,
  IconPlus,
  IconRestore,
  IconSearch,
  IconX,
} from "@tabler/icons-react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { api } from "../lib/apiClient";
import FilterToolbar from "../components/ui/FilterToolbar";
import PageHeader from "../components/ui/PageHeader";
import { ProductDetailsDrawer } from "../components/products/ProductDetailsDrawer";
import { ProductFormModal } from "../components/products/ProductFormModal";
import { ProductsListTable } from "../components/products/ProductsListTable";
import ProductLinkModal from "../components/products/ProductLinkModal";
import { QuickMovementModal } from "../components/products/QuickMovementModal";
import { useProductMovement } from "../hooks/useProductMovement";
import { useLocations } from "../hooks/useLocations";
import { MAX_PRODUCT_IMAGES, useProductImages } from "../hooks/useProductImages";
import { useScanner } from "../lib/useScanner";
import { useMotionLevel } from "../lib/motionContext";
import { animateRowOut } from "../lib/rowExit";
import { applyMovementToProduct, flashKindFor } from "../lib/productView";
import { captureFlight, clearFlight } from "../lib/sharedFlight";
import type { StockFlash } from "../components/products/StockNumber";
import {
  adjustmentReasonLabel,
  movementColor,
  movementNatureLabel,
  movementNatureOptionsByType,
  PRODUCT_ADJUSTMENT_REASON_OPTIONS,
} from "../lib/productMovement";
import { useProfileScope } from "../state/profileScope";
import type {
  MovementCreate,
  MovementOut,
  Product,
  ProductCreate,
  ProductStatusBulkOut,
  SuccessResponse,
} from "../lib/api";
import { notifyError, notifySuccess } from "../lib/notify";
import {
  clearTabState,
  loadTabState,
  saveTabState,
} from "../state/tabStateCache";

const PAGE_SIZES = [
  { value: "10", label: "10" },
  { value: "25", label: "25" },
  { value: "50", label: "50" },
  { value: "100", label: "100" },
];

const SORT_OPTIONS = [
  { value: "nome", label: "Nome A-Z" },
  { value: "-nome", label: "Nome Z-A" },
  { value: "id", label: "ID crescente" },
  { value: "-id", label: "ID decrescente" },
  { value: "-total_stock", label: "Maior estoque total" },
  { value: "total_stock", label: "Menor estoque total" },
];

const PRODUCTS_TAB_ID = "products";

type StockFilter = "TODOS" | "COM_ESTOQUE" | "ZERADOS";

const STOCK_FILTERS: { value: StockFilter; label: string }[] = [
  { value: "TODOS", label: "Todos" },
  { value: "COM_ESTOQUE", label: "Com estoque" },
  { value: "ZERADOS", label: "Zerados" },
];

function isStockFilter(value: unknown): value is StockFilter {
  return STOCK_FILTERS.some((item) => item.value === value);
}

type ProductsTabState = {
  query: string;
  page: number;
  pageSize: string;
  sort: string;
  stockFilter?: StockFilter;
  selectedId: number | null;
  drawerOpened: boolean;
  historyPage: number;
  historyPageSize: string;
  scrollY: number;
};

const DEFAULT_PRODUCTS_TAB_STATE: ProductsTabState = {
  query: "",
  page: 1,
  pageSize: "25",
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
  const { activeLocations: locations } = useLocations();
  const persistedState = useMemo(
    () =>
      loadTabState<ProductsTabState>(PRODUCTS_TAB_ID) ??
      DEFAULT_PRODUCTS_TAB_STATE,
    [],
  );
  const [query, setQuery] = useState(persistedState.query);
  const [debounced] = useDebouncedValue(query, 350);
  const [page, setPage] = useState(persistedState.page);
  const [pageSize, setPageSize] = useState(
    PAGE_SIZES.some((option) => option.value === persistedState.pageSize)
      ? persistedState.pageSize
      : DEFAULT_PRODUCTS_TAB_STATE.pageSize,
  );
  const [sort, setSort] = useState(persistedState.sort);
  const [scrollY, setScrollY] = useState(persistedState.scrollY);
  const [stockFilter, setStockFilter] = useState<StockFilter>(
    isStockFilter(persistedState.stockFilter) ? persistedState.stockFilter : "TODOS",
  );

  const [linkModalOpened, { open: openLinkModal, close: closeLinkModal }] = useDisclosure(false);
  const [linkModalProduct, setLinkModalProduct] = useState<Product | null>(null);

  const queryClient = useQueryClient();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { listen } = useScanner();
  const [searchParams, setSearchParams] = useSearchParams();

  const [hoveredProduct, setHoveredProduct] = useState<Product | null>(null);
  const [quickMoveProduct, setQuickMoveProduct] = useState<Product | null>(null);
  const [quickMoveOpened, setQuickMoveOpened] = useState(false);

  const motionLevel = useMotionLevel();
  const [stockFlash, setStockFlash] = useState<StockFlash | null>(null);
  const flashTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    },
    [],
  );

  // Depois de movimentar: o saldo da linha pisca na cor do movimento e rola até o novo valor.
  // A lista em cache já recebe o saldo novo (a API confirma em seguida, ao recarregar).
  const handleMoved = (product: Product, movement: MovementCreate) => {
    if (motionLevel !== "nenhum") {
      setStockFlash({
        productId: product.id,
        kind: flashKindFor(movement.tipo),
        from: product.total_stock,
        nonce: Date.now(),
      });
      if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
      flashTimer.current = window.setTimeout(() => setStockFlash(null), 1900);
    }
    queryClient.setQueriesData<SuccessResponse<Product[]>>(
      { queryKey: ["produtos", profileScopeKey] },
      (old) =>
        old?.data
          ? {
              ...old,
              data: old.data.map((item) =>
                item.id === product.id ? applyMovementToProduct(item, movement) : item,
              ),
            }
          : old,
    );
    queryClient.invalidateQueries({ queryKey: ["analytics", profileScopeKey, "stock-summary"] });
  };

  const handleOpenQuickMove = (product: Product) => {
    setQuickMoveProduct(product);
    setQuickMoveOpened(true);
  };

  // ?search= (do Ctrl+K ou chat) preenche a busca; ?openId= abre direto o Drawer de detalhes
  const searchParam = searchParams.get("search") || searchParams.get("q");
  const openIdParam = searchParams.get("openId") || searchParams.get("id");
  const [appliedSearchParam, setAppliedSearchParam] = useState<string | null>(null);
  if (searchParam && searchParam !== appliedSearchParam) {
    setAppliedSearchParam(searchParam);
    setQuery(searchParam);
    setPage(1);
  }

  useEffect(() => {
    if (searchParam || openIdParam) {
      setSearchParams({}, { replace: true });
    }
  }, [searchParam, openIdParam, setSearchParams]);

  const productsQuery = useQuery<SuccessResponse<Product[]>>({
    queryKey: ["produtos", profileScopeKey, debounced, page, pageSize, sort, stockFilter],
    queryFn: ({ signal }) =>
      api.listProducts(
        {
          query: debounced,
          page,
          page_size: Number(pageSize),
          sort,
          has_stock:
            stockFilter === "COM_ESTOQUE" ? true : stockFilter === "ZERADOS" ? false : undefined,
        },
        { signal },
      ),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const createMutation = useMutation<
    SuccessResponse<Product>,
    Error,
    ProductCreate
  >({
    mutationFn: (payload: ProductCreate) => api.createProduct(payload),
    onSuccess: (response) => {
      notifySuccess("Produto criado");
      const createdId = response.data.id;
      setSelectedId(createdId);
      setSelectedSnapshot(response.data);
      createForm.reset();
      createForm.resetDirty();
      formHandlers.close();
      queryClient.invalidateQueries({
        queryKey: ["produtos", profileScopeKey],
      });
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
      queryClient.invalidateQueries({
        queryKey: ["produtos", profileScopeKey],
      });
      queryClient.invalidateQueries({
        queryKey: ["produto", profileScopeKey, editing?.id],
      });
    },
    onError: (error) => notifyError(error),
  });

  const inactivateMutation = useMutation<
    SuccessResponse<ProductStatusBulkOut>,
    Error,
    number
  >({
    mutationFn: (productId: number) =>
      api.bulkUpdateProductStatus({ ids: [productId], ativo: false }),
    onSuccess: async (_data, productId) => {
      await animateRowOut(`[data-flip-key="${productId}"]`, motionLevel);
      notifySuccess("Produto inativado");
      queryClient.invalidateQueries({
        queryKey: ["produtos", profileScopeKey],
      });
      setDrawerOpened(false);
      setSelectedSnapshot(null);
    },
    onError: (error) => notifyError(error),
  });

  const deleteMutation = useMutation<
    SuccessResponse<{ id: number; nome: string; message: string }>,
    Error,
    number
  >({
    mutationFn: (id: number) => api.deleteProduct(id),
    onSuccess: async (_data, id) => {
      await animateRowOut(`[data-flip-key="${id}"]`, motionLevel);
      notifySuccess("Produto excluído");
      queryClient.invalidateQueries({
        queryKey: ["produtos", profileScopeKey],
      });
      setDrawerOpened(false);
      setSelectedSnapshot(null);
    },
    onError: (error, productId) => {
      const msg = error.message || "";
      if (msg.includes("inative") || msg.includes("movimentaç")) {
        modals.openConfirmModal({
          title: "Não é possível excluir",
          children: (
            <Stack gap="xs">
              <Text size="sm">{msg}</Text>
              <Text size="xs" c="dimmed">
                Deseja inativar o produto agora para tirá-lo da lista sem perder o histórico?
              </Text>
            </Stack>
          ),
          labels: { confirm: "Inativar produto", cancel: "Cancelar" },
          confirmProps: { color: "warning" },
          onConfirm: () => inactivateMutation.mutate(productId),
        });
      } else {
        notifyError(error);
      }
    },
  });

  const [formOpened, formHandlers] = useDisclosure(false);
  const [editing, setEditing] = useState<Product | null>(null);

  const createForm = useForm<ProductCreate>({
    initialValues: {
      nome: "",
      inventories: {},
      documento_movimento: "",
      observacao_movimento: "",
    },
    validate: {
      nome: (value) => (value.trim().length === 0 ? "Nome obrigatório" : null),
    },
  });

  const editForm = useForm<{ nome: string; observacao: string }>({
    initialValues: {
      nome: "",
      observacao: "",
    },
    validate: {
      nome: (value) => (value.trim().length === 0 ? "Nome obrigatório" : null),
    },
  });

  const openCreate = (nome = "") => {
    setEditing(null);
    createForm.setValues({ 
      nome: nome.toUpperCase(), 
      inventories: {},
      documento_movimento: "",
      observacao_movimento: "",
    });
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
    const total = Object.values(values.inventories ?? {}).reduce(
      (sum, val) => sum + (val || 0),
      0,
    );
    if (total <= 0) {
      notifyError(
        new Error(
          "Estoque inicial não pode ser 0. Use entrada/devolução para registrar depois.",
        ),
      );
      return;
    }
    createMutation.mutate(values);
  });

  const handleEditSubmit = editForm.onSubmit((values) => {
    if (!editing) return;
    patchMutation.mutate({
      id: editing.id,
      payload: {
        nome: values.nome.trim(),
        observacao: values.observacao.trim(),
      },
    });
  });

  const confirmDelete = (product: Product) => {
    modals.openConfirmModal({
      title: "Excluir produto",
      children: (
        <Stack gap="xs">
          <Text size="sm">
            Tem certeza que deseja excluir <strong>{product.nome}</strong>?
          </Text>
          <Text size="xs" c="dimmed">
            Produtos com movimentações não podem ser excluídos; inative para tirar da lista.
          </Text>
        </Stack>
      ),
      labels: { confirm: "Excluir", cancel: "Cancelar" },
      confirmProps: { color: "danger" },
      onConfirm: () => deleteMutation.mutate(product.id),
    });
  };

  const [drawerOpened, setDrawerOpened] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const raw =
        new URLSearchParams(window.location.search).get("openId") ||
        new URLSearchParams(window.location.search).get("id");
      if (raw && Number(raw) > 0) return true;
    }
    return persistedState.drawerOpened;
  });

  const [selectedId, setSelectedId] = useState<number | null>(() => {
    if (typeof window !== "undefined") {
      const raw =
        new URLSearchParams(window.location.search).get("openId") ||
        new URLSearchParams(window.location.search).get("id");
      if (raw && Number(raw) > 0) return Number(raw);
    }
    return persistedState.selectedId;
  });

  const [selectedSnapshot, setSelectedSnapshot] = useState<Product | null>(
    null,
  );

  const openDetails = (product: Product, row?: HTMLElement | null) => {
    // A foto e o código saem da linha e pousam na ficha (só no nível Completo).
    if (row && !drawerOpened) captureFlight(row, product.id);
    else clearFlight();
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

  const {
    imagesQuery,
    uploadImagesMutation,
    setPrimaryImageMutation,
    deleteImageMutation,
    handleAddImages,
  } = useProductImages(selectedId, profileScopeKey);

  const [observacaoDraft, setObservacaoDraft] = useState<{
    productId: number | null;
    value: string;
  }>({
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
      notifySuccess("Observação atualizada");
      queryClient.invalidateQueries({
        queryKey: ["produtos", profileScopeKey],
      });
      queryClient.invalidateQueries({
        queryKey: ["produto", profileScopeKey, selectedId],
      });
    },
    onError: (error) => notifyError(error),
  });
  const {
    action,
    movementForm,
    selectAction,
    handleMovementSubmit,
    createMovementLoading,
  } = useProductMovement({
    selectedId,
    profileScopeKey,
    defaultLocationId: locations[0]?.id ?? 0,
  });

  const [historyPage, setHistoryPage] = useState(persistedState.historyPage);
  const [historyPageSize, setHistoryPageSize] = useState(
    PAGE_SIZES.some((option) => option.value === persistedState.historyPageSize)
      ? persistedState.historyPageSize
      : DEFAULT_PRODUCTS_TAB_STATE.historyPageSize,
  );

  useEffect(() => {
    return listen((code) => {
      // Printed labels encode "CI-<id>"; the search understands "#<id>".
      const labelId = /^CI-(\d+)$/i.exec(code.trim())?.[1];
      const search = labelId ? `#${labelId}` : code;
      setQuery(search);
      setPage(1);
      // Auto-open if it matches exactly 1 product
      api.listProducts({ query: search, page: 1, page_size: 2 }).then((res) => {
        if (res.data?.length === 1) {
          setSelectedId(res.data[0].id);
          setSelectedSnapshot(res.data[0]);
          setDrawerOpened(true);
          setHistoryPage(1);
        }
      }).catch(console.error);
    });
  }, [listen]);

  useEffect(() => {
    if (!openIdParam) return;
    const idNum = Number(openIdParam);
    if (idNum > 0) {
      api
        .getProduct(idNum)
        .then((res) => {
          if (res.data) {
            setSelectedId(idNum);
            setSelectedSnapshot(res.data);
            setDrawerOpened(true);
            setHistoryPage(1);
          }
        })
        .catch(console.error);
    }
  }, [openIdParam]);

  const historyQuery = useQuery<SuccessResponse<MovementOut[]>>({
    queryKey: [
      "historico",
      profileScopeKey,
      selectedId,
      historyPage,
      historyPageSize,
    ],
    queryFn: ({ signal }) =>
      api.getProductHistory(
        selectedId!,
        {
          page: historyPage,
          page_size: Number(historyPageSize),
          sort: "-data",
        },
        { signal },
      ),
    enabled: !!selectedId,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const [descOpened, descHandlers] = useDisclosure(false);

  const totalItems = productsQuery.data?.meta?.total_items ?? 0;
  const totalPages = Math.max(productsQuery.data?.meta?.total_pages ?? 1, 1);
  const historyTotalPages = Math.max(
    historyQuery.data?.meta?.total_pages ?? 1,
    1,
  );
  const productsErrorMessage =
    productsQuery.error instanceof Error ? productsQuery.error.message : null;

  // "Com estoque" is filtered by the API so pagination and totals stay correct.
  const rows = useMemo(() => {
    return productsQuery.data?.data ?? [];
  }, [productsQuery.data?.data]);

  const activeViewCount = useMemo(() => {
    let count = 0;
    if (query.trim()) count += 1;
    if (stockFilter !== "TODOS") count += 1;
    if (sort !== DEFAULT_PRODUCTS_TAB_STATE.sort) count += 1;
    if (pageSize !== DEFAULT_PRODUCTS_TAB_STATE.pageSize) count += 1;
    return count;
  }, [pageSize, query, sort, stockFilter]);

  const viewOptionsCount =
    Number(sort !== DEFAULT_PRODUCTS_TAB_STATE.sort) +
    Number(pageSize !== DEFAULT_PRODUCTS_TAB_STATE.pageSize);

  const persistState = useCallback(
    (nextScrollY = scrollY) => {
      saveTabState<ProductsTabState>(PRODUCTS_TAB_ID, {
        query,
        page,
        pageSize,
        sort,
        stockFilter,
        selectedId,
        drawerOpened,
        historyPage,
        historyPageSize,
        scrollY: nextScrollY,
      });
    },
    [
      drawerOpened,
      historyPage,
      historyPageSize,
      page,
      pageSize,
      query,
      scrollY,
      selectedId,
      sort,
      stockFilter,
    ],
  );

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
        return;
      }

      // Atalho N para movimentar estoque rápido
      const activeEl = document.activeElement;
      const isInput =
        activeEl &&
        (activeEl.tagName === "INPUT" ||
          activeEl.tagName === "TEXTAREA" ||
          activeEl.tagName === "SELECT" ||
          (activeEl as HTMLElement).isContentEditable);

      if (isInput) return;

      if (
        event.key.toLowerCase() === "n" &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        const target =
          hoveredProduct ||
          (drawerOpened && currentProduct ? currentProduct : null) ||
          selectedSnapshot;

        if (target) {
          event.preventDefault();
          handleOpenQuickMove(target);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hoveredProduct, drawerOpened, currentProduct, selectedSnapshot]);

  const resetView = () => {
    setQuery(DEFAULT_PRODUCTS_TAB_STATE.query);
    setStockFilter("TODOS");
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
      title: "Descartar alterações?",
      children: (
        <Text size="sm">
          Existem alterações não salvas. Deseja fechar e descartar o formulário?
        </Text>
      ),
      labels: { confirm: "Descartar", cancel: "Continuar editando" },
      confirmProps: { color: "danger" },
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
        subtitle="Consulta de estoque por filial, equivalências e aplicações."
        actions={
          <Button leftSection={<IconPlus size={16} />} onClick={() => openCreate()}>
            Novo produto
          </Button>
        }
      />

      <FilterToolbar>
        <Group wrap="wrap" gap="sm" align="center">
          <TextInput
            ref={searchInputRef}
            size="md"
            placeholder="Buscar por código (ex: 4031195, 805390), modelo ou #ID"
            aria-label="Buscar produtos"
            leftSection={<IconSearch size={18} stroke={1.5} />}
            rightSectionWidth={query ? 36 : 64}
            rightSection={
              query ? (
                <ActionIcon
                  size="sm"
                  color="gray"
                  aria-label="Limpar busca"
                  onClick={() => {
                    setQuery("");
                    setPage(1);
                  }}
                >
                  <IconX size={14} />
                </ActionIcon>
              ) : (
                <Kbd size="xs">Ctrl F</Kbd>
              )
            }
            value={query}
            onChange={(event) => {
              setQuery(event.currentTarget.value);
              setPage(1);
            }}
            style={{ flex: 1, minWidth: 260 }}
          />
          <Chip.Group
            multiple={false}
            value={stockFilter}
            onChange={(val) => {
              if (!isStockFilter(val)) return;
              setStockFilter(val);
              setPage(1);
            }}
          >
            <Group gap={6} role="group" aria-label="Filtrar por estoque">
              {STOCK_FILTERS.map((item) => (
                <Chip key={item.value} value={item.value} size="sm" variant="light">
                  {item.label}
                </Chip>
              ))}
            </Group>
          </Chip.Group>
          <Popover position="bottom-end" width={260}>
            <Popover.Target>
              <Button
                variant="default"
                leftSection={<IconAdjustmentsHorizontal size={16} stroke={1.5} />}
                rightSection={
                  viewOptionsCount > 0 ? (
                    <Badge size="xs" circle variant="filled">
                      {viewOptionsCount}
                    </Badge>
                  ) : undefined
                }
              >
                Visualização
              </Button>
            </Popover.Target>
            <Popover.Dropdown>
              <Stack gap="sm">
                <Select
                  label="Ordenação"
                  data={SORT_OPTIONS}
                  value={sort}
                  allowDeselect={false}
                  onChange={(value) => {
                    if (!value) return;
                    setSort(value);
                    setPage(1);
                  }}
                  comboboxProps={{ withinPortal: false }}
                />
                <Select
                  label="Itens por página"
                  data={PAGE_SIZES}
                  value={pageSize}
                  allowDeselect={false}
                  onChange={(value) => {
                    if (!value) return;
                    setPageSize(value);
                    setPage(1);
                  }}
                  comboboxProps={{ withinPortal: false }}
                />
                <Button
                  variant="subtle"
                  color="gray"
                  size="xs"
                  leftSection={<IconRestore size={14} />}
                  onClick={resetView}
                  disabled={activeViewCount === 0}
                >
                  Resetar visão
                </Button>
              </Stack>
            </Popover.Dropdown>
          </Popover>
          <Text size="sm" c="dimmed" className="num" ml="auto">
            {totalItems.toLocaleString("pt-BR")}{" "}
            {totalItems === 1 ? "produto" : "produtos"}
          </Text>
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
        flash={stockFlash}
        onRetry={() => void productsQuery.refetch()}
        onClearSearch={() => {
          setQuery("");
          setPage(1);
        }}
        onCreateFromSearch={(text) => openCreate(text)}
        onOpenDetails={openDetails}
        onOpenSingleLabel={openSingleLabel}
        onOpenEdit={openEdit}
        onConfirmDelete={confirmDelete}
        onOpenLinks={(product) => {
          setLinkModalProduct(product);
          openLinkModal();
        }}
        onQuickMove={handleOpenQuickMove}
        onHoverProduct={setHoveredProduct}
        onPageChange={setPage}
        locations={locations}
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
        locations={locations}
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
        maxImages={MAX_PRODUCT_IMAGES}
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
        locations={locations.map((item) => ({
          value: String(item.id),
          label: item.label || item.name,
        }))}
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
        historyErrorMessage={
          historyQuery.error instanceof Error
            ? historyQuery.error.message
            : null
        }
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

      <ProductLinkModal
        opened={linkModalOpened}
        onClose={closeLinkModal}
        product={linkModalProduct}
        onSuccess={() => {
          closeLinkModal();
          queryClient.invalidateQueries({ queryKey: ["produtos", profileScopeKey] });
        }}
      />

      <QuickMovementModal
        opened={quickMoveOpened}
        onClose={() => {
          setQuickMoveOpened(false);
          setQuickMoveProduct(null);
        }}
        product={quickMoveProduct}
        locations={locations}
        onSuccess={(movement) => {
          if (quickMoveProduct) handleMoved(quickMoveProduct, movement);
        }}
      />
    </Stack>
  );
}
