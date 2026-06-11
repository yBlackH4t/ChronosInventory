import React, { type FormEventHandler, useState } from "react";
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
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  TextInput,
  Textarea,
  Title,
  Tooltip,
} from "@mantine/core";
import type { UseFormReturnType } from "@mantine/form";
import { IconStar, IconStarFilled, IconTrash, IconArrowDownRight, IconArrowUpRight, IconArrowsExchange } from "@tabler/icons-react";
import { Card } from "@mantine/core";
import { ImageGalleryModal } from "./ImageGalleryModal";

import type {
  MovementCreate,
  MovementOut,
  Product,
  ProductImageItem,
} from "../../lib/api";
import { ProductHistoryTable } from "./ProductHistoryTable";

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
  descriptionOpened,
  onOpenDescription,
  onCloseDescription,
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
  onHistoryPageChange: onHistoryPageSizeChange,
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

  return (
    <>
      <Drawer
        opened={opened}
        onClose={onClose}
        title={
          currentProduct
            ? `Produto ${currentProduct.nome}`
            : "Detalhes do produto"
        }
        position="right"
        size="xl"
      >
        {loading && (
          <Group justify="center" mt="md">
            <Loader />
          </Group>
        )}

        {currentProduct && (
          <Stack gap="md">
            <Group align="flex-start" justify="space-between" wrap="wrap">
              <Stack gap="md" style={{ flex: 1, minWidth: 320 }}>
                <Group mb={-8}>
                  <Badge size="lg" variant="light" color="indigo" radius="sm">
                    ID: {currentProduct.id}
                  </Badge>
                </Group>

                <SimpleGrid cols={2} spacing="sm">
                  {locations.map((loc) => {
                    const qty = currentProduct.inventories?.[Number(loc.value)] ?? 0;
                    const hasStock = qty > 0;
                    const color = hasStock ? "teal" : "red";
                    return (
                      <Card 
                        key={loc.value} 
                        p="sm" 
                        radius="md" 
                        withBorder
                        style={{ 
                          backgroundColor: 'var(--surface-muted)',
                          borderColor: `var(--mantine-color-${color}-outline)`,
                          borderWidth: '1.5px'
                        }}
                      >
                        <Text size="xs" c={color} tt="uppercase" fw={800} mb={4} opacity={0.8}>
                          {loc.label}
                        </Text>
                        <Text size="xl" fw={900} c={color}>
                          {qty} <Text component="span" size="sm" fw={600} opacity={0.6}>un</Text>
                        </Text>
                      </Card>
                    );
                  })}
                  <Card 
                    p="sm" 
                    radius="md" 
                    withBorder
                    style={{ 
                      backgroundColor: 'var(--surface-muted)',
                      borderColor: 'var(--mantine-color-blue-outline)',
                      borderWidth: '1.5px'
                    }}
                  >
                    <Text size="xs" tt="uppercase" fw={800} mb={4} c="blue" opacity={0.8}>
                      TOTAL
                    </Text>
                    <Text size="xl" fw={900} c="blue">
                      {currentProduct.total_stock} <Text component="span" size="sm" fw={600} opacity={0.6}>un</Text>
                    </Text>
                  </Card>
                </SimpleGrid>

                <Stack gap="xs" mt="sm">
                  <Textarea
                    label="Descricao interna"
                    value={observacao}
                    onChange={(event) =>
                      onObservacaoChange(event.currentTarget.value)
                    }
                    minRows={3}
                    placeholder="Adicione anotacoes sobre este produto..."
                  />
                  <Group gap="xs">
                    <Button
                      variant="light"
                      onClick={onSaveObservacao}
                      loading={saveObservacaoLoading}
                    >
                      Salvar descricao
                    </Button>
                    <Button variant="subtle" onClick={onOpenDescription}>
                      Ver tela cheia
                    </Button>
                  </Group>
                </Stack>
              </Stack>

              <Stack gap="xs" maw={420}>
                <Group justify="space-between" align="center">
                  <Text size="sm" c="dimmed">
                    Imagens
                  </Text>
                  <Badge variant="light">
                    {imagesTotal}/{maxImages}
                  </Badge>
                </Group>

                {imagesLoading && <Loader size="sm" />}

                {!imagesLoading && imageItems.length === 0 && (
                  <Text size="sm" c="dimmed">
                    Sem imagem cadastrada.
                  </Text>
                )}

                {imageItems.length > 0 && (
                  <SimpleGrid cols={2} spacing="sm">
                    {imageItems.map((img, idx) => (
                      <Stack key={img.id} gap={4}>
                        <Image
                          src={`data:${img.mime_type};base64,${img.image_base64}`}
                          alt={`${currentProduct.nome} ${img.id}`}
                          fit="cover"
                          h={120}
                          radius="sm"
                          style={{ cursor: "pointer", transition: "transform 0.2s" }}
                          onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.02)")}
                          onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
                          onClick={() => {
                            setGallerySlide(idx);
                            setGalleryOpened(true);
                          }}
                        />
                        <Group justify="space-between" wrap="nowrap">
                          <Tooltip
                            label={
                              img.is_primary
                                ? "Imagem principal"
                                : "Definir como principal"
                            }
                          >
                            <ActionIcon
                              variant="light"
                              color={img.is_primary ? "yellow" : "gray"}
                              onClick={() =>
                                !img.is_primary && onSetPrimaryImage(img.id)
                              }
                              loading={setPrimaryImageLoading}
                            >
                              {img.is_primary ? (
                                <IconStarFilled size={16} />
                              ) : (
                                <IconStar size={16} />
                              )}
                            </ActionIcon>
                          </Tooltip>
                          <ActionIcon
                            color="red"
                            variant="light"
                            onClick={() => onDeleteImage(img.id)}
                            loading={deleteImageLoading}
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
                  onChange={(files) =>
                    onAddImages((files as File[] | null) ?? null)
                  }
                >
                  {(props) => (
                    <Button
                      {...props}
                      variant="light"
                      loading={uploadImagesLoading}
                      disabled={imagesTotal >= maxImages}
                    >
                      Adicionar imagens
                    </Button>
                  )}
                </FileButton>
              </Stack>
            </Group>

            <Divider />

            <Stack gap="sm">
              <Title order={4} mb="xs">Registrar Movimentacao</Title>
              <Group gap="sm">
                <Button
                  leftSection={<IconArrowDownRight size={18} />}
                  variant={action === "ENTRADA" ? "filled" : "light"}
                  onClick={() => onSelectAction("ENTRADA")}
                  color="teal"
                  radius="md"
                >
                  Entrada
                </Button>
                <Button
                  leftSection={<IconArrowUpRight size={18} />}
                  color="red"
                  variant={action === "SAIDA" ? "filled" : "light"}
                  onClick={() => onSelectAction("SAIDA")}
                  radius="md"
                >
                  Saida
                </Button>
                <Button
                  leftSection={<IconArrowsExchange size={18} />}
                  color="blue"
                  variant={action === "TRANSFERENCIA" ? "filled" : "light"}
                  onClick={() => onSelectAction("TRANSFERENCIA")}
                  radius="md"
                >
                  Transferencia
                </Button>
              </Group>

              {action && (
                <form onSubmit={onSubmitMovement}>
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
                        data={locations}
                        w={160}
                        {...movementForm.getInputProps("origem_location_id")}
                      />
                    )}
                    {action !== "SAIDA" && (
                      <Select
                        label="Destino"
                        data={locations}
                        w={160}
                        {...movementForm.getInputProps("destino_location_id")}
                      />
                    )}
                    <Select
                      label="Natureza"
                      data={movementNatureOptionsByType(
                        movementForm.values.tipo as MovementType,
                      )}
                      w={220}
                      {...movementForm.getInputProps("natureza")}
                    />
                    {movementForm.values.natureza ===
                      "TRANSFERENCIA_EXTERNA" && (
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
                        data={adjustmentReasonOptions}
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
                    {(movementForm.values.natureza === "DEVOLUCAO" || movementForm.values.natureza === "ESTORNO") && (
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
                    <Button type="submit" loading={createMovementLoading}>
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
                      data={pageSizes}
                      value={historyPageSize}
                      onChange={(value) => {
                        if (!value) return;
                        onHistoryPageSizeChange(Number(value));
                      }}
                      w={120}
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

      <Modal
        opened={descriptionOpened}
        onClose={onCloseDescription}
        title="Descricao"
        size="lg"
      >
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

      <ImageGalleryModal
        opened={galleryOpened}
        onClose={() => setGalleryOpened(false)}
        images={imageItems}
        initialSlide={gallerySlide}
      />
    </>
  );
}
