import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Divider,
  FileButton,
  Group,
  NumberInput,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { IconDownload, IconFileImport, IconPlus, IconPrinter, IconTrash } from "@tabler/icons-react";

import EmptyState from "../ui/EmptyState";
import FilterToolbar from "../ui/FilterToolbar";
import {
  buildShippingLabelsDesignerPrintHtml,
  DEFAULT_SHIPPING_LABEL_DESIGNER_LAYOUT,
  normalizeShippingLabelDesignerLayout,
  resolveShippingLabelDesignerItemText,
  SHIPPING_LABEL_FIELD_TOKEN_OPTIONS,
  type ShippingLabelDesignerItem,
  type ShippingLabelDesignerLayout,
  type ShippingLabelFieldToken,
  type ShippingLabelPrintableItem,
} from "../../lib/labelsPrint";
import { type NfeShippingData, parseNfeShippingData } from "../../lib/nfeShippingLabel";
import { notifyError, notifySuccess } from "../../lib/notify";

const MAX_NFE_LABELS_PER_PRINT = 400;
const STORAGE_KEY = "chronos.nfe.designer_layout.v2";
const GRID_SIZE = 4;
const COMMON_WINDOWS_FONTS = [
  "Segoe UI",
  "Calibri",
  "Arial",
  "Tahoma",
  "Verdana",
  "Trebuchet MS",
  "Times New Roman",
  "Georgia",
  "Cambria",
  "Franklin Gothic Medium",
  "Garamond",
  "Courier New",
  "Consolas",
  "Candara",
  "Corbel",
];

type InteractionRef = {
  id: string;
  pointerId: number;
  mode: "move" | "resize";
  lastX: number;
  lastY: number;
} | null;

type AlignMode = "left" | "center" | "right" | "top" | "middle" | "bottom";

type LocalFontFace = {
  family?: string;
  fullName?: string;
};

