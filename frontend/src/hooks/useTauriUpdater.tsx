import { useEffect } from "react";
import { Button, Group, Stack, Text } from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { api } from "../lib/apiClient";
import { isTauri } from "../lib/tauri";
import {
  getReleaseNotesFromManifest,
  getReleaseNotesPreview,
} from "../lib/updaterNotes";

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
        const notes = getReleaseNotesFromManifest(update.manifest as { body?: string; notes?: string });
        const notesPreview = getReleaseNotesPreview(notes);

        const installNow = async (notificationId: string) => {
          let backupCreated = false;
          try {
            await api.backupCreatePreUpdate();
            backupCreated = true;
            notifications.update({
              id: notificationId,
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
              id: notificationId,
              title: "Falha ao atualizar",
              message,
              color: "red",
              loading: false,
              autoClose: false,
            });
            if (backupCreated) {
              modals.openConfirmModal({
                title: "Restaurar dados pre-update?",
                children: (
                  <Text size="sm">
                    A instalacao falhou. Deseja restaurar automaticamente o backup pre-update?
                  </Text>
                ),
                labels: { confirm: "Restaurar", cancel: "Depois" },
                confirmProps: { color: "orange" },
                onConfirm: async () => {
                  try {
                    await api.backupRestorePreUpdate();
                    notifications.show({
                      title: "Dados restaurados",
                      message: "Backup pre-update restaurado com sucesso.",
                      color: "green",
                    });
                  } catch (restoreError) {
                    const restoreMessage =
                      restoreError instanceof Error ? restoreError.message : "Erro inesperado";
                    notifications.show({
                      title: "Falha ao restaurar",
                      message: restoreMessage,
                      color: "red",
                    });
                  }
                },
              });
            }
          }
        };

        const id = notifications.show({
          title: "Nova versao disponivel",
          message: (
            <Group gap="xs" wrap="wrap">
              <Text size="sm">Atualizacao {version} disponivel. {notesPreview}</Text>
              <Button
                size="xs"
                variant="default"
                onClick={async () => {
                  modals.openConfirmModal({
                    title: `Nova versao ${version}`,
                    children: (
                      <Stack gap="xs">
                        <Text size="sm">Deseja instalar esta atualizacao agora?</Text>
                        <Text size="xs" c="dimmed" style={{ whiteSpace: "pre-wrap", maxHeight: 260, overflowY: "auto" }}>
                          {notes}
                        </Text>
                      </Stack>
                    ),
                    labels: { confirm: "Atualizar agora", cancel: "Depois" },
                    onConfirm: () => installNow(id),
                  });
                }}
              >
                Ver detalhes
              </Button>
              <Button size="xs" onClick={() => installNow(id)}>
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
