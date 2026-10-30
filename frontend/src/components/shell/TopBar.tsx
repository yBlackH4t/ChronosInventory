import { useEffect, useState } from "react";
import {
  ActionIcon,
  Group,
  Kbd,
  Loader,
  Menu,
  Text,
  Tooltip,
  useComputedColorScheme,
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
import { baseUrl } from "../../lib/apiClient";
import { useProfileScope } from "../../state/profileScope";
import { notifyError, notifySuccess } from "../../lib/notify";
import { isTauri } from "../../lib/tauri";
import { openUpdateDialog } from "./openUpdateDialog";
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
import ApiStatusDot from "./ApiStatusDot";
import WhatsAppPill from "./WhatsAppPill";
import { useSchemeSchedule } from "../../lib/appearance";
import { revealThemeChange } from "../../lib/themeReveal";
import { useMotionLevel } from "../../lib/motionContext";

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
    hasManyProfiles,
  } = useProfileScope();
  const { setColorScheme } = useMantineColorScheme();
  const computedScheme = useComputedColorScheme("light");
  const [, setSchemeSchedule] = useSchemeSchedule();
  const motionLevel = useMotionLevel();
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
      // O Rust procura no canal deste PC (Estável ou Teste) e aceita voltar versão.
      const { invoke } = await import("@tauri-apps/api/core");
      const { Update } = await import("@tauri-apps/plugin-updater");
      const found = await invoke<ConstructorParameters<typeof Update>[0] | null>(
        "procurar_atualizacao",
      );
      const update = found ? new Update(found) : null;
      if (!update) {
        notifySuccess("Nenhuma atualização disponível.");
        return;
      }

      openUpdateDialog(update);
    } catch (error) {
      notifyError(error, "Falha ao verificar atualização.");
    } finally {
      setCheckingUpdate(false);
    }
  };

  const openScannerModal = async () => {
    let scannerIp: string;
    let pairing = "";
    try {
      const res = await fetch(`${baseUrl}/api/scanner/ip`);
      const data = await res.json();
      scannerIp = data.ip;
      pairing = data.pareamento ?? "";
    } catch {
      scannerIp = "127.0.0.1";
    }
    // O código de pareamento vai no QR: só o celular que leu consegue mandar códigos para cá.
    const scannerUrl = `${scannerIp || baseUrl}/api/scanner/app${pairing ? `?p=${encodeURIComponent(pairing)}` : ""}`;

    modals.open({
      title: "Scanner via celular",
      centered: true,
      children: (
        <Group align="center" style={{ flexDirection: "column" }}>
          <Text size="sm" ta="center" c="dimmed">
            Abra a câmera do celular e aponte para o código QR abaixo. O
            celular e o computador precisam estar na <b>mesma rede Wi-Fi</b>.
            Depois de ler um código, o celular mostra o saldo por filial.
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

  const isDark = computedScheme === "dark";

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
            {backendSupportsProfiles && (hasManyProfiles || restartRequired) && (
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

            <WhatsAppPill />

            <SyncStatusBadge />

            <ApiStatusDot version={appVersion} />

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
                onClick={(event) =>
                  revealThemeChange(
                    event,
                    () => {
                      // Trocar na mão desliga o "pelo horário".
                      setSchemeSchedule(false);
                      setColorScheme(isDark ? "light" : "dark");
                    },
                    motionLevel,
                  )
                }
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
