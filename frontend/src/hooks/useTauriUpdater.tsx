import { useEffect } from "react";
import { Button, Group, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";

import { openUpdateDialog } from "../components/shell/openUpdateDialog";
import { isTauri } from "../lib/tauri";

export function useTauriUpdater() {
  useEffect(() => {
    if (import.meta.env.DEV) return;
    if (!isTauri()) return;

    let cancelled = false;

    const run = async () => {
      try {
        const updater = await import("@tauri-apps/plugin-updater");
        const update = await updater.check();
        if (cancelled || !update) return;

        const id = notifications.show({
          title: "Nova versão do Chronos",
          message: (
            <Group gap="xs" wrap="wrap">
              <Text size="sm">A versão {update.version} está pronta para instalar.</Text>
              <Button
                size="xs"
                onClick={() => {
                  notifications.hide(id);
                  openUpdateDialog(update);
                }}
              >
                Atualizar
              </Button>
            </Group>
          ),
          autoClose: false,
          withCloseButton: true,
        });
      } catch (err) {
        console.error("Falha ao checar update:", err);
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, []);
}
