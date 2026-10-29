import { useState } from "react";
import { Button, Group, Progress, Stack, Text, ThemeIcon } from "@mantine/core";
import { modals } from "@mantine/modals";
import { IconAlertTriangle, IconCloudDownload } from "@tabler/icons-react";
import type { Update } from "@tauri-apps/plugin-updater";

import { api } from "../../lib/apiClient";
import { notifyError, notifySuccess } from "../../lib/notify";

type Stage = "pronta" | "copia" | "baixando" | "instalando" | "falhou";

export const MODAL_ID = "chronos-atualizacao";

export function UpdateDialogBody({ update }: { update: Update }) {
  const [stage, setStage] = useState<Stage>("pronta");
  const [percent, setPercent] = useState<number | null>(null);
  const [backupCreated, setBackupCreated] = useState(false);
  const busy =
    stage === "copia" || stage === "baixando" || stage === "instalando";

  const install = async () => {
    setStage("copia");
    try {
      await api.backupCreatePreUpdate();
      setBackupCreated(true);
    } catch (error) {
      notifyError(
        error,
        "Não consegui fazer a cópia de segurança. A atualização não foi feita.",
      );
      setStage("falhou");
      return;
    }

    try {
      setStage("baixando");
      let total = 0;
      let received = 0;
      // Baixa antes de fechar o backend: se a internet cair, o Chronos continua funcionando.
      await update.download((event) => {
        if (event.event === "Started") total = event.data.contentLength ?? 0;
        if (event.event === "Progress") {
          received += event.data.chunkLength;
          if (total > 0)
            setPercent(Math.min(100, Math.round((received / total) * 100)));
        }
      });
      setStage("instalando");
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("kill_backend");
      } catch (error) {
        console.error("Falha ao fechar o backend antes do update:", error);
      }
      await update.install();
      const process = await import("@tauri-apps/plugin-process");
      await process.relaunch();
    } catch (error) {
      notifyError(error, "A atualização não terminou.");
      setStage("falhou");
    }
  };

  const restoreBackup = async () => {
    try {
      await api.backupRestorePreUpdate();
      notifySuccess("Os dados voltaram a ser os de antes da atualização.");
      modals.close(MODAL_ID);
    } catch (error) {
      notifyError(error, "Não consegui voltar a cópia de segurança.");
    }
  };

  if (stage === "falhou") {
    return (
      <Stack gap="md">
        <Group gap="sm" wrap="nowrap" align="flex-start">
          <ThemeIcon size={40} radius="md" color="warning" variant="light">
            <IconAlertTriangle size={22} />
          </ThemeIcon>
          <Text size="sm">
            A atualização não foi concluída. O Chronos continua na versão atual
            e pode ser usado normalmente. Tente de novo mais tarde.
          </Text>
        </Group>
        <Group justify="flex-end" gap="sm">
          {backupCreated && (
            <Button variant="default" onClick={restoreBackup}>
              Voltar os dados de antes
            </Button>
          )}
          <Button onClick={() => modals.close(MODAL_ID)}>Fechar</Button>
        </Group>
      </Stack>
    );
  }

  return (
    <Stack gap="md">
      <Group gap="sm" wrap="nowrap" align="flex-start">
        <ThemeIcon size={40} radius="md" variant="light">
          <IconCloudDownload size={22} />
        </ThemeIcon>
        <Stack gap={4}>
          <Text fw={600}>Versão {update.version} pronta para instalar</Text>
          <Text size="sm" c="dimmed">
            Leva cerca de um minuto. O Chronos guarda uma cópia dos dados antes
            e abre sozinho no final.
          </Text>
        </Stack>
      </Group>

      {busy && (
        <Stack gap={6}>
          <Text size="sm">
            {stage === "copia" && "Guardando uma cópia dos dados..."}
            {stage === "baixando" && "Baixando a nova versão..."}
            {stage === "instalando" &&
              "Instalando. O Chronos vai fechar e abrir de novo."}
          </Text>
          <Progress
            value={stage === "baixando" && percent !== null ? percent : 100}
            animated={stage !== "baixando" || percent === null}
            striped={stage !== "baixando" || percent === null}
          />
        </Stack>
      )}

      <Group justify="flex-end" gap="sm">
        <Button
          variant="default"
          disabled={busy}
          onClick={() => modals.close(MODAL_ID)}
        >
          Depois
        </Button>
        <Button loading={busy} onClick={install}>
          Atualizar agora
        </Button>
      </Group>
    </Stack>
  );
}

/** Aviso simples de versão nova, sem lista de mudanças. */
