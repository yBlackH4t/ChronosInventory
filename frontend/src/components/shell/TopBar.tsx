import { useEffect, useState } from "react";
import {
  ActionIcon,
  Group,
  Kbd,
  Loader,
  Menu,
  Text,
  Tooltip,
  useMantineColorScheme,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { spotlight } from "@mantine/spotlight";
import {
  IconHelp,
  IconMoonStars,
  IconQrcode,
  IconRefresh,
  IconSearch,
  IconSettings,
  IconSparkles,
  IconSun,
} from "@tabler/icons-react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import type { HealthOut } from "../../lib/api";
import { api, baseUrl } from "../../lib/apiClient";
import { useProfileScope } from "../../state/profileScope";
import { notifyError, notifySuccess } from "../../lib/notify";
import { isTauri } from "../../lib/tauri";
import { getReleaseNotesFromManifest } from "../../lib/updaterNotes";
import { getLatestReleaseEntry, getReleaseEntry } from "../../lib/changelog";
import {
  ADMIN_NAV,
  PRIMARY_NAV,
  isRouteActive,
  usePrefetchRoute,
} from "../../app/navigation";
import { SyncStatusBadge } from "./SyncStatusBadge";
import chronosIcon from "../../assets/chronos-icon.svg";
import ShortcutsModal from "../common/ShortcutsModal";
import NavIndicator from "./NavIndicator";

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

export default function TopBar({ health }: { health: HealthOut }) {
  const {
    activeProfileName,
    activeProfileId,
    restartRequired,
    backendSupportsProfiles,
  } = useProfileScope();
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const location = useLocation();
  const prefetch = usePrefetchRoute();
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [appVersion, setAppVersion] = useState(health.version);
  const [releaseNotesChecked, setReleaseNotesChecked] = useState(false);
  const [shortcutsOpened, setShortcutsOpened] = useState(false);
  const [navEl, setNavEl] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "?" || event.ctrlKey || event.altKey || event.metaKey)
        return;
      if (isTypingTarget(event.target)) return;
      event.preventDefault();
      setShortcutsOpened(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

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
      title: `Novidades da versão ${release.version}`,
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
      const updater = await import("@tauri-apps/plugin-updater");
      const process = await import("@tauri-apps/plugin-process");

      const update = await updater.check();
      if (!update) {
        notifySuccess("Nenhuma atualização disponível.");
        return;
      }

      const version = update.version ?? "nova";
      const notes = getReleaseNotesFromManifest({ body: update.body });

      modals.openConfirmModal({
        title: `Nova versão ${version} disponível`,
        children: (
          <Text
            size="sm"
            c="dimmed"
            style={{
              whiteSpace: "pre-wrap",
              maxHeight: 260,
              overflowY: "auto",
            }}
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
            notifySuccess("Cópia de segurança criada antes de atualizar.");
          } catch (error) {
            notifyError(
              error,
              "Não foi possível criar a cópia de segurança antes de atualizar. A atualização foi cancelada.",
            );
            return;
          }

          try {
            notifySuccess("Instalando atualização...");
            // Baixa antes de fechar o backend: se o download falhar, o app continua funcionando.
            await update.download();
            try {
              const { invoke } = await import("@tauri-apps/api/core");
              await invoke("kill_backend");
            } catch (e) {
              console.error("Falha ao matar backend antes do update:", e);
            }
            await update.install();
            await process.relaunch();
          } catch (error) {
            notifyError(error, "Falha ao instalar atualização.");
            if (backupCreated) {
              modals.openConfirmModal({
                title: "Voltar aos dados de antes da atualização?",
                children: (
                  <Text size="sm">
                    A instalação falhou. Deseja restaurar automaticamente o
                    última cópia de segurança feita antes de atualizar?
                  </Text>
                ),
                labels: { confirm: "Restaurar", cancel: "Depois" },
                confirmProps: { color: "warning" },
                onConfirm: async () => {
                  try {
                    await api.backupRestorePreUpdate();
                    notifySuccess("Dados de antes da atualização restaurados.");
                  } catch (restoreError) {
                    notifyError(
                      restoreError,
                      "Não foi possível restaurar a cópia de segurança de antes da atualização.",
                    );
                  }
                },
              });
            }
          }
        },
      });
    } catch (error) {
      notifyError(error, "Falha ao verificar atualização.");
    } finally {
      setCheckingUpdate(false);
    }
  };

  const openScannerModal = async () => {
    let scannerIp: string;
    try {
      const res = await fetch(`${baseUrl}/api/scanner/ip`);
      const data = await res.json();
      scannerIp = data.ip;
    } catch {
      scannerIp = "127.0.0.1";
    }
    const scannerUrl = `${scannerIp || "http://127.0.0.1:8000"}/api/scanner/app`;

    modals.open({
      title: "Scanner via celular",
      centered: true,
      children: (
        <Group align="center" style={{ flexDirection: "column" }}>
          <Text size="sm" ta="center" c="dimmed">
            Abra a câmera do celular e aponte para o código QR abaixo. O
            celular e o computador precisam estar na <b>mesma rede Wi-Fi</b>.
          </Text>
          <div
            style={{
              padding: 20,
              background: "white",
              borderRadius: 12,
              marginTop: 12,
            }}
          >
            <QRCodeSVG value={scannerUrl} size={200} />
          </div>
          <Text size="xs" c="dimmed" mt="md" className="mono">
            {scannerUrl}
          </Text>
        </Group>
      ),
    });
  };

  const isDark = colorScheme === "dark";

  return (
    <div className="topbar-inner">
      <div className="topbar-card">
        <div className="topbar-row">
          <Link to="/dashboard" className="topbar-brand">
            <img src={chronosIcon} width={28} height={28} alt="" />
            <span className="topbar-brand-name">Chronos</span>
          </Link>

          <button
            type="button"
            className="cmd-trigger"
            onClick={() => spotlight.open()}
            aria-label="Buscar produto ou ir para uma tela"
          >
            <IconSearch size={15} stroke={1.75} />
            <span className="cmd-trigger-label">
              Buscar produto ou ir para…
            </span>
            <Kbd size="xs">Ctrl K</Kbd>
          </button>

          <div className="topbar-actions">
            {backendSupportsProfiles && (
              <Tooltip
                label={
                  restartRequired
                    ? "Reinicio pendente para aplicar o perfil"
                    : `Perfil de estoque ativo (${activeProfileId})`
                }
              >
                <Link to="/estoques" className="profile-pill">
                  <span
                    className="status-dot"
                    data-variant={restartRequired ? "warning" : undefined}
                    style={{ width: 6, height: 6, boxShadow: "none" }}
                  />
                  {activeProfileName}
                </Link>
              </Tooltip>
            )}

            <SyncStatusBadge />

            <Tooltip label={`API conectada · v${appVersion}`}>
              <span className="status-dot-wrap" aria-label="API conectada">
                <span className="status-dot" data-pulse />
              </span>
            </Tooltip>

            <Tooltip label="Usar celular como leitor de código de barras">
              <ActionIcon
                size="lg"
                color="gray"
                aria-label="Scanner via celular"
                onClick={() => void openScannerModal()}
              >
                <IconQrcode size={18} stroke={1.5} />
              </ActionIcon>
            </Tooltip>

            <Tooltip label="Atalhos do teclado (?)">
              <ActionIcon
                size="lg"
                color="gray"
                aria-label="Atalhos do teclado"
                onClick={() => setShortcutsOpened(true)}
              >
                <IconHelp size={18} stroke={1.5} />
              </ActionIcon>
            </Tooltip>

            <Tooltip label={isDark ? "Usar tema claro" : "Usar tema escuro"}>
              <ActionIcon
                size="lg"
                color="gray"
                aria-label="Alternar tema"
                onClick={() => setColorScheme(isDark ? "light" : "dark")}
              >
                {isDark ? (
                  <IconSun size={18} stroke={1.5} />
                ) : (
                  <IconMoonStars size={18} stroke={1.5} />
                )}
              </ActionIcon>
            </Tooltip>

            <Menu position="bottom-end" width={260} withinPortal>
              <Menu.Target>
                <ActionIcon
                  size="lg"
                  color="gray"
                  aria-label="Administração e sistema"
                >
                  <IconSettings size={18} stroke={1.5} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                {ADMIN_NAV.map((group, index) => (
                  <div key={group.title}>
                    {index > 0 && <Menu.Divider />}
                    <Menu.Label>{group.title}</Menu.Label>
                    {group.items.map((item) => (
                      <Menu.Item
                        key={item.to}
                        component={Link}
                        to={item.to}
                        leftSection={<item.icon size={16} stroke={1.5} />}
                        onMouseEnter={() => prefetch(item.to)}
                      >
                        {item.label}
                      </Menu.Item>
                    ))}
                  </div>
                ))}
                <Menu.Divider />
                <Menu.Item
                  component={Link}
                  to="/novidades"
                  leftSection={<IconSparkles size={16} stroke={1.5} />}
                >
                  Novidades
                </Menu.Item>
                {isTauri() && (
                  <Menu.Item
                    leftSection={
                      checkingUpdate ? (
                        <Loader size={14} />
                      ) : (
                        <IconRefresh size={16} stroke={1.5} />
                      )
                    }
                    disabled={checkingUpdate}
                    onClick={() => void handleCheckUpdate()}
                  >
                    Verificar atualização
                  </Menu.Item>
                )}
                <Text size="xs" c="dimmed" px="sm" py={6}>
                  Chronos Inventory v{appVersion}
                </Text>
              </Menu.Dropdown>
            </Menu>
          </div>
        </div>

        <nav className="topbar-tabs" aria-label="Navegação principal" ref={setNavEl}>
          <NavIndicator track={navEl} activeKey={location.pathname} />
          {PRIMARY_NAV.map((item, index) => {
            const active = isRouteActive(location.pathname, item.to);
            return (
              <Tooltip
                key={item.to}
                label={`Alt+${index + 1}`}
                openDelay={700}
                position="bottom"
              >
                <NavLink
                  to={item.to}
                  className="topnav-tab"
                  data-active={active || undefined}
                  onMouseEnter={() => prefetch(item.to)}
                  onFocus={() => prefetch(item.to)}
                >
                  <item.icon size={16} stroke={1.5} />
                  {item.label}
                </NavLink>
              </Tooltip>
            );
          })}
        </nav>
      </div>
      <ShortcutsModal
        opened={shortcutsOpened}
        onClose={() => setShortcutsOpened(false)}
      />
    </div>
  );
}
