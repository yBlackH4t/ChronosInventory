import { useEffect, useState } from "react";
import { Group, Badge, Text, Title, Button } from "@mantine/core";
import { IconCircleFilled } from "@tabler/icons-react";
import type { HealthOut } from "../lib/api";
import { notifyError, notifySuccess } from "../lib/notify";
import { isTauri } from "../lib/tauri";

export default function HeaderBar({ health }: { health: HealthOut }) {
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [appVersion, setAppVersion] = useState(health.version);

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

    loadAppVersion();

    return () => {
      mounted = false;
    };
  }, [health.version]);

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
      const confirmInstall = window.confirm(`Nova versao ${version} disponivel. Atualizar agora?`);
      if (!confirmInstall) return;

      await updater.installUpdate();
      await process.relaunch();
    } catch (error) {
      notifyError(error, "Falha ao verificar atualizacao.");
    } finally {
      setCheckingUpdate(false);
    }
  };

  return (
    <Group justify="space-between" h="100%">
      <Title order={3}>Chronos Inventory</Title>
      <Group gap="sm">
        {!import.meta.env.DEV && isTauri() && (
          <Button size="xs" variant="light" loading={checkingUpdate} onClick={handleCheckUpdate}>
            Verificar update
          </Button>
        )}
        <Badge color="green" leftSection={<IconCircleFilled size={10} />}>
          API OK
        </Badge>
        <Text c="dimmed" size="sm">
          v{appVersion}
        </Text>
      </Group>
    </Group>
  );
}
