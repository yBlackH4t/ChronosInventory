import { useEffect } from "react";
import { Button, Group, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { isTauri } from "../lib/tauri";

type UnlistenFn = () => void;

export function useTauriUpdater() {
  useEffect(() => {
    if (import.meta.env.DEV) return;
    if (!isTauri()) return;

    let cancelled = false;
    let unlisten: UnlistenFn | null = null;

    const run = async () => {
      try {
        const updater = await import("@tauri-apps/api/updater");
        const process = await import("@tauri-apps/api/process");

        unlisten = await updater.onUpdaterEvent((event) => {
          if (event.error) {
            console.error("Updater error:", event.error);
            return;
          }
          console.info("Updater status:", event.status);
        });

        const update = await updater.checkUpdate();
        if (cancelled) return;

        if (!update.shouldUpdate) {
          return;
        }

        const version = update.manifest?.version ?? "nova";

        const id = notifications.show({
          title: "Nova versao disponivel",
          message: (
            <Group gap="xs">
              <Text size="sm">Atualizacao {version} disponivel.</Text>
              <Button
                size="xs"
                onClick={async () => {
                  try {
                    notifications.update({
                      id,
                      title: "Atualizando...",
                      message: "Baixando e instalando a nova versao.",
                      loading: true,
                      autoClose: false,
                    });
                    await updater.installUpdate();
                    await process.relaunch();
                  } catch (err) {
                    const message = err instanceof Error ? err.message : "Erro inesperado";
                    notifications.update({
                      id,
                      title: "Falha ao atualizar",
                      message,
                      color: "red",
                      loading: false,
                      autoClose: false,
                    });
                  }
                }}
              >
                Atualizar agora
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
      if (unlisten) {
        unlisten();
      }
    };
  }, []);
}
