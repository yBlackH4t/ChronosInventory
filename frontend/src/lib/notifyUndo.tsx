import { Button, Group, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";

/**
 * Aviso que some sozinho com "Desfazer" (só para o que dá para voltar na própria tela,
 * como tirar um item de uma lista). Clicar em "Desfazer" chama `onUndo` e fecha o aviso.
 */
export function notifyUndo(message: string, onUndo: () => void, autoClose = 6000) {
  const id = `undo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  notifications.show({
    id,
    color: "gray",
    autoClose,
    message: (
      <Group justify="space-between" wrap="nowrap" gap="sm">
        <Text size="sm">{message}</Text>
        <Button
          size="compact-sm"
          variant="light"
          onClick={() => {
            onUndo();
            notifications.hide(id);
          }}
        >
          Desfazer
        </Button>
      </Group>
    ),
  });
}
