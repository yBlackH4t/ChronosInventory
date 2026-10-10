import {
  ActionIcon,
  Button,
  FileButton,
  Group,
  NumberInput,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import {
  IconBold,
  IconFileImport,
  IconLayoutAlignBottom,
  IconLayoutAlignCenter,
  IconLayoutAlignLeft,
  IconLayoutAlignMiddle,
  IconLayoutAlignRight,
  IconLayoutAlignTop,
  IconTrash,
} from "@tabler/icons-react";

import {
  SHIPPING_LABEL_FIELD_TOKEN_OPTIONS,
  type ShippingLabelDesignerItem,
  type ShippingLabelFieldToken,
} from "../../lib/labelsPrint";
import { clamp, type AlignMode } from "./nfeDesignerUtils";

const ALIGN_BUTTONS: {
  key: AlignMode;
  label: string;
  icon: typeof IconLayoutAlignLeft;
}[] = [
  { key: "left", label: "Alinhar à esquerda", icon: IconLayoutAlignLeft },
  { key: "center", label: "Centralizar na horizontal", icon: IconLayoutAlignCenter },
  { key: "right", label: "Alinhar à direita", icon: IconLayoutAlignRight },
  { key: "top", label: "Alinhar ao topo", icon: IconLayoutAlignTop },
  { key: "middle", label: "Centralizar na vertical", icon: IconLayoutAlignMiddle },
  { key: "bottom", label: "Alinhar à base", icon: IconLayoutAlignBottom },
];

type NfeSelectedBlockEditorProps = {
  selectedItem: ShippingLabelDesignerItem | null;
  labelWidth: number;
  labelHeight: number;
  onAlign: (mode: AlignMode) => void;
  onUpdate: (patch: Partial<ShippingLabelDesignerItem>) => void;
  onReplaceImage: (file: File | null) => void;
  onAutoFit: () => void;
  onRemove: () => void;
};

// Painel "Bloco selecionado" do designer: tipo, texto, fonte, posicao e tamanho.
export default function NfeSelectedBlockEditor({
  selectedItem,
  labelWidth,
  labelHeight,
  onAlign,
  onUpdate,
  onReplaceImage,
  onAutoFit,
  onRemove,
}: NfeSelectedBlockEditorProps) {
  if (!selectedItem) {
    return (
      <Text size="xs" c="dimmed">
        Clique em um bloco no canvas para editar, alinhar ou excluir.
      </Text>
    );
  }

  return (
    <Stack gap="xs">
      <Group gap={4} justify="space-between" wrap="nowrap">
        {ALIGN_BUTTONS.map((button) => (
          <Tooltip key={button.key} label={button.label}>
            <ActionIcon
              variant="default"
              size="md"
              aria-label={button.label}
              onClick={() => onAlign(button.key)}
            >
              <button.icon size={16} stroke={1.5} />
            </ActionIcon>
          </Tooltip>
        ))}
      </Group>

      <Select
        size="xs"
        label="Tipo"
        data={[
          { value: "text", label: "Texto livre" },
          { value: "token", label: "Campo dinâmico" },
          { value: "image", label: "Imagem" },
        ]}
        value={selectedItem.kind}
        allowDeselect={false}
        onChange={(value) => {
          const nextKind =
            (value as ShippingLabelDesignerItem["kind"]) || "text";
          onUpdate( {
            kind: nextKind,
            token:
              nextKind === "token"
                ? selectedItem.token || "cliente"
                : undefined,
            src:
              nextKind === "image" ? selectedItem.src : undefined,
            width:
              nextKind === "image"
                ? Math.max(selectedItem.width, 120)
                : selectedItem.width,
            height:
              nextKind === "image"
                ? Math.max(selectedItem.height, 60)
                : selectedItem.height,
          });
        }}
      />

      {selectedItem.kind === "image" ? (
        <>
          <TextInput
            size="xs"
            label="Nome interno"
            value={selectedItem.text}
            onChange={(event) =>
              onUpdate( {
                text: event.currentTarget.value,
              })
            }
          />
          <Select
            size="xs"
            label="Ajuste da imagem"
            data={[
              { value: "contain", label: "Manter inteira" },
              { value: "cover", label: "Preencher cortando" },
              { value: "fill", label: "Esticar" },
            ]}
            value={selectedItem.objectFit}
            allowDeselect={false}
            onChange={(value) =>
              onUpdate( {
                objectFit:
                  (value as ShippingLabelDesignerItem["objectFit"]) ||
                  "contain",
              })
            }
          />
          <FileButton
            onChange={(file) => onReplaceImage(file)}
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
          >
            {(props) => (
              <Button
                {...props}
                size="xs"
                variant="default"
                leftSection={<IconFileImport size={14} stroke={1.5} />}
              >
                Trocar imagem
              </Button>
            )}
          </FileButton>
        </>
      ) : (
        <>
          <TextInput
            size="xs"
            label={
              selectedItem.kind === "token"
                ? "Prefixo (ex.: CLIENTE:)"
                : "Texto"
            }
            value={selectedItem.text}
            onChange={(event) =>
              onUpdate( {
                text: event.currentTarget.value,
              })
            }
          />
          {selectedItem.kind === "token" && (
            <Select
              size="xs"
              label="Campo"
              data={SHIPPING_LABEL_FIELD_TOKEN_OPTIONS}
              value={selectedItem.token || "cliente"}
              allowDeselect={false}
              onChange={(value) =>
                onUpdate( {
                  token:
                    (value as ShippingLabelFieldToken) || "cliente",
                })
              }
            />
          )}
          <Group gap="xs" wrap="nowrap" align="flex-end">
            <NumberInput
              size="xs"
              label="Fonte"
              value={selectedItem.fontSize}
              min={8}
              max={64}
              w={80}
              onChange={(value) =>
                onUpdate( {
                  fontSize: clamp(
                    Number(value || selectedItem.fontSize),
                    8,
                    64,
                  ),
                })
              }
            />
            <SegmentedControl
              size="xs"
              flex={1}
              value={selectedItem.align}
              onChange={(value) =>
                onUpdate( {
                  align:
                    (value as "left" | "center" | "right") || "left",
                })
              }
              data={[
                { value: "left", label: "Esq." },
                { value: "center", label: "Centro" },
                { value: "right", label: "Dir." },
              ]}
            />
            <Tooltip label="Negrito">
              <ActionIcon
                size="md"
                variant={selectedItem.fontWeight >= 700 ? "filled" : "default"}
                aria-label="Negrito"
                onClick={() =>
                  onUpdate( {
                    fontWeight: selectedItem.fontWeight >= 700 ? 400 : 700,
                  })
                }
              >
                <IconBold size={16} stroke={1.75} />
              </ActionIcon>
            </Tooltip>
          </Group>
          <Button size="xs" variant="subtle" color="gray" onClick={onAutoFit}>
            Ajustar altura ao texto
          </Button>
        </>
      )}

      <SimpleGrid cols={4} spacing={6}>
        <NumberInput
          size="xs"
          label="X"
          value={selectedItem.x}
          min={0}
          max={Math.max(0, labelWidth - selectedItem.width)}
          hideControls
          onChange={(value) =>
            onUpdate( {
              x: clamp(
                Number(value || selectedItem.x),
                0,
                Math.max(0, labelWidth - selectedItem.width),
              ),
            })
          }
        />
        <NumberInput
          size="xs"
          label="Y"
          value={selectedItem.y}
          min={0}
          max={Math.max(0, labelHeight - selectedItem.height)}
          hideControls
          onChange={(value) =>
            onUpdate( {
              y: clamp(
                Number(value || selectedItem.y),
                0,
                Math.max(0, labelHeight - selectedItem.height),
              ),
            })
          }
        />
        <NumberInput
          size="xs"
          label="L"
          value={selectedItem.width}
          min={40}
          max={labelWidth}
          hideControls
          onChange={(value) =>
            onUpdate( {
              width: clamp(
                Number(value || selectedItem.width),
                40,
                labelWidth,
              ),
            })
          }
        />
        <NumberInput
          size="xs"
          label="A"
          value={selectedItem.height}
          min={18}
          max={labelHeight}
          hideControls
          onChange={(value) =>
            onUpdate( {
              height: clamp(
                Number(value || selectedItem.height),
                18,
                labelHeight,
              ),
            })
          }
        />
      </SimpleGrid>

      <Button
        size="xs"
        variant="subtle"
        color="red"
        leftSection={<IconTrash size={14} />}
        onClick={onRemove}
      >
        Excluir bloco
      </Button>
    </Stack>
  );
}
