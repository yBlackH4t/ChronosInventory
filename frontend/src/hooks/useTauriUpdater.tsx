import { useEffect } from "react";
import { Button, Group, Loader, Stack, Text } from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";

import { notifyError } from "../lib/notify";
import { isTauri } from "../lib/tauri";

const READY_NOTICE_ID = "chronos-atualizacao-pronta";
const INSTALLING_MODAL_ID = "chronos-atualizacao-instalando";

type UpdateStatus = { pronta: string | null; instalando: string | null };

async function installNow() {
  notifications.hide(READY_NOTICE_ID);
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("instalar_atualizacao_agora");
  } catch (error) {
    notifyError(error, "Não consegui instalar agora.");
  }
}

function showReady(version: string) {
  notifications.show({
    id: READY_NOTICE_ID,
    title: `Atualização ${version} pronta`,
    message: (
      <Stack gap={6}>
        <Text size="sm">
          Ela entra sozinha quando o Chronos for fechado. Nada do que você está fazendo se perde.
        </Text>
        <Group gap="xs">
          <Button size="xs" variant="light" onClick={() => void installNow()}>
            Reiniciar agora
          </Button>
        </Group>
      </Stack>
    ),
    autoClose: false,
    withCloseButton: true,
  });
}

function showInstalling(version: string) {
  notifications.hide(READY_NOTICE_ID);
  modals.open({
    modalId: INSTALLING_MODAL_ID,
    title: "Atualizando o Chronos",
    centered: true,
    withCloseButton: false,
    closeOnClickOutside: false,
    closeOnEscape: false,
    children: (
      <Group gap="sm" wrap="nowrap">
        <Loader size="sm" />
        <Text size="sm">
          Fazendo a cópia de segurança e instalando a versão {version}. O Chronos reabre sozinho.
        </Text>
      </Group>
    ),
  });
}

function showFailed() {
  modals.close(INSTALLING_MODAL_ID);
  notifications.show({
    title: "A atualização não foi instalada agora",
    message: "A cópia de segurança não ficou pronta. O Chronos tenta de novo quando for fechado.",
    color: "warning",
    autoClose: 8000,
  });
}

/** Avisa o que o desktop faz sozinho: baixa a atualização escondido e instala ao fechar. */
export function useTauriUpdater() {
  useEffect(() => {
    if (import.meta.env.DEV) return;
    if (!isTauri()) return;

    const stops: Array<() => void> = [];
    let disposed = false;

    const run = async () => {
      const [{ invoke }, { listen }] = await Promise.all([
        import("@tauri-apps/api/core"),
        import("@tauri-apps/api/event"),
      ]);
      const listeners = await Promise.all([
        listen<string>("atualizacao-pronta", ({ payload }) => showReady(payload)),
        listen<string>("atualizacao-instalando", ({ payload }) => showInstalling(payload)),
        listen<string>("atualizacao-falhou", () => showFailed()),
      ]);
      if (disposed) {
        listeners.forEach((stop) => stop());
        return;
      }
      stops.push(...listeners);

      // A tela pode carregar depois do aviso: pergunta o estado uma vez.
      const status = await invoke<UpdateStatus>("atualizacao_estado");
      if (disposed) return;
      if (status.instalando) showInstalling(status.instalando);
      else if (status.pronta) showReady(status.pronta);
    };

    run().catch((err) => console.error("Falha ao acompanhar a atualização:", err));

    return () => {
      disposed = true;
      stops.forEach((stop) => stop());
    };
  }, []);
}
