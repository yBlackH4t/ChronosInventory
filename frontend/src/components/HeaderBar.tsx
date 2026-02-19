import { useEffect, useState } from "react";
import { Badge, Button, Group, Text } from "@mantine/core";
import { modals } from "@mantine/modals";
import { IconCircleFilled, IconRefresh } from "@tabler/icons-react";
import { Link } from "react-router-dom";
import type { HealthOut } from "../lib/api";
import { api } from "../lib/apiClient";
import { notifyError, notifySuccess } from "../lib/notify";
import { isTauri } from "../lib/tauri";
import { getReleaseNotesFromManifest } from "../lib/updaterNotes";
import { getLatestReleaseEntry, getReleaseEntry } from "../lib/changelog";

export default function HeaderBar({ health }: { health: HealthOut }) {
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [appVersion, setAppVersion] = useState(health.version);
  const [releaseNotesChecked, setReleaseNotesChecked] = useState(false);

  useEffect(() => {
    let mounted = true;

    const loadAppVersion = async () => {
      if (!isTauri()) {
        setAppVersion(health.version);
        return;
      }

      try {
        const app = await import("@tauri-apps/api/app");
        const version = await app.getVersion();
        if (mounted) {
          setAppVersion(version);
        }
      } catch {
        if (mounted) {
          setAppVersion(health.version);
        }
      }
    };

    void loadAppVersion();

    return () => {
      mounted = false;
    };
  }, [health.version]);

  useEffect(() => {
    if (releaseNotesChecked) return;
    if (!appVersion) return;
    setReleaseNotesChecked(true);

    const normalized = appVersion.replace(/^v/i, "");
    const storageKey = "chronos.last_seen_version";
    const lastSeen = window.localStorage.getItem(storageKey) || "";
    if (lastSeen === normalized) return;

    const release = getReleaseEntry(normalized) || getLatestReleaseEntry();
    if (!release) {
      window.localStorage.setItem(storageKey, normalized);
      return;
    }

    modals.open({
      title: `Novidades da versao ${release.version}`,
      size: "lg",
      children: (
        <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
          {release.highlights.map((item) => `- ${item}`).join("\n")}
        </Text>
      ),
    });
    window.localStorage.setItem(storageKey, normalized);
  }, [appVersion, releaseNotesChecked]);

  const handleCheckUpdate = async () => {
    if (!isTauri()) return;

    setCheckingUpdate(true);
    try {
      const updater = await import("@tauri-apps/api/updater");
      const process = await import("@tauri-apps/api/process");

      const update = await updater.checkUpdate();
      if (!update.shouldUpdate) {
        notifySuccess("Nenhuma atualizacao disponivel.");
        return;
      }

      const version = update.manifest?.version ?? "nova";
      const notes = getReleaseNotesFromManifest(update.manifest as { body?: string; notes?: string });

      modals.openConfirmModal({
        title: `Nova versao ${version} disponivel`,
        children: (
          <Text
            size="sm"
            c="dimmed"
            style={{ whiteSpace: "pre-wrap", maxHeight: 260, overflowY: "auto" }}
          >
            {notes}
          </Text>
        ),
        labels: { confirm: "Atualizar agora", cancel: "Depois" },
        onConfirm: async () => {
          let backupCreated = false;
          try {
            await api.backupCreatePreUpdate();
            backupCreated = true;
            notifySuccess("Backup pre-update criado.");
          } catch (error) {
            notifyError(error, "Falha ao criar backup pre-update. Atualizacao cancelada.");
            return;
          }

          try {
            notifySuccess("Instalando atualizacao...");
            await updater.installUpdate();
            await process.relaunch();
          } catch (error) {
            notifyError(error, "Falha ao instalar atualizacao.");
            if (backupCreated) {
              modals.openConfirmModal({
                title: "Restaurar dados pre-update?",
                children: (
                  <Text size="sm">
                    A instalacao falhou. Deseja restaurar automaticamente o ultimo backup pre-update?
                  </Text>
                ),
                labels: { confirm: "Restaurar", cancel: "Depois" },
                confirmProps: { color: "orange" },
                onConfirm: async () => {
                  try {
                    await api.backupRestorePreUpdate();
                    notifySuccess("Backup pre-update restaurado com sucesso.");
                  } catch (restoreError) {
                    notifyError(restoreError, "Falha ao restaurar backup pre-update.");
                  }
                },
              });
            }
          }
        },
      });
    } catch (error) {
      notifyError(error, "Falha ao verificar atualizacao.");
    } finally {
      setCheckingUpdate(false);
    }
  };

  return (
    <Group justify="flex-end" h="100%" wrap="nowrap" className="header-shell">
      <Button
        size="xs"
        variant="subtle"
        component={Link}
        to="/novidades"
      >
        Novidades
      </Button>
      {!import.meta.env.DEV && isTauri() && (
        <Button
          size="xs"
          variant="light"
          leftSection={<IconRefresh size={14} />}
          loading={checkingUpdate}
          onClick={handleCheckUpdate}
          className="header-update-btn"
        >
          Verificar update
        </Button>
      )}
      <Badge color="green" leftSection={<IconCircleFilled size={10} />} className="header-status-badge">
        API OK
      </Badge>
      <Badge variant="outline" color="gray" className="header-version-badge">
        v{appVersion}
      </Badge>
    </Group>
  );
}
