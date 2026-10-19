import { type FormEventHandler, useState } from "react";
import {
  ActionIcon,
  Badge,
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
  UnstyledButton,
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
import { stockLevelColor } from "../../lib/semantic";
import ProductStockHistoryChart from "./ProductStockHistoryChart";
import ProductThumb from "./ProductThumb";

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

  return (
    <>
      <Drawer
        opened={opened}
        onClose={onClose}
        position="right"
        size="xl"
        padding="lg"
        title={
          currentProduct ? (
            <Group gap="md" wrap="nowrap" align="flex-start">
            <UnstyledButton
              onClick={() => {
                if (imageItems.length > 0) {
                  setGallerySlide(0);
                  setGalleryOpened(true);
                } else {
                  setPhotosModalOpened(true);
                }
              }}
              aria-label={imageItems.length > 0 ? "Ver fotos" : "Adicionar foto"}
              className="photo-thumb"
            >
              <ProductThumb
                size={76}
                alt={currentProduct.nome}
                base64={
                  (imageItems.find((item) => item.is_primary) ?? imageItems[0])?.image_base64 ?? null
                }
              />
            </UnstyledButton>
            <Stack gap={4} miw={0}>
              <Group gap={6} wrap="wrap" align="center">
                {(() => {
                  const brand = detectBrand(currentProduct.nome);
                  const condition = detectCondition(currentProduct.nome);
                  return (
                    <>
                      {brand && (
                        <Badge size="xs" color={brand.color} variant="light">
                          {brand.label}
                        </Badge>
                      )}
                      <Badge size="xs" color={condition.color} variant="outline">
                        {condition.label}
                      </Badge>
                    </>
                  );
                })()}
              </Group>
              <Text fw={650} size="lg" lineClamp={2}>
                {currentProduct.nome}
              </Text>
              <Text size="xs" c="dimmed" className="mono">
                #{currentProduct.id}
              </Text>
            </Stack>
            </Group>
          ) : (
            "Detalhes do produto"
          )
        }
      >
        {loading && !currentProduct && (
          <Group justify="center" mt="xl">
            <Loader size="sm" />
          </Group>
        )}

        {currentProduct && (
          <Stack gap="lg">
            {/* 1. Disponibilidade imediata por filial */}
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
                        : { boxShadow: "none", background: "var(--text-subtle)" }
                    }
                  />
                  <Text
                    size="xs"
                    fw={600}
                    c={hasAnyStock ? "var(--success)" : "dimmed"}
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
                      <Text
                        fz={26}
                        fw={650}
                        lh={1.2}
                        className="num"
                        // Zero numa filial com saldo em outra não é alarme: fica apagado.
                        c={
                          qty === 0 && currentProduct.total_stock > 0
                            ? "dimmed"
                            : `var(--mantine-color-${stockLevelColor(qty)}-light-color)`
                        }
                      >
                        {qty}
                      </Text>
                    </div>
                  );
                })}

                <div className="stock-tile">
                  <Text size="xs" c="dimmed" fw={500}>
                    Total
                  </Text>
                  <Text
                    fz={26}
                    fw={650}
                    lh={1.2}
                    className="num"
                    c={`var(--mantine-color-${stockLevelColor(currentProduct.total_stock)}-light-color)`}
                  >
                    {currentProduct.total_stock}
                  </Text>
                </div>
              </SimpleGrid>
              <ProductStockHistoryChart productId={currentProduct.id} />
            </Stack>

            {/* 2. Ações rápidas */}
            <Group gap="xs" wrap="wrap">
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

            {/* 3. Catálogo em destaque + histórico */}
            <Tabs defaultValue="catalogo" keepMounted={false}>
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
                    onClick={() => {
                      setGallerySlide(idx);
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
      />
    </>
  );
}
