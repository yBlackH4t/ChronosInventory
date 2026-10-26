import { type FormEventHandler, useCallback, useRef, useState } from "react";
import {
  ActionIcon,
  Button,
  Card,
  Drawer,
  FileButton,
  Group,
  Image,
  Loader,
  Modal,
  NumberInput,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  TextInput,
  Textarea,
  Tooltip,
} from "@mantine/core";
import type { UseFormReturnType } from "@mantine/form";
import {
  IconBook2,
  IconHistory,
  IconNote,
  IconPhoto,
  IconPlus,
  IconStar,
  IconStarFilled,
  IconTrash,
} from "@tabler/icons-react";
import { ImageGalleryModal } from "./ImageGalleryModal";
import { ProductCatalogTab } from "./ProductCatalogTab";
import { ProductHistoryTable } from "./ProductHistoryTable";
import { detectBrand, detectCondition } from "../../lib/brands";
import { useMotionLevel } from "../../lib/motionContext";
import { brandTitle, splitProductCode, versionTitle } from "../../lib/productView";
import { playFlight, rowThumbFor } from "../../lib/sharedFlight";
import { stockLevel } from "../../lib/semantic";
import ProductRecentMovements from "./ProductRecentMovements";
import ProductStockHistoryChart from "./ProductStockHistoryChart";
import ProductThumb from "./ProductThumb";
import "../../styles/products-movements.css";

import type {
  MovementCreate,
  MovementOut,
  Product,
  ProductImageItem,
} from "../../lib/api";

type MovementType = "ENTRADA" | "SAIDA" | "TRANSFERENCIA";
type MovementNature =
  | "OPERACAO_NORMAL"
  | "TRANSFERENCIA_EXTERNA"
  | "DEVOLUCAO"
  | "ESTORNO"
  | "AJUSTE";
type AdjustmentReason =
  | "AVARIA"
  | "PERDA"
  | "CORRECAO_INVENTARIO"
  | "ERRO_OPERACIONAL"
  | "TRANSFERENCIA";

type ProductDetailsDrawerProps = {
  opened: boolean;
  onClose: () => void;
  currentProduct: Product | null;
  loading: boolean;
  observacao: string;
  onObservacaoChange: (value: string) => void;
  onSaveObservacao: () => void;
  saveObservacaoLoading: boolean;
  descriptionOpened: boolean;
  onOpenDescription: () => void;
  onCloseDescription: () => void;
  imagesLoading: boolean;
  imageItems: ProductImageItem[];
  imagesTotal: number;
  maxImages: number;
  onAddImages: (files: File[] | null) => void;
  onSetPrimaryImage: (imageId: number) => void;
  setPrimaryImageLoading: boolean;
  onDeleteImage: (imageId: number) => void;
  deleteImageLoading: boolean;
  uploadImagesLoading: boolean;
  action: MovementType | null;
  onSelectAction: (next: MovementType) => void;
  movementForm: UseFormReturnType<MovementCreate>;
  onSubmitMovement: FormEventHandler<HTMLFormElement>;
  locations: { value: string; label: string }[];
  adjustmentReasonOptions: { value: AdjustmentReason; label: string }[];
  movementNatureOptionsByType: (
    tipo: MovementType,
  ) => { value: MovementNature; label: string }[];
  createMovementLoading: boolean;
  pageSizes: { value: string; label: string }[];
  historyPageSize: string;
  onHistoryPageSizeChange: (value: string) => void;
  historyLoading: boolean;
  historyErrorMessage: string | null;
  historyRows: MovementOut[];
  historyTotalItems: number;
  historyPage: number;
  historyTotalPages: number;
  onHistoryPageChange: (page: number) => void;
  movementColor: (tipo: "ENTRADA" | "SAIDA" | "TRANSFERENCIA") => string;
  movementNatureLabel: (natureza: MovementNature) => string;
  adjustmentReasonLabel: (reason?: AdjustmentReason | null) => string;
  onRetryHistory: () => void;
};