function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `item_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function snap(value: number): number {
  return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

function loadLayoutFromStorage(): ShippingLabelDesignerLayout {
  if (typeof window === "undefined") return DEFAULT_SHIPPING_LABEL_DESIGNER_LAYOUT;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SHIPPING_LABEL_DESIGNER_LAYOUT;
    return normalizeShippingLabelDesignerLayout(JSON.parse(raw) as unknown);
  } catch {
    return DEFAULT_SHIPPING_LABEL_DESIGNER_LAYOUT;
  }
}

function printHtml(html: string) {
  if (typeof document === "undefined" || typeof window === "undefined") return;
  const frame = document.createElement("iframe");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  frame.style.visibility = "hidden";

  const cleanup = () => {
    window.setTimeout(() => {
      if (frame.parentNode) frame.parentNode.removeChild(frame);
    }, 500);
  };

  frame.onload = () => {
    const frameWindow = frame.contentWindow;
    if (!frameWindow) {
      cleanup();
      return;
    }
    frameWindow.focus();
    frameWindow.print();
    cleanup();
  };

  document.body.appendChild(frame);
  if (!frame.contentDocument) {
    cleanup();
    return;
  }
  frame.contentDocument.open();
  frame.contentDocument.write(html);
  frame.contentDocument.close();
}

function isEditableElement(element: Element | null): boolean {
  if (!(element instanceof HTMLElement)) return false;
  const tag = element.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || element.isContentEditable;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("Nao foi possivel ler a imagem selecionada."));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Falha ao ler imagem."));
    reader.readAsDataURL(file);
  });
}

function measureTextBlockHeight(
  text: string,
  item: ShippingLabelDesignerItem,
  fontFamily: string
): number {
  if (typeof document === "undefined") {
    return Math.max(24, snap(item.fontSize * 1.8));
  }

  const probe = document.createElement("div");
  probe.style.position = "fixed";
  probe.style.left = "-99999px";
  probe.style.top = "0";
  probe.style.width = `${Math.max(40, item.width)}px`;
  probe.style.minHeight = "0";
  probe.style.padding = "1px 4px 3px";
  probe.style.fontSize = `${item.fontSize}px`;
  probe.style.fontWeight = String(item.fontWeight);
  probe.style.fontFamily = fontFamily;
  probe.style.whiteSpace = "pre-wrap";
  probe.style.overflowWrap = "anywhere";
  probe.style.lineHeight = "1.05";
  probe.style.boxSizing = "border-box";
  probe.textContent = text || " ";
  document.body.appendChild(probe);
  const measured = probe.getBoundingClientRect().height;
  document.body.removeChild(probe);
  return Math.max(18, snap(Math.ceil(measured + 2)));
}

async function detectFontOptions(): Promise<string[]> {
  if (typeof window === "undefined") return COMMON_WINDOWS_FONTS;

  const unique = new Set<string>();
  const addFont = (fontName: string | undefined) => {
    if (!fontName) return;
    const normalized = fontName.trim();
    if (!normalized) return;
    unique.add(normalized);
  };

  try {
    const win = window as Window & {
      queryLocalFonts?: () => Promise<LocalFontFace[]>;
    };
    if (typeof win.queryLocalFonts === "function") {
      const localFonts = await win.queryLocalFonts();
      localFonts.forEach((font) => {
        addFont(font.family);
        addFont(font.fullName);
      });
    }
  } catch {
    // Fallback to curated list below.
  }

  if (unique.size === 0) {
    COMMON_WINDOWS_FONTS.forEach((font) => addFont(font));
  }

  return Array.from(unique).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

const SAMPLE_DATA: ShippingLabelPrintableItem = {
  cliente: "CLIENTE EXEMPLO LTDA",
  cidade: "CANOAS",
  estado: "RS",
  transportadora: "TRANSPORTADORA EXEMPLO",
  numeroNota: "123456",
  pesoKg: "10",
  volumeIndex: 1,
  volumeTotal: 1,
};

export default function NfeLabelDesignerPanel() {
  const [nfeData, setNfeData] = useState<NfeShippingData | null>(null);
  const [nfeFileName, setNfeFileName] = useState("");
  const [printing, setPrinting] = useState(false);
  const [layout, setLayout] = useState<ShippingLabelDesignerLayout>(() => loadLayoutFromStorage());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeInteractionId, setActiveInteractionId] = useState<string | null>(null);
  const [tokenToAdd, setTokenToAdd] = useState<ShippingLabelFieldToken>("cliente");
  const [importedLayoutName, setImportedLayoutName] = useState("");
  const [fontOptions, setFontOptions] = useState<string[]>(COMMON_WINDOWS_FONTS);

  const interactionRef = useRef<InteractionRef>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
    } catch {
      // Ignore storage errors.
    }
  }, [layout]);

  useEffect(() => {
    let active = true;
    void detectFontOptions().then((fonts) => {
      if (!active || fonts.length === 0) return;
      setFontOptions(fonts);
    });
    return () => {
      active = false;
    };
  }, []);

  const nfePrintItems = useMemo<ShippingLabelPrintableItem[]>(() => {
    if (!nfeData) return [];
    const cappedTotal = Math.max(1, Math.min(nfeData.volumes, MAX_NFE_LABELS_PER_PRINT));
    return Array.from({ length: cappedTotal }, (_, index) => ({
      cliente: nfeData.cliente,
      cidade: nfeData.cidade,
      estado: nfeData.estado,
      transportadora: nfeData.transportadora,
      numeroNota: nfeData.numeroNota,
      pesoKg: nfeData.pesoKg,
      volumeIndex: index + 1,
      volumeTotal: cappedTotal,
    }));
  }, [nfeData]);

  const previewData = nfePrintItems[0] ?? SAMPLE_DATA;

  const selectedItem = useMemo(
    () => layout.items.find((item) => item.id === selectedId) ?? null,
    [layout.items, selectedId]
  );

  const updateItem = (id: string, patch: Partial<ShippingLabelDesignerItem>) => {
    setLayout((current) => {
      const items = current.items.map((item) => {
        if (item.id !== id) return item;
        const next = { ...item, ...patch };
        return {
          ...next,
          x: clamp(snap(next.x), 0, Math.max(0, current.widthPx - next.width)),
          y: clamp(snap(next.y), 0, Math.max(0, current.heightPx - next.height)),
          width: clamp(snap(next.width), 40, current.widthPx),
          height: clamp(snap(next.height), 18, current.heightPx),
        };
      });
      return { ...current, items };
    });
  };

  const removeSelectedItem = () => {
    if (!selectedId) return;
    setLayout((current) => ({ ...current, items: current.items.filter((item) => item.id !== selectedId) }));
    setSelectedId(null);
  };

  const nudgeSelectedItem = (dx: number, dy: number) => {
    if (!selectedId) return;
    setLayout((current) => {
      const items = current.items.map((item) => {
        if (item.id !== selectedId) return item;
        const maxX = Math.max(0, current.widthPx - item.width);
        const maxY = Math.max(0, current.heightPx - item.height);
        return {
          ...item,
          x: clamp(snap(item.x + dx), 0, maxX),
          y: clamp(snap(item.y + dy), 0, maxY),
        };
      });
      return { ...current, items };
    });
  };

  const alignSelectedItem = (mode: AlignMode) => {
    if (!selectedId) return;
    setLayout((current) => {
      const items = current.items.map((item) => {
        if (item.id !== selectedId) return item;
        switch (mode) {
          case "left":
            return { ...item, x: 0 };
          case "center":
            return { ...item, x: snap(Math.max(0, (current.widthPx - item.width) / 2)) };
          case "right":
            return { ...item, x: Math.max(0, current.widthPx - item.width) };
          case "top":
            return { ...item, y: 0 };
          case "middle":
            return { ...item, y: snap(Math.max(0, (current.heightPx - item.height) / 2)) };
          case "bottom":
            return { ...item, y: Math.max(0, current.heightPx - item.height) };
          default:
            return item;
        }
      });
      return { ...current, items };
    });
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableElement(document.activeElement)) return;

      if (event.key === "Escape") {
        setSelectedId(null);
        return;
      }

      if (!selectedId) return;

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        setLayout((current) => ({ ...current, items: current.items.filter((item) => item.id !== selectedId) }));
        setSelectedId(null);
        return;
      }

      if (event.ctrlKey && event.shiftKey) {
        const key = event.key.toLowerCase();
        if (key === "l") {
          event.preventDefault();
          alignSelectedItem("left");
          return;
        }
        if (key === "c") {
          event.preventDefault();
          alignSelectedItem("center");
          return;
        }
        if (key === "r") {
          event.preventDefault();
          alignSelectedItem("right");
          return;
        }
        if (key === "t") {
          event.preventDefault();
          alignSelectedItem("top");
          return;
        }
        if (key === "m") {
          event.preventDefault();
          alignSelectedItem("middle");
          return;
        }
        if (key === "b") {
          event.preventDefault();
          alignSelectedItem("bottom");
          return;
        }
      }

      if (event.key.startsWith("Arrow")) {
        event.preventDefault();
        const step = event.shiftKey ? GRID_SIZE * 4 : GRID_SIZE;
        if (event.key === "ArrowLeft") nudgeSelectedItem(-step, 0);
        if (event.key === "ArrowRight") nudgeSelectedItem(step, 0);
        if (event.key === "ArrowUp") nudgeSelectedItem(0, -step);
        if (event.key === "ArrowDown") nudgeSelectedItem(0, step);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedId]);
  const handleXmlSelect = async (file: File | null) => {
    if (!file) return;
    try {
      const xmlText = await file.text();
      const parsed = parseNfeShippingData(xmlText);
      setNfeData(parsed);
      setNfeFileName(file.name);
      notifySuccess(`XML carregado com sucesso. Volumes detectados: ${parsed.volumes}.`);
    } catch (error) {
      setNfeData(null);
      setNfeFileName("");
      notifyError(error, "Falha ao processar XML da NF-e.");
    }
  };

  const clearXml = () => {
    setNfeData(null);
    setNfeFileName("");
  };

  const addTextItem = () => {
    const next: ShippingLabelDesignerItem = {
      id: makeId(),
      kind: "text",
      text: "Novo texto",
      x: 20,
      y: 20 + layout.items.length * 12,
      width: 260,
      height: 28,
      fontSize: 16,
      fontWeight: 400,
      align: "left",
      objectFit: "contain",
    };
    setLayout((current) => ({ ...current, items: [...current.items, next] }));
    setSelectedId(next.id);
  };

  const addTokenItem = () => {
    const label = SHIPPING_LABEL_FIELD_TOKEN_OPTIONS.find((item) => item.value === tokenToAdd)?.label || "Campo";
    const next: ShippingLabelDesignerItem = {
      id: makeId(),
      kind: "token",
      token: tokenToAdd,
      text: `${label.toUpperCase()}:`,
      x: 20,
      y: 20 + layout.items.length * 12,
      width: 300,
      height: 28,
      fontSize: 16,
      fontWeight: 700,
      align: "left",
      objectFit: "contain",
    };
    setLayout((current) => ({ ...current, items: [...current.items, next] }));
    setSelectedId(next.id);
  };

  const addImageItem = async (file: File | null) => {
    if (!file) return;
    try {
      const src = await readFileAsDataUrl(file);
      const next: ShippingLabelDesignerItem = {
        id: makeId(),
        kind: "image",
        text: file.name,
        src,
        x: 20,
        y: 20 + layout.items.length * 12,
        width: 180,
        height: 80,
        fontSize: 16,
        fontWeight: 400,
        align: "left",
        objectFit: "contain",
      };
      setLayout((current) => ({ ...current, items: [...current.items, next] }));
      setSelectedId(next.id);
      notifySuccess(`Imagem adicionada: ${file.name}`);
    } catch (error) {
      notifyError(error, "Falha ao carregar imagem.");
    }
  };

  const replaceSelectedImage = async (file: File | null) => {
    if (!file || !selectedItem || selectedItem.kind !== "image") return;
    try {
      const src = await readFileAsDataUrl(file);
      updateItem(selectedItem.id, { src, text: file.name });
      notifySuccess(`Imagem atualizada: ${file.name}`);
    } catch (error) {
      notifyError(error, "Falha ao substituir imagem.");
    }
  };

  const autoFitSelectedText = () => {
    if (!selectedItem || selectedItem.kind === "image") return;
    const measuredHeight = measureTextBlockHeight(
      resolveShippingLabelDesignerItemText(selectedItem, previewData),
      selectedItem,
      layout.fontFamily
    );
    updateItem(selectedItem.id, { height: measuredHeight });
    notifySuccess("Altura do bloco ajustada ao texto.");
  };

  const resetLayout = () => {
    setLayout(DEFAULT_SHIPPING_LABEL_DESIGNER_LAYOUT);
    setSelectedId(null);
    setImportedLayoutName("");
    notifySuccess("Layout visual restaurado para o padrao.");
  };

  const importLayout = async (file: File | null) => {
    if (!file) return;
    try {
      const text = await file.text();
      const normalized = normalizeShippingLabelDesignerLayout(JSON.parse(text) as unknown);
      setLayout(normalized);
      setSelectedId(null);
      setImportedLayoutName(file.name);
      notifySuccess(`Layout importado com sucesso: ${file.name}`);
    } catch (error) {
      notifyError(error, "Falha ao importar layout visual.");
    }
  };

  const exportLayout = () => {
    if (typeof document === "undefined" || typeof window === "undefined") return;
    const blob = new Blob([JSON.stringify(layout, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "layout_etiqueta_visual.json";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    notifySuccess("Layout exportado com sucesso.");
  };

  const startInteraction = (
    event: ReactPointerEvent<HTMLDivElement>,
    id: string,
    mode: "move" | "resize"
  ) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    interactionRef.current = {
      id,
      pointerId: event.pointerId,
      mode,
      lastX: event.clientX,
      lastY: event.clientY,
    };
    setActiveInteractionId(id);
    setSelectedId(id);
  };

  const moveInteraction = (event: ReactPointerEvent<HTMLDivElement>, id: string) => {
    const interaction = interactionRef.current;
    if (!interaction) return;
    if (interaction.id !== id || interaction.pointerId !== event.pointerId) return;

    const dx = event.clientX - interaction.lastX;
    const dy = event.clientY - interaction.lastY;
    if (dx === 0 && dy === 0) return;

    setLayout((current) => {
      const items = current.items.map((item) => {
        if (item.id !== id) return item;
        if (interaction.mode === "move") {
          const maxX = Math.max(0, current.widthPx - item.width);
          const maxY = Math.max(0, current.heightPx - item.height);
          return {
            ...item,
            x: clamp(snap(item.x + dx), 0, maxX),
            y: clamp(snap(item.y + dy), 0, maxY),
          };
        }
        const nextWidth = clamp(snap(item.width + dx), 40, Math.max(40, current.widthPx - item.x));
        const nextHeight = clamp(snap(item.height + dy), 18, Math.max(18, current.heightPx - item.y));
        return {
          ...item,
          width: nextWidth,
          height: nextHeight,
        };
      });
      return { ...current, items };
    });

    interactionRef.current = {
      ...interaction,
      lastX: event.clientX,
      lastY: event.clientY,
    };
  };

  const endInteraction = (event: ReactPointerEvent<HTMLDivElement>, id: string) => {
    const interaction = interactionRef.current;
    if (!interaction) return;
    if (interaction.id !== id || interaction.pointerId !== event.pointerId) return;
    interactionRef.current = null;
    setActiveInteractionId(null);
  };

  const runPrint = () => {
    if (!nfeData || nfePrintItems.length === 0) {
      notifyError(new Error("Carregue um XML valido antes de gerar etiquetas."));
      return;
    }
    setPrinting(true);
    try {
      if (nfeData.volumes > MAX_NFE_LABELS_PER_PRINT) {
        notifyError(
          new Error(
            `XML com ${nfeData.volumes} volumes. Limitado a ${MAX_NFE_LABELS_PER_PRINT} etiquetas por impressao.`
          )
        );
      }
      const html = buildShippingLabelsDesignerPrintHtml(nfePrintItems, layout);
      printHtml(html);
    } finally {
      setPrinting(false);
    }
  };

  return (
    <Stack gap="md">
      <FilterToolbar>
        <Stack gap="sm">
          <Group align="center" wrap="wrap">
            <FileButton
              onChange={(file) => void handleXmlSelect(file)}
              accept=".xml,text/xml,application/xml"
            >
              {(props) => (
                <Button {...props} leftSection={<IconFileImport size={16} />}>
                  1. Selecionar XML da NF-e
                </Button>
              )}
            </FileButton>
            <Button
              variant="light"
              color="gray"
              leftSection={<IconTrash size={16} />}
              onClick={clearXml}
              disabled={!nfeData}
            >
              Limpar XML
            </Button>
            <Badge variant="light">XML: {nfeFileName || "nenhum"}</Badge>
            <Badge variant="light">
              Etiquetas: {nfeData ? Math.max(1, Math.min(nfeData.volumes, MAX_NFE_LABELS_PER_PRINT)) : 0}
            </Badge>
            <Button leftSection={<IconPrinter size={16} />} onClick={runPrint} loading={printing} disabled={!nfeData}>
              3. Gerar etiquetas
            </Button>
          </Group>

          <Group align="center" wrap="wrap">
            <Button leftSection={<IconPlus size={16} />} onClick={addTextItem} variant="light">
              Texto livre
            </Button>
            <Select
              data={SHIPPING_LABEL_FIELD_TOKEN_OPTIONS}
              value={tokenToAdd}
              onChange={(value) => setTokenToAdd((value as ShippingLabelFieldToken) || "cliente")}
              w={220}
            />
            <Button leftSection={<IconPlus size={16} />} onClick={addTokenItem} variant="light">
              Campo dinamico
            </Button>
            <FileButton onChange={(file) => void addImageItem(file)} accept="image/png,image/jpeg,image/webp,image/svg+xml">
              {(props) => (
                <Button {...props} variant="light" leftSection={<IconPlus size={16} />}>
                  Adicionar imagem
                </Button>
              )}
            </FileButton>
            <FileButton onChange={(file) => void importLayout(file)} accept=".json,application/json,text/json">
              {(props) => (
                <Button {...props} variant="light" leftSection={<IconFileImport size={16} />}>
                  Importar layout
                </Button>
              )}
            </FileButton>
            <Button variant="light" leftSection={<IconDownload size={16} />} onClick={exportLayout}>
              Exportar layout
            </Button>
            <Button variant="subtle" color="gray" onClick={resetLayout}>
              Resetar layout
            </Button>
          </Group>

          <Alert variant="light" color="blue" title="2. Monte a etiqueta no canvas">
            Arraste para mover. Puxe o canto inferior direito para redimensionar. Use Del para excluir.
            Setas movem o bloco. Shift + setas move mais rapido. Ctrl + Shift + L/C/R/T/M/B alinha
            o bloco no canvas.
          </Alert>

          {importedLayoutName ? (
            <Badge variant="light">Layout importado: {importedLayoutName}</Badge>
          ) : (
            <Badge variant="light">Layout salvo automaticamente neste computador</Badge>
          )}
        </Stack>
      </FilterToolbar>
      {!nfeData ? (
        <Card withBorder>
          <EmptyState message="Selecione um XML da NF-e para editar e gerar etiquetas." />
        </Card>
      ) : (
        <Group align="start" wrap="wrap">
          <Card withBorder p="md" style={{ flex: 1, minWidth: 760 }}>
            <Stack gap="xs">
              <Group justify="space-between" wrap="wrap">
                <div>
                  <Text fw={600}>Editor visual</Text>
                  <Text size="xs" c="dimmed">
                    Selecione um bloco, mova com o mouse e redimensione pela alca no canto.
                  </Text>
                </div>
                <Badge variant="light">Grade de {GRID_SIZE}px</Badge>
              </Group>
              <div
                style={{
                  width: layout.widthPx,
                  maxWidth: "100%",
                  height: layout.heightPx,
                  border: layout.showBorder ? "1px solid #868e96" : "1px dashed #adb5bd",
                  borderRadius: 8,
                  position: "relative",
                  overflow: "hidden",
                  backgroundColor: "#fff",
                  backgroundImage:
                    "linear-gradient(to right, rgba(0,0,0,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.05) 1px, transparent 1px)",
                  backgroundSize: `${GRID_SIZE * 4}px ${GRID_SIZE * 4}px`,
                }}
                onPointerDown={(event) => {
                  if (event.target === event.currentTarget) {
                    setSelectedId(null);
                  }
                }}
              >
                {layout.items.map((item) => {
                  const isSelected = item.id === selectedId;
                  const isActive = item.id === activeInteractionId;
                  const text = resolveShippingLabelDesignerItemText(item, previewData);
                  return (
                    <div
                      key={item.id}
                      onPointerDown={(event) => startInteraction(event, item.id, "move")}
                      onPointerMove={(event) => moveInteraction(event, item.id)}
                      onPointerUp={(event) => endInteraction(event, item.id)}
                      onPointerCancel={(event) => endInteraction(event, item.id)}
                      style={{
                        position: "absolute",
                        left: item.x,
                        top: item.y,
                        width: item.width,
                        height: item.height,
                        padding: item.kind === "image" ? 0 : "1px 4px 3px",
                        fontSize: item.fontSize,
                        fontWeight: item.fontWeight,
                        textAlign: item.align,
                        fontFamily: layout.fontFamily,
                        whiteSpace: "pre-wrap",
                        overflow: item.kind === "image" ? "hidden" : "visible",
                        lineHeight: 1.05,
                        border: isSelected ? "1px solid #228be6" : "1px dashed transparent",
                        borderRadius: 4,
                        cursor: isActive ? (interactionRef.current?.mode === "resize" ? "nwse-resize" : "grabbing") : "grab",
                        userSelect: "none",
                        backgroundColor: isSelected ? "rgba(34,139,230,0.06)" : "transparent",
                        boxShadow: isSelected ? "0 0 0 1px rgba(34,139,230,0.08) inset" : "none",
                      }}
                    >
                      {item.kind === "image" ? (
                        item.src ? (
                          <img
                            src={item.src}
                            alt={item.text || "Imagem da etiqueta"}
                            style={{
                              width: "100%",
                              height: "100%",
                              objectFit: item.objectFit,
                              display: "block",
                              pointerEvents: "none",
                            }}
                          />
                        ) : (
                          <div
                            style={{
                              width: "100%",
                              height: "100%",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              color: "#6b7280",
                              border: "1px dashed #cbd5e1",
                              pointerEvents: "none",
                            }}
                          >
                            Imagem
                          </div>
                        )
                      ) : text ? (
                        text
                      ) : (
                        <span style={{ opacity: 0.55 }}>(vazio)</span>
                      )}

                      {isSelected && (
                        <div
                          onPointerDown={(event) => startInteraction(event, item.id, "resize")}
                          onPointerMove={(event) => moveInteraction(event, item.id)}
                          onPointerUp={(event) => endInteraction(event, item.id)}
                          onPointerCancel={(event) => endInteraction(event, item.id)}
                          style={{
                            position: "absolute",
                            right: 0,
                            bottom: 0,
                            width: 12,
                            height: 12,
                            background: "#228be6",
                            borderTopLeftRadius: 4,
                            cursor: "nwse-resize",
                          }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </Stack>
          </Card>

          <Card withBorder p="md" style={{ width: 380, maxWidth: "100%" }}>
            <Stack gap="sm">
              <Text fw={600}>Propriedades e alinhamento</Text>

              <TextInput
                label="Nome do layout"
                value={layout.name}
                onChange={(event) => setLayout((current) => ({ ...current, name: event.currentTarget.value }))}
              />
              <Group grow>
                <NumberInput
                  label="Largura canvas"
                  value={layout.widthPx}
                  min={300}
                  max={2200}
                  onChange={(value) =>
                    setLayout((current) => ({
                      ...current,
                      widthPx: clamp(Number(value || current.widthPx), 300, 2200),
                    }))
                  }
                />
                <NumberInput
                  label="Altura canvas"
                  value={layout.heightPx}
                  min={120}
                  max={2200}
                  onChange={(value) =>
                    setLayout((current) => ({
                      ...current,
                      heightPx: clamp(Number(value || current.heightPx), 120, 2200),
                    }))
                  }
                />
              </Group>
              <TextInput
                label="Fonte atual"
                value={layout.fontFamily}
                readOnly
              />
              <Select
                label="Trocar fonte"
                data={fontOptions.map((font) => ({ value: font, label: font }))}
                value={layout.fontFamily}
                searchable
                nothingFoundMessage="Nenhuma fonte encontrada"
                onChange={(value) => {
                  if (!value) return;
                  setLayout((current) => ({ ...current, fontFamily: value }));
                }}
              />
              <Checkbox
                label="Mostrar borda da etiqueta"
                checked={layout.showBorder}
                onChange={(event) =>
                  setLayout((current) => ({ ...current, showBorder: event.currentTarget.checked }))
                }
              />

              <Divider />

              {!selectedItem ? (
                <Text size="sm" c="dimmed">
                  Selecione um bloco no canvas para editar, alinhar ou excluir.
                </Text>
              ) : (
                <Stack gap="xs">
                  <Badge variant="light">
                    Selecionado: {selectedItem.kind === "image" ? "Imagem" : selectedItem.id}
                  </Badge>

                  <Group grow>
                    <Button size="xs" variant="light" onClick={() => alignSelectedItem("left")}>
                      Esq
                    </Button>
                    <Button size="xs" variant="light" onClick={() => alignSelectedItem("center")}>
                      Centro
                    </Button>
                    <Button size="xs" variant="light" onClick={() => alignSelectedItem("right")}>
                      Dir
                    </Button>
                  </Group>
                  <Group grow>
                    <Button size="xs" variant="light" onClick={() => alignSelectedItem("top")}>
                      Topo
                    </Button>
                    <Button size="xs" variant="light" onClick={() => alignSelectedItem("middle")}>
                      Meio
                    </Button>
                    <Button size="xs" variant="light" onClick={() => alignSelectedItem("bottom")}>
                      Base
                    </Button>
                  </Group>

                  <Select
                    label="Tipo"
                    data={[
                      { value: "text", label: "Texto livre" },
                      { value: "token", label: "Campo dinamico" },
                      { value: "image", label: "Imagem" },
                    ]}
                    value={selectedItem.kind}
                    onChange={(value) => {
                      const nextKind = (value as ShippingLabelDesignerItem["kind"]) || "text";
                      updateItem(selectedItem.id, {
                        kind: nextKind,
                        token: nextKind === "token" ? selectedItem.token || "cliente" : undefined,
                        src: nextKind === "image" ? selectedItem.src : undefined,
                        width: nextKind === "image" ? Math.max(selectedItem.width, 120) : selectedItem.width,
                        height: nextKind === "image" ? Math.max(selectedItem.height, 60) : selectedItem.height,
                      });
                    }}
                  />

                  {selectedItem.kind === "image" ? (
                    <>
                      <TextInput
                        label="Nome interno"
                        value={selectedItem.text}
                        onChange={(event) => updateItem(selectedItem.id, { text: event.currentTarget.value })}
                      />
                      <FileButton
                        onChange={(file) => void replaceSelectedImage(file)}
                        accept="image/png,image/jpeg,image/webp,image/svg+xml"
                      >
                        {(props) => (
                          <Button {...props} variant="light" leftSection={<IconFileImport size={16} />}>
                            Trocar imagem
                          </Button>
                        )}
                      </FileButton>
                      <Select
                        label="Ajuste da imagem"
                        data={[
                          { value: "contain", label: "Manter inteira" },
                          { value: "cover", label: "Preencher cortando" },
                          { value: "fill", label: "Esticar" },
                        ]}
                        value={selectedItem.objectFit}
                        onChange={(value) =>
                          updateItem(selectedItem.id, {
                            objectFit: (value as ShippingLabelDesignerItem["objectFit"]) || "contain",
                          })
                        }
                      />
                    </>
                  ) : (
                    <>
                      <TextInput
                        label={selectedItem.kind === "token" ? "Prefixo (ex.: CLIENTE:)" : "Texto"}
                        value={selectedItem.text}
                        onChange={(event) => updateItem(selectedItem.id, { text: event.currentTarget.value })}
                      />
                      {selectedItem.kind === "token" && (
                        <Select
                          label="Campo"
                          data={SHIPPING_LABEL_FIELD_TOKEN_OPTIONS}
                          value={selectedItem.token || "cliente"}
                          onChange={(value) =>
                            updateItem(selectedItem.id, { token: (value as ShippingLabelFieldToken) || "cliente" })
                          }
                        />
                      )}
                      <Button variant="light" onClick={autoFitSelectedText}>
                        Ajustar altura ao texto
                      </Button>
                    </>
                  )}
                  <Group grow>
                    <NumberInput
                      label="X"
                      value={selectedItem.x}
                      min={0}
                      max={Math.max(0, layout.widthPx - selectedItem.width)}
                      onChange={(value) =>
                        updateItem(selectedItem.id, {
                          x: clamp(Number(value || selectedItem.x), 0, Math.max(0, layout.widthPx - selectedItem.width)),
                        })
                      }
                    />
                    <NumberInput
                      label="Y"
                      value={selectedItem.y}
                      min={0}
                      max={Math.max(0, layout.heightPx - selectedItem.height)}
                      onChange={(value) =>
                        updateItem(selectedItem.id, {
                          y: clamp(Number(value || selectedItem.y), 0, Math.max(0, layout.heightPx - selectedItem.height)),
                        })
                      }
                    />
                  </Group>
                  <Group grow>
                    <NumberInput
                      label="Largura"
                      value={selectedItem.width}
                      min={40}
                      max={layout.widthPx}
                      onChange={(value) =>
                        updateItem(selectedItem.id, {
                          width: clamp(Number(value || selectedItem.width), 40, layout.widthPx),
                        })
                      }
                    />
                    <NumberInput
                      label="Altura"
                      value={selectedItem.height}
                      min={18}
                      max={layout.heightPx}
                      onChange={(value) =>
                        updateItem(selectedItem.id, {
                          height: clamp(Number(value || selectedItem.height), 18, layout.heightPx),
                        })
                      }
                    />
                  </Group>

                  {selectedItem.kind !== "image" && (
                    <>
                      <Group grow>
                        <NumberInput
                          label="Fonte"
                          value={selectedItem.fontSize}
                          min={8}
                          max={64}
                          onChange={(value) =>
                            updateItem(selectedItem.id, {
                              fontSize: clamp(Number(value || selectedItem.fontSize), 8, 64),
                            })
                          }
                        />
                        <Select
                          label="Alinhamento do texto"
                          data={[
                            { value: "left", label: "Esquerda" },
                            { value: "center", label: "Centro" },
                            { value: "right", label: "Direita" },
                          ]}
                          value={selectedItem.align}
                          onChange={(value) =>
                            updateItem(selectedItem.id, {
                              align: (value as "left" | "center" | "right") || "left",
                            })
                          }
                        />
                      </Group>
                      <Checkbox
                        label="Negrito"
                        checked={selectedItem.fontWeight >= 700}
                        onChange={(event) =>
                          updateItem(selectedItem.id, { fontWeight: event.currentTarget.checked ? 700 : 400 })
                        }
                      />
                    </>
                  )}

                  <Button color="red" variant="light" leftSection={<IconTrash size={16} />} onClick={removeSelectedItem}>
                    Excluir bloco
                  </Button>
                </Stack>
              )}
            </Stack>
          </Card>
        </Group>
      )}

      {nfeData && (
        <Card withBorder>
          <Stack gap="xs">
            <Text fw={600}>Dados da NF-e carregada</Text>
            <Table withTableBorder>
              <Table.Tbody>
                <Table.Tr>
                  <Table.Th>Cliente</Table.Th>
                  <Table.Td>{nfeData.cliente}</Table.Td>
                </Table.Tr>
                <Table.Tr>
                  <Table.Th>Cidade / Estado</Table.Th>
                  <Table.Td>
                    {nfeData.cidade} / {nfeData.estado}
                  </Table.Td>
                </Table.Tr>
                <Table.Tr>
                  <Table.Th>Transportadora</Table.Th>
                  <Table.Td>{nfeData.transportadora}</Table.Td>
                </Table.Tr>
                <Table.Tr>
                  <Table.Th>Numero da nota</Table.Th>
                  <Table.Td>{nfeData.numeroNota}</Table.Td>
                </Table.Tr>
                <Table.Tr>
                  <Table.Th>Volumes</Table.Th>
                  <Table.Td>{nfeData.volumes}</Table.Td>
                </Table.Tr>
                <Table.Tr>
                  <Table.Th>Peso (Kg)</Table.Th>
                  <Table.Td>{nfeData.pesoKg}</Table.Td>
                </Table.Tr>
              </Table.Tbody>
            </Table>
          </Stack>
        </Card>
      )}
    </Stack>
  );
}
