import { useEffect, useState } from "react";
import { Group, SegmentedControl, Switch, Text } from "@mantine/core";
import { IconDeviceDesktop } from "@tabler/icons-react";

import Panel from "../ui/Panel";
import { notifyError } from "../../lib/notify";
import { isTauri } from "../../lib/tauri";

type UpdateChannel = "estavel" | "teste";

type DesktopSettings = {
  fechar_para_bandeja: boolean;
  abrir_com_windows: boolean;
  porta_backend: number;
  canal_atualizacao: UpdateChannel;
};

async function invokeDesktop<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, args);
}

/** Fechar para a bandeja e abrir com o Windows: o robô do WhatsApp e o backup moram no Chronos. */
export default function DesktopSettingsPanel() {
  const [settings, setSettings] = useState<DesktopSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const desktop = isTauri();

  useEffect(() => {
    if (!desktop) return;
    invokeDesktop<DesktopSettings>("desktop_settings")
      .then(setSettings)
      .catch((error) =>
        notifyError(error, "Não consegui ler as opções deste computador."),
      );
  }, [desktop]);

  const save = async (
    patch: Partial<
      Pick<
        DesktopSettings,
        "fechar_para_bandeja" | "abrir_com_windows" | "canal_atualizacao"
      >
    >,
  ) => {
    setSaving(true);
    try {
      const next = await invokeDesktop<DesktopSettings>(
        "set_desktop_settings",
        {
          fecharParaBandeja: patch.fechar_para_bandeja,
          abrirComWindows: patch.abrir_com_windows,
          canalAtualizacao: patch.canal_atualizacao,
        },
      );
      setSettings(next);
    } catch (error) {
      notifyError(error, "Não consegui salvar esta opção.");
    } finally {
      setSaving(false);
    }
  };

  // No navegador estas opções não existem: o quadro só aparece no Chronos instalado.
  if (!desktop) return null;

  return (
    <Panel
      title={
        <Group gap={8}>
          <IconDeviceDesktop size={16} stroke={1.5} />
          Este computador
        </Group>
      }
      subtitle="O robô do WhatsApp, a cópia automática e o envio da base só funcionam com o Chronos ligado."
    >
      <div>
        <div className="ts-option">
          <div>
            <Text size="sm" fw={600}>
              Continuar ligado ao fechar a janela
            </Text>
            <Text size="xs" c="dimmed">
              O Chronos fica no canto da barra de tarefas, perto do relógio.
              Para sair de vez, clique com o botão direito no ícone e escolha
              “Sair do Chronos”.
            </Text>
          </div>
          <Switch
            size="md"
            aria-label="Continuar ligado ao fechar a janela"
            checked={settings?.fechar_para_bandeja ?? true}
            disabled={!settings || saving}
            onChange={(event) =>
              save({ fechar_para_bandeja: event.currentTarget.checked })
            }
          />
        </div>
        <div className="ts-option">
          <div>
            <Text size="sm" fw={600}>
              Abrir junto com o Windows
            </Text>
            <Text size="xs" c="dimmed">
              Liga o Chronos sozinho quando o computador é ligado, já
              escondido perto do relógio. Use no computador do robô do
              WhatsApp.
            </Text>
          </div>
          <Switch
            size="md"
            aria-label="Abrir junto com o Windows"
            checked={settings?.abrir_com_windows ?? false}
            disabled={!settings || saving}
            onChange={(event) =>
              save({ abrir_com_windows: event.currentTarget.checked })
            }
          />
        </div>
        <div className="ts-option">
          <div>
            <Text size="sm" fw={600}>
              Canal de atualização
            </Text>
            <Text size="xs" c="dimmed">
              No Teste, este computador recebe cada versão nova antes dos
              outros, que só a recebem depois de “Liberar para todos” no
              GitHub. Voltar para o Estável instala a versão oficial, mesmo
              que seja mais antiga que a deste computador.
            </Text>
          </div>
          <SegmentedControl
            size="xs"
            aria-label="Canal de atualização"
            data={[
              { label: "Estável", value: "estavel" },
              { label: "Teste", value: "teste" },
            ]}
            value={settings?.canal_atualizacao ?? "estavel"}
            disabled={!settings || saving}
            onChange={(value) =>
              save({ canal_atualizacao: value as UpdateChannel })
            }
          />
        </div>
      </div>
    </Panel>
  );
}
