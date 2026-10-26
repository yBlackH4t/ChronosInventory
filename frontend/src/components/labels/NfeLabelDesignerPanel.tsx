import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  Accordion,
  ActionIcon,
  Button,
  Card,
  Checkbox,
  FileButton,
  Group,
  Kbd,
  Menu,
  Modal,
  NumberInput,
  Select,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import {
  IconArrowBackUp,
  IconArrowsSort,
  IconCopy,
  IconDownload,
  IconEraser,
  IconPencil,
  IconFileImport,
  IconFileTypeXml,
  IconKeyboard,
  IconLayoutBoard,
  IconPhoto,
  IconPrinter,
  IconRestore,
  IconTemplate,
  IconTrash,
  IconTypography,
  IconVariable,
} from "@tabler/icons-react";

import EmptyState from "../ui/EmptyState";
import {
  buildShippingLabelsDesignerPrintHtml,
  DEFAULT_SHIPPING_LABEL_DESIGNER_LAYOUT,
  halfSheetShippingLabelLayout,
  normalizeShippingLabelDesignerLayout,
  resolveShippingLabelDesignerItemText,
  SHIPPING_LABEL_FIELD_TOKEN_OPTIONS,
  type ShippingLabelDesignerItem,
  type ShippingLabelDesignerLayout,
  type ShippingLabelFieldToken,
  type ShippingLabelPrintableItem,
} from "../../lib/labelsPrint";
import {
  type NfeShippingData,
  nfeShippingPrintItems,
  parseNfeShippingData,
} from "../../lib/nfeShippingLabel";
import { notifyError, notifySuccess } from "../../lib/notify";
import { notifyUndo } from "../../lib/notifyUndo";
import SortableList from "../ui/SortableList";
import NfeSelectedBlockEditor from "./NfeSelectedBlockEditor";
import {
  MAX_PROFILES,
  loadActiveProfileId,
  loadProfiles,
  rawProfile,
  saveActiveProfileId,
  saveProfiles,
  type NfeLabelProfile,
} from "./nfeLabelProfiles";
import {
  COMMON_WINDOWS_FONTS,
  GRID_SIZE,
  MAX_NFE_LABELS_PER_PRINT,
  PREVIOUS_LAYOUT_KEY,
  SAMPLE_DATA,
  STORAGE_KEY,
  clamp,
  detectFontOptions,
  isEditableElement,
  loadLayoutFromStorage,
  makeId,
  measureTextBlockHeight,
  printHtml,
  readFileAsDataUrl,
  snap,
  type AlignMode,
  type InteractionRef,
} from "./nfeDesignerUtils";

