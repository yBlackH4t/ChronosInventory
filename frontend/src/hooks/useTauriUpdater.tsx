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


export function useTauriUpdater() {
  useEffect(() => {
    if (import.meta.env.DEV) return;
    if (!isTauri()) return;

    let cancelled = false;
    

    const run = async () => {
      try {
        const updater = await import("@tauri-apps/plugin-updater");
        const process = await import("@tauri-apps/plugin-process");

        

        const update = await updater.check();
        if (cancelled) return;

        if (!update) {
          return;
        }

        const version = update.version ?? "nova";
        const notes = getReleaseNotesFromManifest(
          { body: update.body },
        );
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
            await update.downloadAndInstall();
            await process.relaunch();
          } catch (err) {
            const message =
              err instanceof Error ? err.message : "Erro inesperado";
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
                    A instalacao falhou. Deseja restaurar automaticamente o
                    backup pre-update?
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
                      restoreError instanceof Error
                        ? restoreError.message
                        : "Erro inesperado";
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
              <Text size="sm">
                Atualizacao {version} disponivel. {notesPreview}
              </Text>
              <Button
                size="xs"
                variant="default"
                onClick={async () => {
                  modals.openConfirmModal({
                    title: `Nova versao ${version}`,
                    children: (
                      <Stack gap="xs">
                        <Text size="sm">
                          Deseja instalar esta atualizacao agora?
                        </Text>
                        <Text
                          size="xs"
                          c="dimmed"
                          style={{
                            whiteSpace: "pre-wrap",
                            maxHeight: 260,
                            overflowY: "auto",
                          }}
                        >
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
      
    };
  }, []);
}
