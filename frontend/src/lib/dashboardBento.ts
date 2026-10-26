import dayjs from "dayjs";

// Contas pequenas dos blocos do Painel (2.6.1). Lógica pura, para testar.

/** Soma dos últimos `window` dias em cada dia: mostra o ritmo sem o serrilhado diário. */
export function rollingSum(values: number[], window = 7): number[] {
  const out: number[] = [];
  let acc = 0;
  values.forEach((value, index) => {
    acc += value;
    if (index >= window) acc -= values[index - window];
    out.push(acc);
  });
  return out;
}

/** "hoje 14:32", "ontem 09:10" ou "12/10 08:05". */
export function activityTimeLabel(iso: string, now: dayjs.Dayjs = dayjs()): string {
  const when = dayjs(iso);
  if (!when.isValid()) return "";
  if (when.isSame(now, "day")) return `hoje ${when.format("HH:mm")}`;
  if (when.isSame(now.subtract(1, "day"), "day")) return `ontem ${when.format("HH:mm")}`;
  return when.format("DD/MM HH:mm");
}

export type RobotState =
  | "parado"
  | "conectando"
  | "aguardando_qr"
  | "conectado"
  | "reconectando"
  | "desconectado"
  | "erro";

export type RobotStatus = {
  label: string;
  tone: "success" | "warning" | "neutral" | "danger";
  /** Só o robô ouvindo pulsa. */
  pulse: boolean;
};

export function robotStatus(state: RobotState, active: boolean): RobotStatus {
  switch (state) {
    case "conectado":
      return { label: "Robô do WhatsApp ligado", tone: "success", pulse: true };
    case "conectando":
    case "reconectando":
      return { label: "Robô do WhatsApp conectando…", tone: "warning", pulse: false };
    case "aguardando_qr":
      return { label: "Robô esperando o QR code", tone: "warning", pulse: false };
    case "erro":
      return { label: "Robô do WhatsApp com erro", tone: "danger", pulse: false };
    case "desconectado":
      return { label: "WhatsApp desconectado", tone: "neutral", pulse: false };
    default:
      return {
        label: active ? "Robô do WhatsApp parado" : "Robô do WhatsApp desligado",
        tone: "neutral",
        pulse: false,
      };
  }
}

/** Parte de `part` em `total`, de 0 a 1 (0 quando não há total). */
export function share(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(Math.max(part / total, 0), 1);
}
