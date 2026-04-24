import type { FormEventHandler } from "react";
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
import { IconStar, IconStarFilled, IconTrash } from "@tabler/icons-react";

import type { MovementCreate, MovementOut, Product, ProductImageItem } from "../../lib/api";
import { ProductHistoryTable } from "./ProductHistoryTable";

type MovementType = "ENTRADA" | "SAIDA" | "TRANSFERENCIA";
type MovementNature = "OPERACAO_NORMAL" | "TRANSFERENCIA_EXTERNA" | "DEVOLUCAO" | "AJUSTE";
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
  movementNatureOptionsByType: (tipo: MovementType) => { value: MovementNature; label: string }[];
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
  return (
    <>
      <Drawer
        opened={opened}
        onClose={onClose}
        title={currentProduct ? `Produto ${currentProduct.nome}` : "Detalhes do produto"}
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
              <Stack gap="xs" maw={360}>
                <Text size="sm" c="dimmed">
                  ID
                </Text>
                <Text fw={600}>{currentProduct.id}</Text>
                <Text size="sm" c="dimmed">
                  Canoas
                </Text>
                <Text fw={600}>{currentProduct.qtd_canoas}</Text>
                <Text size="sm" c="dimmed">
                  PF
                </Text>
                <Text fw={600}>{currentProduct.qtd_pf}</Text>
                <Text size="sm" c="dimmed">
                  Total
                </Text>
                <Text fw={600}>{currentProduct.total_stock}</Text>

                <Textarea
                  label="Descricao"
                  value={observacao}
                  onChange={(event) => onObservacaoChange(event.currentTarget.value)}
                  minRows={3}
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
                    Ver descricao
                  </Button>
                </Group>
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
                    {imageItems.map((img) => (
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
                              onClick={() => !img.is_primary && onSetPrimaryImage(img.id)}
                              loading={setPrimaryImageLoading}
                            >
                              {img.is_primary ? <IconStarFilled size={16} /> : <IconStar size={16} />}
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
                  onChange={(files) => onAddImages((files as File[] | null) ?? null)}
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
              <Title order={4}>Acoes</Title>
              <Group gap="sm">
                <Button variant={action === "ENTRADA" ? "filled" : "light"} onClick={() => onSelectAction("ENTRADA")}>
                  Dar entrada
                </Button>
                <Button color="red" variant={action === "SAIDA" ? "filled" : "light"} onClick={() => onSelectAction("SAIDA")}>
                  Dar saida
                </Button>
                <Button
                  color="yellow"
                  variant={action === "TRANSFERENCIA" ? "filled" : "light"}
                  onClick={() => onSelectAction("TRANSFERENCIA")}
                >
                  Fazer transferencia
                </Button>
              </Group>

              {action && (
                <form onSubmit={onSubmitMovement}>
                  <Group align="end" wrap="wrap" mt="sm">
                    <NumberInput label="Quantidade" min={1} w={140} {...movementForm.getInputProps("quantidade")} />
                    {action !== "ENTRADA" && (
                      <Select label="Origem" data={locations} w={160} {...movementForm.getInputProps("origem")} />
                    )}
                    {action !== "SAIDA" && (
                      <Select label="Destino" data={locations} w={160} {...movementForm.getInputProps("destino")} />
                    )}
                    <Select
                      label="Natureza"
                      data={movementNatureOptionsByType(movementForm.values.tipo as MovementType)}
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
                    {movementForm.values.natureza === "DEVOLUCAO" && (
                      <NumberInput
                        label="Mov. referencia"
                        min={1}
                        w={170}
                        {...movementForm.getInputProps("movimento_ref_id")}
                      />
                    )}
                    <TextInput label="Observacao" w={240} {...movementForm.getInputProps("observacao")} />
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
                        onHistoryPageSizeChange(value);
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
                    adjustmentReasonLabel={(reason) => adjustmentReasonLabel(reason as AdjustmentReason | null | undefined)}
                    onRetry={onRetryHistory}
                  />
                </Stack>
              </Tabs.Panel>
            </Tabs>
          </Stack>
        )}
      </Drawer>

      <Modal opened={descriptionOpened} onClose={onCloseDescription} title="Descricao" size="lg">
        <Stack gap="sm">
          <ScrollArea h={260} offsetScrollbars>
            <Text style={{ whiteSpace: "pre-wrap" }} size="md">
              {observacao || "Sem descricao."}
            </Text>
          </ScrollArea>
          <Button variant="light" onClick={() => navigator.clipboard.writeText(observacao || "")}>
            Copiar descricao
          </Button>
        </Stack>
      </Modal>
    </>
  );
}
