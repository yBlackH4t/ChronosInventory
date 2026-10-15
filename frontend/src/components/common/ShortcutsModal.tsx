import { Group, Kbd, Modal, Stack, Text } from "@mantine/core";

import { PRIMARY_NAV } from "../../app/navigation";

type Shortcut = { keys: string[]; label: string };

const GENERAL: Shortcut[] = [
  { keys: ["Ctrl", "K"], label: "Buscar produto, tela ou ação" },
  { keys: ["/"], label: "Abrir a busca" },
  { keys: ["?"], label: "Mostrar esta lista" },
  { keys: ["Esc"], label: "Fechar janela ou gaveta" },
];

const QUICK_MOVEMENT: Shortcut[] = [
  { keys: ["Alt", "S"], label: "Trocar para saída" },
  { keys: ["Alt", "E"], label: "Trocar para entrada" },
  { keys: ["Alt", "T"], label: "Trocar para transferência" },
];

function ShortcutGroup({ title, items }: { title: string; items: Shortcut[] }) {
  return (
    <Stack gap={6}>
      <Text size="xs" fw={600} c="dimmed" tt="uppercase" lts="0.06em">
        {title}
      </Text>
      {items.map((item) => (
        <Group key={item.label} justify="space-between" wrap="nowrap">
          <Text size="sm">{item.label}</Text>
          <Group gap={4} wrap="nowrap">
            {item.keys.map((key) => (
              <Kbd key={key} size="sm">
                {key}
              </Kbd>
            ))}
          </Group>
        </Group>
      ))}
    </Stack>
  );
}

export default function ShortcutsModal({
  opened,
  onClose,
}: {
  opened: boolean;
  onClose: () => void;
}) {
  const screens: Shortcut[] = PRIMARY_NAV.filter((item) => item.hotkey).map(
    (item) => ({
      keys: item.hotkey!.split("+").map((key) =>
        key === "alt" ? "Alt" : key.toUpperCase(),
      ),
      label: item.label,
    }),
  );

  return (
    <Modal opened={opened} onClose={onClose} title="Atalhos do teclado" size="md">
      <Stack gap="lg">
        <ShortcutGroup title="Geral" items={GENERAL} />
        <ShortcutGroup title="Ir para a tela" items={screens} />
        <ShortcutGroup title="Na movimentação rápida" items={QUICK_MOVEMENT} />
      </Stack>
    </Modal>
  );
}