export function ProductDetailsDrawer({
  opened,
  onClose,
  currentProduct,
  loading,
  observacao,
  onObservacaoChange,
  onSaveObservacao,
  saveObservacaoLoading,
  imagesLoading,
  imageItems,
  imagesTotal,
  maxImages,
  onAddImages,
  onSetPrimaryImage,
  setPrimaryImageLoading,
  onDeleteImage,
  deleteImageLoading,
  uploadImagesLoading,
  action,
  onSelectAction,
  movementForm,
  onSubmitMovement,
  locations,
  adjustmentReasonOptions,
  movementNatureOptionsByType,
  createMovementLoading,
  pageSizes,
  historyPageSize,
  onHistoryPageSizeChange,
  historyLoading,
  historyErrorMessage,
  historyRows,
  historyTotalItems,
  historyPage,
  historyTotalPages,
  onHistoryPageChange,
  movementColor,
  movementNatureLabel,
  adjustmentReasonLabel,
  onRetryHistory,
}: ProductDetailsDrawerProps) {
  const [galleryOpened, setGalleryOpened] = useState(false);
  const [gallerySlide, setGallerySlide] = useState(0);
  const [galleryOrigin, setGalleryOrigin] = useState<DOMRect | null>(null);

  // Modais dedicados para reduzir a sobrecarga visual
  const [movementModalOpened, setMovementModalOpened] = useState(false);
  const [photosModalOpened, setPhotosModalOpened] = useState(false);
  const [notesModalOpened, setNotesModalOpened] = useState(false);

  const handleOpenMovementModal = () => {
    if (!action) {
      onSelectAction("ENTRADA");
    }
    setMovementModalOpened(true);
  };

  const hasAnyStock = (currentProduct?.total_stock ?? 0) > 0;
  const level = useMotionLevel();
  const [tab, setTab] = useState<string | null>("catalogo");
  const tabsRef = useRef<HTMLDivElement>(null);
  const showFullHistory = () => {
    setTab("historico");
    requestAnimationFrame(() =>
      tabsRef.current?.scrollIntoView({ behavior: level === "completo" ? "smooth" : "auto", block: "start" }),
    );
  };
  const productId = currentProduct?.id ?? null;
  const [tabProductId, setTabProductId] = useState(productId);
  if (tabProductId !== productId) {
    // Outro produto: a ficha volta para o Catálogo.
    setTabProductId(productId);
    setTab("catalogo");
  }

  // A foto e o código pousam aqui vindos da linha (lib/sharedFlight). O ref de callback roda
  // quando o conteúdo da gaveta monta; um quadro depois as medidas já valem.
  const heroRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node || productId === null) return;
      requestAnimationFrame(() => playFlight(node, productId, level));
    },
    [productId, level],
  );

  const primaryImage = (imageItems.find((item) => item.is_primary) ?? imageItems[0])?.image_base64 ?? null;
  const heroImage = primaryImage ?? (productId !== null ? rowThumbFor(productId) : null);
  const brand = currentProduct ? detectBrand(currentProduct.nome) : null;
  const condition = currentProduct ? detectCondition(currentProduct.nome) : null;
  const nameParts = currentProduct ? splitProductCode(currentProduct.nome, brand) : null;
  const openPhotos = () => {
    if (imageItems.length > 0) {
      setGallerySlide(0);
      setGalleryOrigin(
        document.querySelector<HTMLElement>('[data-shared-target="thumb"]')?.getBoundingClientRect() ?? null,
      );
      setGalleryOpened(true);
    } else {
      setPhotosModalOpened(true);
    }
  };

  return (
    <>
      <Drawer
        opened={opened}
        onClose={onClose}
        position="right"
        size="xl"
        padding="lg"
        title={
          <Text size="sm" fw={600} c="dimmed">
            Ficha do produto
          </Text>
        }
        // Completo e Suave: a gaveta esmaece no lugar (a foto é que viaja até ela).
        transitionProps={
          level === "nenhum" ? { duration: 0 } : { transition: "fade", duration: level === "suave" ? 150 : 200 }
        }
      >
        {loading && !currentProduct && (
          <Group justify="center" mt="xl">
            <Loader size="sm" />
          </Group>
        )}

        {currentProduct && (
          <Stack gap="lg">
            {/* 1. Foto grande, código e ações */}
            <div className="pm-hero" ref={heroRef}>
              <button
                type="button"
                className="pm-hero-photo"
                data-shared-target="thumb"
                onClick={openPhotos}
                aria-label={imageItems.length > 0 ? "Ver fotos" : "Adicionar foto"}
              >
                <ProductThumb size={168} alt={currentProduct.nome} base64={heroImage} />
              </button>
              <Stack gap={8} miw={0}>
                {nameParts?.code && (
                  <span className="pm-code" data-size="lg" data-shared-target="code" style={{ alignSelf: "flex-start" }}>
                    {nameParts.code}
                  </span>
                )}
                <Text fw={600} size="lg" lh={1.3} lineClamp={2} title={currentProduct.nome}>
                  {nameParts?.code ? nameParts.rest || currentProduct.nome : currentProduct.nome}
                </Text>
                {condition && (
                  <div className="pm-meta">
                    <span
                      className="pm-version-dot"
                      style={{ background: `var(--mantine-color-${condition.color}-filled)` }}
                      aria-hidden
                    />
                    <span>{[brandTitle(brand), versionTitle(condition)].filter(Boolean).join(" · ")}</span>
                    <span className="pm-sep" aria-hidden>
                      ·
                    </span>
                    <span className="mono">#{currentProduct.id}</span>
                  </div>
                )}
                <Group gap="xs" wrap="wrap" mt={4}>
                  <Button
                    leftSection={<IconPlus size={16} />}
                    onClick={handleOpenMovementModal}
                  >
                    Registrar movimentação
                  </Button>
                  <Button
                    variant="default"
                    leftSection={<IconPhoto size={16} stroke={1.5} />}
                    onClick={() => setPhotosModalOpened(true)}
                  >
                    Fotos
                    <Text component="span" size="xs" c="dimmed" ml={6} className="num">
                      {imagesTotal}/{maxImages}
                    </Text>
                  </Button>
                  <Button
                    variant="default"
                    leftSection={<IconNote size={16} stroke={1.5} />}
                    rightSection={
                      observacao.trim() ? (
                        <span
                          className="status-dot"
                          style={{
                            width: 6,
                            height: 6,
                            boxShadow: "none",
                            background: "var(--accent)",
                          }}
                        />
                      ) : undefined
                    }
                    onClick={() => setNotesModalOpened(true)}
                  >
                    Anotações
                  </Button>
                </Group>
              </Stack>
            </div>

            {/* 2. Saldo por filial: zero em cinza; vermelho só no total zerado */}
            <Stack gap={8}>
              <Group justify="space-between" align="center">
                <Text size="xs" fw={600} c="dimmed" tt="uppercase" lts="0.06em">
                  Disponibilidade
                </Text>
                <Group gap={6}>
                  <span
                    className="status-dot"
                    style={
                      hasAnyStock
                        ? { boxShadow: "none" }
                        : { boxShadow: "none", background: "var(--danger)" }
                    }
                  />
                  <Text
                    size="xs"
                    fw={600}
                    c={hasAnyStock ? "var(--success)" : "var(--danger)"}
                  >
                    {hasAnyStock ? "Disponível para venda" : "Sem estoque"}
                  </Text>
                </Group>
              </Group>

              <SimpleGrid
                cols={{ base: 2, sm: Math.min(locations.length + 1, 4) }}
                spacing="xs"
              >
                {locations.map((loc) => {
                  const qty = currentProduct.inventories?.[Number(loc.value)] ?? 0;
                  return (
                    <div key={loc.value} className="stock-tile">
                      <Text size="xs" c="dimmed" fw={500} lineClamp={1}>
                        {loc.label}
                      </Text>
                      <div className="pm-tile-value" data-zero={qty === 0 || undefined}>
                        {qty.toLocaleString("pt-BR")}
                      </div>
                    </div>
                  );
                })}

                <div className="stock-tile">
                  <Text size="xs" c="dimmed" fw={500}>
                    Total
                  </Text>
                  <div className="pm-tile-value" data-level={stockLevel(currentProduct.total_stock)}>
                    {currentProduct.total_stock.toLocaleString("pt-BR")}
                  </div>
                </div>
              </SimpleGrid>
              <ProductStockHistoryChart productId={currentProduct.id} />
            </Stack>

            {/* 3. As últimas 5 movimentações, logo abaixo do gráfico */}
            <ProductRecentMovements productId={currentProduct.id} onSeeAll={showFullHistory} />

            {/* 4. Catálogo em destaque + histórico completo */}
            <Tabs ref={tabsRef} value={tab} onChange={setTab} keepMounted={false}>
              <Tabs.List>
                <Tabs.Tab
                  value="catalogo"
                  leftSection={<IconBook2 size={16} stroke={1.5} />}
                >
                  Catálogo e equivalências
                </Tabs.Tab>
                <Tabs.Tab
                  value="historico"
                  leftSection={<IconHistory size={16} stroke={1.5} />}
                >
                  Histórico
                </Tabs.Tab>
              </Tabs.List>

              <Tabs.Panel value="catalogo" pt="md">
                <ProductCatalogTab productId={currentProduct.id} />
              </Tabs.Panel>

              <Tabs.Panel value="historico" pt="md">
                <Stack gap="sm">
                  <Group justify="space-between" align="center">
                    <Text size="xs" c="dimmed" className="num">
                      {historyTotalItems} registros
                    </Text>
                    <Select
                      size="xs"
                      data={pageSizes}
                      value={historyPageSize}
                      allowDeselect={false}
                      onChange={(value) => {
                        if (!value) return;
                        onHistoryPageSizeChange(value);
                      }}
                      w={90}
                      aria-label="Registros por página"
                    />
                  </Group>

                  <ProductHistoryTable
                    loading={historyLoading}
                    errorMessage={historyErrorMessage}
                    rows={historyRows}
                    totalItems={historyTotalItems}
                    page={historyPage}
                    totalPages={historyTotalPages}
                    onPageChange={onHistoryPageChange}
                    movementColor={movementColor}
                    movementNatureLabel={movementNatureLabel}
                    adjustmentReasonLabel={(reason) =>
                      adjustmentReasonLabel(
                        reason as AdjustmentReason | null | undefined,
                      )
                    }
                    onRetry={onRetryHistory}
                  />
                </Stack>
              </Tabs.Panel>
            </Tabs>
          </Stack>
        )}
      </Drawer>

      {/* MODAL 1: REGISTRAR MOVIMENTAÇÃO (FOCADO E LIMPO) */}
      <Modal
        opened={movementModalOpened}
        onClose={() => setMovementModalOpened(false)}
        title={
          <Stack gap={0}>
            <Text fw={650} size="md">
              Registrar movimentação
            </Text>
            <Text size="xs" c="dimmed" lineClamp={1}>
              {currentProduct?.nome}
            </Text>
          </Stack>
        }
        size="lg"
      >
        <Stack gap="md" pt="xs">
          {/* Seletor de tipo de movimentação */}
          <SegmentedControl
            fullWidth
            value={action ?? ""}
            onChange={(value) => onSelectAction(value as MovementType)}
            data={[
              { label: "Entrada", value: "ENTRADA" },
              { label: "Saída", value: "SAIDA" },
              { label: "Transferência", value: "TRANSFERENCIA" },
            ]}
          />

          {action && (
            <form
              onSubmit={(e) => {
                onSubmitMovement(e);
                // Não fechamos imediatamente para permitir ver validações do formulário
              }}
            >
              <Stack gap="sm">
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                  <NumberInput
                    label="Quantidade"
                    min={1}
                    required
                    {...movementForm.getInputProps("quantidade")}
                  />

                  {action !== "ENTRADA" && (
                    <Select
                      label="Filial de Origem"
                      data={locations}
                      required
                      {...movementForm.getInputProps("origem_location_id")}
                    />
                  )}

                  {action !== "SAIDA" && (
                    <Select
                      label="Filial de Destino"
                      data={locations}
                      required
                      {...movementForm.getInputProps("destino_location_id")}
                    />
                  )}

                  <Select
                    label="Natureza da Operação"
                    data={movementNatureOptionsByType(
                      movementForm.values.tipo as MovementType,
                    )}
                    required
                    {...movementForm.getInputProps("natureza")}
                  />

                  <TextInput
                    label="Documento / Nota Fiscal"
                    placeholder="Ex: NF 12345"
                    {...movementForm.getInputProps("documento")}
                  />

                  {movementForm.values.natureza === "TRANSFERENCIA_EXTERNA" && (
                    <TextInput
                      label="Local externo"
                      placeholder="Ex: Matriz, Maringá"
                      required
                      {...movementForm.getInputProps("local_externo")}
                    />
                  )}

                  {movementForm.values.natureza === "AJUSTE" && (
                    <Select
                      label="Motivo do ajuste"
                      data={adjustmentReasonOptions}
                      required
                      {...movementForm.getInputProps("motivo_ajuste")}
                    />
                  )}

                  {(movementForm.values.natureza === "DEVOLUCAO" ||
                    movementForm.values.natureza === "ESTORNO") && (
                    <NumberInput
                      label="Movimento de Referência"
                      min={1}
                      required
                      {...movementForm.getInputProps("movimento_ref_id")}
                    />
                  )}
                </SimpleGrid>

                <TextInput
                  label="Observação"
                  placeholder="Informações adicionais sobre esta movimentação"
                  {...movementForm.getInputProps("observacao")}
                />

                <Group justify="flex-end" mt="md">
                  <Button
                    variant="default"
                    onClick={() => setMovementModalOpened(false)}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit" loading={createMovementLoading}>
                    Confirmar {action === "ENTRADA" ? "Entrada" : action === "SAIDA" ? "Saída" : "Transferência"}
                  </Button>
                </Group>
              </Stack>
            </form>
          )}
        </Stack>
      </Modal>

      {/* MODAL 2: FOTOS DO PRODUTO */}
      <Modal
        opened={photosModalOpened}
        onClose={() => setPhotosModalOpened(false)}
        title={
          <Text fw={650} size="md">
            Fotos do produto{" "}
            <Text component="span" size="sm" c="dimmed" className="num">
              {imagesTotal}/{maxImages}
            </Text>
          </Text>
        }
        size="lg"
      >
        <Stack gap="md">
          {imagesLoading && (
            <Group justify="center" p="xl">
              <Loader size="sm" />
            </Group>
          )}

          {!imagesLoading && imageItems.length === 0 && (
            <div className="stock-tile" style={{ padding: 32 }}>
              <Stack align="center" gap="xs">
                <IconPhoto size={28} stroke={1.5} color="var(--text-subtle)" />
                <Text size="sm" c="dimmed">
                  Nenhuma imagem cadastrada para este produto.
                </Text>
              </Stack>
            </div>
          )}

          {imageItems.length > 0 && (
            <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="sm">
              {imageItems.map((img, idx) => (
                <Card key={img.id} p="xs" radius="md" withBorder>
                  <Image
                    src={`data:${img.mime_type};base64,${img.image_base64}`}
                    alt={`${currentProduct?.nome} ${img.id}`}
                    fit="cover"
                    h={140}
                    radius="sm"
                    className="photo-thumb"
                    onClick={(event) => {
                      setGallerySlide(idx);
                      setGalleryOrigin(event.currentTarget.getBoundingClientRect());
                      setGalleryOpened(true);
                    }}
                  />
                  <Group justify="space-between" mt="xs">
                    <Tooltip
                      label={
                        img.is_primary
                          ? "Imagem principal"
                          : "Definir como principal"
                      }
                    >
                      <ActionIcon
                        color={img.is_primary ? "warning" : "gray"}
                        onClick={() => !img.is_primary && onSetPrimaryImage(img.id)}
                        loading={setPrimaryImageLoading}
                        aria-label={img.is_primary ? "Imagem principal" : "Definir como principal"}
                      >
                        {img.is_primary ? (
                          <IconStarFilled size={16} />
                        ) : (
                          <IconStar size={16} />
                        )}
                      </ActionIcon>
                    </Tooltip>
                    <ActionIcon
                      color="gray"
                      className="action-danger"
                      aria-label="Excluir imagem"
                      onClick={() => onDeleteImage(img.id)}
                      loading={deleteImageLoading}
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Group>
                </Card>
              ))}
            </SimpleGrid>
          )}

          <Group justify="space-between" mt="sm">
            <FileButton
              multiple
              accept="image/png,image/jpeg,image/webp"
              onChange={(files) => onAddImages((files as File[] | null) ?? null)}
            >
              {(props) => (
                <Button
                  {...props}
                  leftSection={<IconPlus size={16} />}
                  loading={uploadImagesLoading}
                  disabled={imagesTotal >= maxImages}
                >
                  Adicionar fotos
                </Button>
              )}
            </FileButton>

            <Button variant="default" onClick={() => setPhotosModalOpened(false)}>
              Fechar
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* MODAL 3: ANOTAÇÕES INTERNAS */}
      <Modal
        opened={notesModalOpened}
        onClose={() => setNotesModalOpened(false)}
        title={
          <Text fw={650} size="md">
            Anotações internas
          </Text>
        }
        size="md"
      >
        <Stack gap="md">
          <Textarea
            aria-label="Anotações internas do produto"
            value={observacao}
            onChange={(event) => onObservacaoChange(event.currentTarget.value)}
            minRows={6}
            maxRows={12}
            autosize
            placeholder="Insira detalhes sobre medidas especiais, clientes, montagens ou histórico deste produto..."
          />
          <Group justify="space-between">
            <Button
              variant="subtle"
              color="gray"
              onClick={() => {
                if (observacao) {
                  navigator.clipboard.writeText(observacao);
                }
              }}
              disabled={!observacao.trim()}
            >
              Copiar texto
            </Button>
            <Group gap="xs">
              <Button variant="default" onClick={() => setNotesModalOpened(false)}>
                Fechar
              </Button>
              <Button
                onClick={() => {
                  onSaveObservacao();
                  setNotesModalOpened(false);
                }}
                loading={saveObservacaoLoading}
              >
                Salvar anotação
              </Button>
            </Group>
          </Group>
        </Stack>
      </Modal>

      <ImageGalleryModal
        opened={galleryOpened}
        onClose={() => setGalleryOpened(false)}
        images={imageItems}
        initialSlide={gallerySlide}
        originRect={galleryOrigin}
      />
    </>
  );
}
