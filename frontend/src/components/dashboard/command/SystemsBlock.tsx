import { Skeleton, Stack } from "@mantine/core";
import {
  IconBrandWhatsapp,
  IconCloudUpload,
  IconDeviceDesktop,
  IconRefresh,
  IconShieldCheck,
  IconSparkles,
  type Icon,
} from "@tabler/icons-react";
import CommandPanel from "./CommandPanel";
import type { SystemLine } from "../../../lib/commandCenter";
import { slotLabel, type SlotState } from "../../../lib/whatsappUptime";

type SystemsBlockProps = {
  lines: SystemLine[];
  loading: boolean;
  /** Faixa "WhatsApp hoje" (48 meias horas); vazia quando o robô está desligado. */
  uptime: SlotState[];
};

/** Ícone e o jeito que ele se mexe ao passar o mouse. */
const ICONS: Record<string, { icon: Icon; hover: "bob" | "spin" | "shine" }> = {
  Chronos: { icon: IconDeviceDesktop, hover: "bob" },
  WhatsApp: { icon: IconBrandWhatsapp, hover: "bob" },
  Assistente: { icon: IconSparkles, hover: "shine" },
  "Base oficial": { icon: IconCloudUpload, hover: "bob" },
  "Base publicada": { icon: IconCloudUpload, hover: "bob" },
  "Certificado A1": { icon: IconShieldCheck, hover: "shine" },
  Backup: { icon: IconRefresh, hover: "spin" },
};

const SLOT_HINT: Record<SlotState, string> = {
  on: "ligado",
  off: "fora do ar",
  none: "Chronos fechado",
  future: "",
};

// Coluna da esquerda: se cada parte do Chronos está de pé. No "Completo" os ícones soltam
// uma onda de tempos em tempos, o que pede atenção pisca e o WhatsApp mostra o batimento.
export default function SystemsBlock({ lines, loading, uptime }: SystemsBlockProps) {
  const lineFor = (label: string) => ICONS[label] ?? ICONS[label.split(" ")[0]] ?? { icon: IconSparkles, hover: "bob" as const };
  const showStrip = uptime.some((slot) => slot === "on" || slot === "off");

  return (
    <CommandPanel area="sys" title="Sistemas">
      {loading ? (
        <Stack gap={12}>
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} h={34} radius="sm" />
          ))}
        </Stack>
      ) : (
        <>
          <ul className="cc-systems">
            {lines.map((line, index) => {
              const meta = lineFor(line.label);
              const LineIcon = meta.icon;
              return (
                <li key={line.label} data-tone={line.tone} style={{ ["--d" as string]: `${index * 0.45}s` }}>
                  <span className="cc-sys-icon" data-tone={line.tone} data-hover={meta.hover} aria-hidden>
                    <LineIcon size={17} stroke={1.8} />
                  </span>
                  <span className="cc-sys-text">
                    {line.label}
                    <small>{line.detail}</small>
                  </span>
                  {line.label === "WhatsApp" && line.tone === "ok" ? (
                    <svg className="cc-ecg" viewBox="0 0 54 20" aria-hidden>
                      <path d="M0 10h14l3-6 4 12 4-14 3 8h26" />
                    </svg>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {showStrip ? (
            <div className="cc-uptime">
              <span>WhatsApp hoje</span>
              <div className="cc-uptime-bar" role="img" aria-label="Robô do WhatsApp de meia em meia hora hoje">
                {uptime.map((slot, index) => (
                  <i key={index} data-state={slot} title={slot === "future" ? undefined : `${slotLabel(index)} · ${SLOT_HINT[slot]}`} />
                ))}
              </div>
            </div>
          ) : null}
        </>
      )}
    </CommandPanel>
  );
}