export default function NfeLabelDesignerPanel() {
  const [nfeData, setNfeData] = useState<NfeShippingData | null>(null);
  const [nfeFileName, setNfeFileName] = useState("");
  const [printing, setPrinting] = useState(false);
  // Perfis (Perfil 1, Perfil 2, Crua...): o escolhido é o layout em edição, salvo sozinho nele.
  const [profiles, setProfiles] = useState<NfeLabelProfile[]>(() => loadProfiles());
  const [activeProfileId, setActiveProfileId] = useState<string>(() =>
    loadActiveProfileId(profiles),
  );
  const [layout, setLayout] = useState<ShippingLabelDesignerLayout>(
    () => profiles.find((p) => p.id === activeProfileId)?.layout ?? loadLayoutFromStorage(),
  );
  const [profileNameModal, setProfileNameModal] = useState<"novo" | "renomear" | null>(null);
  const [profileName, setProfileName] = useState("");
  const [sortProfilesOpen, setSortProfilesOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeInteractionId, setActiveInteractionId] = useState<string | null>(
    null,
  );
  const [tokenToAdd, setTokenToAdd] =
    useState<ShippingLabelFieldToken>("cliente");
  const [importedLayoutName, setImportedLayoutName] = useState("");
  const [fontOptions, setFontOptions] =
    useState<string[]>(COMMON_WINDOWS_FONTS);

  const interactionRef = useRef<InteractionRef>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
    } catch {
      // Ignore storage errors.
    }
    setProfiles((current) => {
      const next = current.map((p) => (p.id === activeProfileId ? { ...p, layout } : p));
      saveProfiles(next);
      return next;
    });
  }, [layout, activeProfileId]);

  const activeProfile = profiles.find((p) => p.id === activeProfileId) ?? profiles[0];

  const selectProfile = (id: string) => {
    const profile = profiles.find((p) => p.id === id);
    if (!profile) return;
    setActiveProfileId(id);
    saveActiveProfileId(id);
    setLayout(profile.layout);
    setSelectedId(null);
    setImportedLayoutName("");
  };

  const addProfile = (profile: NfeLabelProfile) => {
    if (profiles.length >= MAX_PROFILES) {
      notifyError(new Error(`Limite de ${MAX_PROFILES} perfis. Exclua um antes.`));
      return false;
    }
    const next = [...profiles, profile];
    setProfiles(next);
    saveProfiles(next);
    setActiveProfileId(profile.id);
    saveActiveProfileId(profile.id);
    setLayout(profile.layout);
    setSelectedId(null);
    return true;
  };

  const openProfileName = (mode: "novo" | "renomear") => {
    setProfileName(mode === "renomear" ? activeProfile.nome : `Perfil ${profiles.length + 1}`);
    setProfileNameModal(mode);
  };

  const confirmProfileName = () => {
    const nome = profileName.trim().slice(0, 40);
    if (!nome) return;
    if (profileNameModal === "renomear") {
      const next = profiles.map((p) => (p.id === activeProfile.id ? { ...p, nome } : p));
      setProfiles(next);
      saveProfiles(next);
      notifySuccess(`Perfil renomeado para ${nome}.`);
    } else if (addProfile({ id: makeId(), nome, layout })) {
      notifySuccess(`Perfil ${nome} salvo. Escolha o perfil na lista para trocar de layout.`);
    }
    setProfileNameModal(null);
  };

  const deleteProfile = () => {
    if (profiles.length <= 1) return;
    const before = profiles;
    const removed = activeProfile;
    const next = profiles.filter((p) => p.id !== activeProfile.id);
    setProfiles(next);
    saveProfiles(next);
    setActiveProfileId(next[0].id);
    saveActiveProfileId(next[0].id);
    setLayout(next[0].layout);
    setSelectedId(null);
    notifyUndo(`Perfil ${removed.nome} excluído.`, () => {
      setProfiles(before);
      saveProfiles(before);
      setActiveProfileId(removed.id);
      saveActiveProfileId(removed.id);
      setLayout(removed.layout);
    });
  };

  const reorderProfiles = (next: NfeLabelProfile[]) => {
    setProfiles(next);
    saveProfiles(next);
  };

  const addRawProfile = () => {
    if (addProfile(rawProfile())) notifySuccess("Perfil cru criado: sem logo e sem remetente.");
  };

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

  const nfePrintItems = useMemo<ShippingLabelPrintableItem[]>(
    () => (nfeData ? nfeShippingPrintItems(nfeData, MAX_NFE_LABELS_PER_PRINT) : []),
    [nfeData],
  );

  const previewData = nfePrintItems[0] ?? SAMPLE_DATA;

  const selectedItem = useMemo(
    () => layout.items.find((item) => item.id === selectedId) ?? null,
    [layout.items, selectedId],
  );

  const updateItem = (
    id: string,
    patch: Partial<ShippingLabelDesignerItem>,
  ) => {
    setLayout((current) => {
      const items = current.items.map((item) => {
        if (item.id !== id) return item;
        const next = { ...item, ...patch };
        return {
          ...next,
          x: clamp(snap(next.x), 0, Math.max(0, current.widthPx - next.width)),
          y: clamp(
            snap(next.y),
            0,
            Math.max(0, current.heightPx - next.height),
          ),
          width: clamp(snap(next.width), 40, current.widthPx),
          height: clamp(snap(next.height), 18, current.heightPx),
        };
      });
      return { ...current, items };
    });
  };

  const removeSelectedItem = () => {
    if (!selectedId) return;
    setLayout((current) => ({
      ...current,
      items: current.items.filter((item) => item.id !== selectedId),
    }));
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
            return {
              ...item,
              x: snap(Math.max(0, (current.widthPx - item.width) / 2)),
            };
          case "right":
            return { ...item, x: Math.max(0, current.widthPx - item.width) };
          case "top":
            return { ...item, y: 0 };
          case "middle":
            return {
              ...item,
              y: snap(Math.max(0, (current.heightPx - item.height) / 2)),
            };
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
        setLayout((current) => ({
          ...current,
          items: current.items.filter((item) => item.id !== selectedId),
        }));
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
      notifySuccess(
        `XML carregado com sucesso. Volumes detectados: ${parsed.volumes}.`,
      );
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
    const label =
      SHIPPING_LABEL_FIELD_TOKEN_OPTIONS.find(
        (item) => item.value === tokenToAdd,
      )?.label || "Campo";
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
      layout.fontFamily,
    );
    updateItem(selectedItem.id, { height: measuredHeight });
    notifySuccess("Altura do bloco ajustada ao texto.");
  };

  const applyHalfSheetModel = () => {
    const logo = layout.items.find((item) => item.kind === "image" && item.src)?.src;
    try {
      window.localStorage.setItem(PREVIOUS_LAYOUT_KEY, JSON.stringify(layout));
    } catch {
      // Sem storage: o modelo entra mesmo assim.
    }
    setLayout(halfSheetShippingLabelLayout(logo));
    setSelectedId(null);
    setImportedLayoutName("");
    notifySuccess(
      logo
        ? "Modelo meia folha aplicado com o seu logo. O layout anterior ficou guardado."
        : "Modelo meia folha aplicado. Coloque o logo no bloco de imagem. O layout anterior ficou guardado.",
    );
  };

  const restorePreviousLayout = () => {
    try {
      const raw = window.localStorage.getItem(PREVIOUS_LAYOUT_KEY);
      if (!raw) {
        notifyError(new Error("Não há layout anterior guardado nesta máquina."));
        return;
      }
      window.localStorage.setItem(PREVIOUS_LAYOUT_KEY, JSON.stringify(layout));
      setLayout(normalizeShippingLabelDesignerLayout(JSON.parse(raw) as unknown));
      setSelectedId(null);
      notifySuccess("Layout anterior de volta.");
    } catch (error) {
      notifyError(error, "Não foi possível voltar ao layout anterior.");
    }
  };

  const resetLayout = () => {
    setLayout(DEFAULT_SHIPPING_LABEL_DESIGNER_LAYOUT);
    setSelectedId(null);
    setImportedLayoutName("");
    notifySuccess("Layout visual restaurado para o padrão.");
  };

  const importLayout = async (file: File | null) => {
    if (!file) return;
    try {
      const text = await file.text();
      const normalized = normalizeShippingLabelDesignerLayout(
        JSON.parse(text) as unknown,
      );
      // O layout importado vira um perfil novo, sem apagar o que estava em uso.
      const nome = file.name.replace(/\.json$/i, "").slice(0, 40) || `Perfil ${profiles.length + 1}`;
      if (!addProfile({ id: makeId(), nome, layout: normalized })) return;
      setImportedLayoutName(file.name);
      notifySuccess(`Layout importado como o perfil ${nome}.`);
    } catch (error) {
      notifyError(error, "Falha ao importar layout visual.");
    }
  };

  const exportLayout = () => {
    if (typeof document === "undefined" || typeof window === "undefined")
      return;
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
    mode: "move" | "resize",
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

  const moveInteraction = (
    event: ReactPointerEvent<HTMLDivElement>,
    id: string,
  ) => {
    const interaction = interactionRef.current;
    if (!interaction) return;
    if (interaction.id !== id || interaction.pointerId !== event.pointerId)
      return;

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
        const nextWidth = clamp(
          snap(item.width + dx),
          40,
          Math.max(40, current.widthPx - item.x),
        );
        const nextHeight = clamp(
          snap(item.height + dy),
          18,
          Math.max(18, current.heightPx - item.y),
        );
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

  const endInteraction = (
    event: ReactPointerEvent<HTMLDivElement>,
    id: string,
  ) => {
    const interaction = interactionRef.current;
    if (!interaction) return;
    if (interaction.id !== id || interaction.pointerId !== event.pointerId)
      return;
    interactionRef.current = null;
    setActiveInteractionId(null);
  };

  const runPrint = () => {
    if (!nfeData || nfePrintItems.length === 0) {
      notifyError(
        new Error("Carregue um XML válido antes de gerar etiquetas."),
      );
      return;
    }
    setPrinting(true);
    try {
      if (nfeData.volumes > MAX_NFE_LABELS_PER_PRINT) {
        notifyError(
          new Error(
            `XML com ${nfeData.volumes} volumes. Limitado a ${MAX_NFE_LABELS_PER_PRINT} etiquetas por impressão.`,
          ),
        );
      }
      const html = buildShippingLabelsDesignerPrintHtml(nfePrintItems, layout);
      printHtml(html);
    } finally {
      setPrinting(false);
    }
  };

  const labelCount = nfeData
    ? Math.max(1, Math.min(nfeData.volumes, MAX_NFE_LABELS_PER_PRINT))
    : 0;

  return (
    <Stack gap="md">
      {/* Barra do documento: XML carregado, layout e impressão */}
      <div className="surface-panel" style={{ padding: "12px 16px" }}>
        <Group justify="space-between" wrap="wrap" gap="sm">
          <Group gap="sm" wrap="nowrap" miw={0}>
            <span className="settings-item-icon">
              <IconFileTypeXml size={18} stroke={1.5} />
            </span>
            {nfeData ? (
              <div style={{ minWidth: 0 }}>
                <Text size="sm" fw={600} truncate="end">
                  {nfeFileName || "NF-e carregada"}
                </Text>
                <Text size="xs" c="dimmed" truncate="end">
                  NF {nfeData.numeroNota} · {nfeData.cliente} · {labelCount}{" "}
                  {labelCount === 1 ? "etiqueta" : "etiquetas"}
                </Text>
              </div>
            ) : (
              <div>
                <Text size="sm" fw={600}>
                  Nenhum XML carregado
                </Text>
                <Text size="xs" c="dimmed">
                  {importedLayoutName
                    ? `Layout: ${importedLayoutName}`
                    : `${activeProfile.nome}: salvo sozinho neste computador`}
                </Text>
              </div>
            )}
          </Group>

          <Group gap="xs">
            <FileButton
              onChange={(file) => void handleXmlSelect(file)}
              accept=".xml,text/xml,application/xml"
            >
              {(props) => (
                <Button
                  {...props}
                  variant={nfeData ? "default" : "filled"}
                  leftSection={<IconFileImport size={16} stroke={1.5} />}
                >
                  {nfeData ? "Trocar XML" : "Selecionar XML da NF-e"}
                </Button>
              )}
            </FileButton>
            {nfeData && (
              <Tooltip label="Remover XML">
                <ActionIcon
                  size="lg"
                  variant="default"
                  className="action-danger"
                  aria-label="Remover XML"
                  onClick={clearXml}
                >
                  <IconTrash size={16} stroke={1.5} />
                </ActionIcon>
              </Tooltip>
            )}
            <Select
              aria-label="Perfil da etiqueta"
              w={190}
              data={profiles.map((p) => ({ value: p.id, label: p.nome }))}
              value={activeProfile.id}
              onChange={(v) => v && selectProfile(v)}
              allowDeselect={false}
              comboboxProps={{ withinPortal: true }}
            />
            <Menu position="bottom-end" width={260} keepMounted>
              <Menu.Target>
                <Button
                  variant="default"
                  leftSection={<IconTemplate size={16} stroke={1.5} />}
                >
                  Layout
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>Perfil: {activeProfile.nome}</Menu.Label>
                <Menu.Item
                  leftSection={<IconCopy size={16} stroke={1.5} />}
                  onClick={() => openProfileName("novo")}
                >
                  Salvar como novo perfil
                </Menu.Item>
                <Menu.Item
                  leftSection={<IconPencil size={16} stroke={1.5} />}
                  onClick={() => openProfileName("renomear")}
                >
                  Renomear perfil
                </Menu.Item>
                <Menu.Item
                  leftSection={<IconEraser size={16} stroke={1.5} />}
                  onClick={addRawProfile}
                >
                  Novo perfil cru (sem marca)
                </Menu.Item>
                <Menu.Item
                  leftSection={<IconArrowsSort size={16} stroke={1.5} />}
                  disabled={profiles.length <= 1}
                  onClick={() => setSortProfilesOpen(true)}
                >
                  Ordenar perfis
                </Menu.Item>
                <Menu.Item
                  color="danger"
                  leftSection={<IconTrash size={16} stroke={1.5} />}
                  disabled={profiles.length <= 1}
                  onClick={deleteProfile}
                >
                  Excluir este perfil
                </Menu.Item>
                <Menu.Divider />
                <FileButton
                  onChange={(file) => void importLayout(file)}
                  accept=".json,application/json,text/json"
                >
                  {(props) => (
                    <Menu.Item
                      {...props}
                      leftSection={<IconFileImport size={16} stroke={1.5} />}
                    >
                      Importar layout
                    </Menu.Item>
                  )}
                </FileButton>
                <Menu.Item
                  leftSection={<IconDownload size={16} stroke={1.5} />}
                  onClick={exportLayout}
                >
                  Exportar layout
                </Menu.Item>
                <Menu.Divider />
                <Menu.Item
                  leftSection={<IconLayoutBoard size={16} stroke={1.5} />}
                  onClick={applyHalfSheetModel}
                >
                  Usar modelo meia folha
                </Menu.Item>
                <Menu.Item
                  leftSection={<IconArrowBackUp size={16} stroke={1.5} />}
                  onClick={restorePreviousLayout}
                >
                  Voltar ao layout anterior
                </Menu.Item>
                <Menu.Divider />
                <Menu.Item
                  leftSection={<IconRestore size={16} stroke={1.5} />}
                  onClick={resetLayout}
                >
                  Restaurar layout padrão
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
            <Button
              leftSection={<IconPrinter size={16} />}
              onClick={runPrint}
              loading={printing}
              disabled={!nfeData}
            >
              Imprimir{labelCount > 0 ? ` ${labelCount}` : ""}
            </Button>
          </Group>
        </Group>
      </div>

      {!nfeData ? (
        <Card>
          <EmptyState
            icon={<IconFileTypeXml size={22} stroke={1.5} />}
            message="Carregue o XML da NF-e"
            description="Os dados do cliente, transportadora e volumes preenchem a etiqueta automaticamente. Depois é só ajustar o layout e imprimir."
          />
        </Card>
      ) : (
        <Group align="flex-start" wrap="wrap" gap="md">
          {/* Canvas */}
          <Stack gap="xs" style={{ flex: 1, minWidth: 560 }}>
            <div
              className="surface-panel"
              style={{
                padding: 24,
                display: "flex",
                justifyContent: "center",
                background: "var(--surface-2)",
                overflow: "auto",
              }}
            >
              <div
                style={{
                  width: layout.widthPx,
                  maxWidth: "100%",
                  height: layout.heightPx,
                  border: layout.showBorder
                    ? "1px solid var(--mantine-color-slate-5)"
                    : "1px dashed var(--mantine-color-slate-3)",
                  borderRadius: 6,
                  position: "relative",
                  overflow: "hidden",
                  color: "var(--mantine-color-slate-9)",
                  backgroundColor: "var(--mantine-color-white)",
                  boxShadow: "0 1px 3px rgba(15, 23, 42, 0.12)",
                  backgroundImage:
                    "linear-gradient(to right, rgba(15,23,42,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(15,23,42,0.04) 1px, transparent 1px)",
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
                  const text = resolveShippingLabelDesignerItemText(
                    item,
                    previewData,
                  );
                  return (
                    <div
                      key={item.id}
                      onPointerDown={(event) =>
                        startInteraction(event, item.id, "move")
                      }
                      onPointerMove={(event) => moveInteraction(event, item.id)}
                      onPointerUp={(event) => endInteraction(event, item.id)}
                      onPointerCancel={(event) =>
                        endInteraction(event, item.id)
                      }
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
                        border: isSelected
                          ? "1px solid var(--accent)"
                          : "1px dashed transparent",
                        borderRadius: 4,
                        cursor: isActive
                          ? interactionRef.current?.mode === "resize"
                            ? "nwse-resize"
                            : "grabbing"
                          : "grab",
                        userSelect: "none",
                        backgroundColor: item.inverted
                          ? "#000"
                          : isSelected
                            ? "rgba(79,70,229,0.06)"
                            : "transparent",
                        color: item.inverted ? "#fff" : undefined,
                        boxShadow: item.frame ? "inset 0 0 0 1.5px #000" : undefined,
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
                              color: "var(--mantine-color-slate-5)",
                              border: "1px dashed var(--mantine-color-slate-3)",
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
                          onPointerDown={(event) =>
                            startInteraction(event, item.id, "resize")
                          }
                          onPointerMove={(event) =>
                            moveInteraction(event, item.id)
                          }
                          onPointerUp={(event) =>
                            endInteraction(event, item.id)
                          }
                          onPointerCancel={(event) =>
                            endInteraction(event, item.id)
                          }
                          style={{
                            position: "absolute",
                            right: -1,
                            bottom: -1,
                            width: 10,
                            height: 10,
                            background: "var(--accent)",
                            borderRadius: 2,
                            cursor: "nwse-resize",
                          }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <Group gap={6} wrap="wrap">
              <IconKeyboard size={14} stroke={1.5} color="var(--text-subtle)" />
              <Text size="xs" c="dimmed">
                Arraste para mover · canto inferior direito redimensiona ·{" "}
                <Kbd size="xs">Del</Kbd> exclui · <Kbd size="xs">Setas</Kbd> movem
                (<Kbd size="xs">Shift</Kbd> mais rápido) ·{" "}
                <Kbd size="xs">Ctrl Shift L/C/R/T/M/B</Kbd> alinha
              </Text>
            </Group>
          </Stack>

          {/* Inspetor */}
          <div className="surface-panel" style={{ width: 340, maxWidth: "100%", overflow: "hidden" }}>
            <Accordion
              multiple
              defaultValue={["inserir", "bloco"]}
              chevronPosition="right"
              styles={{
                item: { borderColor: "var(--border)" },
                label: { fontSize: 13, fontWeight: 600 },
              }}
            >
              <Accordion.Item value="inserir">
                <Accordion.Control>Inserir</Accordion.Control>
                <Accordion.Panel>
                  <Stack gap="xs">
                    <Group grow gap="xs">
                      <Button
                        variant="default"
                        size="xs"
                        leftSection={<IconTypography size={14} stroke={1.5} />}
                        onClick={addTextItem}
                      >
                        Texto
                      </Button>
                      <FileButton
                        onChange={(file) => void addImageItem(file)}
                        accept="image/png,image/jpeg,image/webp,image/svg+xml"
                      >
                        {(props) => (
                          <Button
                            {...props}
                            variant="default"
                            size="xs"
                            leftSection={<IconPhoto size={14} stroke={1.5} />}
                          >
                            Imagem
                          </Button>
                        )}
                      </FileButton>
                    </Group>
                    <Group gap="xs" wrap="nowrap">
                      <Select
                        size="xs"
                        aria-label="Campo dinâmico"
                        data={SHIPPING_LABEL_FIELD_TOKEN_OPTIONS}
                        value={tokenToAdd}
                        onChange={(value) =>
                          setTokenToAdd((value as ShippingLabelFieldToken) || "cliente")
                        }
                        flex={1}
                      />
                      <Button
                        variant="default"
                        size="xs"
                        leftSection={<IconVariable size={14} stroke={1.5} />}
                        onClick={addTokenItem}
                      >
                        Campo
                      </Button>
                    </Group>
                  </Stack>
                </Accordion.Panel>
              </Accordion.Item>

              <Accordion.Item value="bloco">
                <Accordion.Control>Bloco selecionado</Accordion.Control>
                <Accordion.Panel>
                  <NfeSelectedBlockEditor
                    selectedItem={selectedItem}
                    labelWidth={layout.widthPx}
                    labelHeight={layout.heightPx}
                    onAlign={alignSelectedItem}
                    onUpdate={(patch) => {
                      if (selectedItem) updateItem(selectedItem.id, patch);
                    }}
                    onReplaceImage={(file) => void replaceSelectedImage(file)}
                    onAutoFit={autoFitSelectedText}
                    onRemove={removeSelectedItem}
                  />
                </Accordion.Panel>
              </Accordion.Item>

              <Accordion.Item value="etiqueta">
                <Accordion.Control>Etiqueta</Accordion.Control>
                <Accordion.Panel>
                  <Stack gap="xs">
                    <TextInput
                      size="xs"
                      label="Nome do layout"
                      value={layout.name}
                      onChange={(event) =>
                        setLayout((current) => ({
                          ...current,
                          name: event.currentTarget.value,
                        }))
                      }
                    />
                    <Group grow gap="xs">
                      <NumberInput
                        size="xs"
                        label="Largura (px)"
                        value={layout.widthPx}
                        min={300}
                        max={2200}
                        onChange={(value) =>
                          setLayout((current) => ({
                            ...current,
                            widthPx: clamp(
                              Number(value || current.widthPx),
                              300,
                              2200,
                            ),
                          }))
                        }
                      />
                      <NumberInput
                        size="xs"
                        label="Altura (px)"
                        value={layout.heightPx}
                        min={120}
                        max={2200}
                        onChange={(value) =>
                          setLayout((current) => ({
                            ...current,
                            heightPx: clamp(
                              Number(value || current.heightPx),
                              120,
                              2200,
                            ),
                          }))
                        }
                      />
                    </Group>
                    <Select
                      size="xs"
                      label="Fonte"
                      data={fontOptions.map((font) => ({ value: font, label: font }))}
                      value={layout.fontFamily}
                      searchable
                      allowDeselect={false}
                      nothingFoundMessage="Nenhuma fonte encontrada"
                      onChange={(value) => {
                        if (!value) return;
                        setLayout((current) => ({ ...current, fontFamily: value }));
                      }}
                    />
                    <Checkbox
                      size="xs"
                      label="Mostrar borda da etiqueta"
                      checked={layout.showBorder}
                      onChange={(event) =>
                        setLayout((current) => ({
                          ...current,
                          showBorder: event.currentTarget.checked,
                        }))
                      }
                    />
                  </Stack>
                </Accordion.Panel>
              </Accordion.Item>

              <Accordion.Item value="nfe" style={{ borderBottom: 0 }}>
                <Accordion.Control>Dados da NF-e</Accordion.Control>
                <Accordion.Panel>
                  <Stack gap={6}>
                    {[
                      ["Cliente", nfeData.cliente],
                      ["Cidade / UF", `${nfeData.cidade} / ${nfeData.estado}`],
                      ["Transportadora", nfeData.transportadora],
                      ["Nota", nfeData.numeroNota],
                      ["Volumes", nfeData.volumes],
                      ["Peso (kg)", nfeData.pesoKg],
                    ].map(([label, value]) => (
                      <Group key={String(label)} justify="space-between" wrap="nowrap" gap="sm">
                        <Text size="xs" c="dimmed">
                          {label}
                        </Text>
                        <Text size="xs" fw={500} ta="right" truncate="end">
                          {String(value ?? "—")}
                        </Text>
                      </Group>
                    ))}
                  </Stack>
                </Accordion.Panel>
              </Accordion.Item>
            </Accordion>
          </div>
        </Group>
      )}

      <Modal
        opened={profileNameModal !== null}
        onClose={() => setProfileNameModal(null)}
        title={profileNameModal === "renomear" ? "Renomear perfil" : "Salvar como novo perfil"}
        centered
        size="sm"
      >
        <Stack gap="sm">
          <TextInput
            label="Nome do perfil"
            value={profileName}
            maxLength={40}
            onChange={(e) => setProfileName(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") confirmProfileName();
            }}
            data-autofocus
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setProfileNameModal(null)}>
              Cancelar
            </Button>
            <Button onClick={confirmProfileName} disabled={!profileName.trim()}>
              Salvar
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={sortProfilesOpen}
        onClose={() => setSortProfilesOpen(false)}
        title="Ordenar perfis"
        centered
        size="sm"
      >
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            Arraste pela alça (ou use as setas). A lista de perfis segue esta ordem.
          </Text>
          <SortableList
            items={profiles}
            getKey={(p) => p.id}
            renderLabel={(p) => p.nome}
            onChange={reorderProfiles}
          />
          <Group justify="flex-end">
            <Button onClick={() => setSortProfilesOpen(false)}>Pronto</Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
