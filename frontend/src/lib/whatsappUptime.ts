// Faixa "WhatsApp hoje" do Painel: o Chronos anota, de meia em meia hora, se o robô estava
// ligado quando ele conferiu. Fica só neste computador (localStorage) e recomeça todo dia.
// Lógica pura (a leitura/gravação recebe o storage), para testar.

export const UPTIME_KEY = "chronos.whatsapp.uptime";
export const SLOTS_PER_DAY = 48;

/** "1" ligado, "0" fora do ar, "." sem conferência (Chronos fechado). */
export type UptimeDay = { date: string; slots: string };
export type SlotState = "on" | "off" | "none" | "future";

export function dayKey(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function slotIndex(now: Date): number {
  return now.getHours() * 2 + (now.getMinutes() >= 30 ? 1 : 0);
}

function emptyDay(date: string): UptimeDay {
  return { date, slots: ".".repeat(SLOTS_PER_DAY) };
}

export function parseDay(raw: string | null, now: Date): UptimeDay {
  const today = dayKey(now);
  if (!raw) return emptyDay(today);
  try {
    const parsed = JSON.parse(raw) as Partial<UptimeDay>;
    if (parsed.date !== today || typeof parsed.slots !== "string" || parsed.slots.length !== SLOTS_PER_DAY) {
      return emptyDay(today);
    }
    return { date: today, slots: parsed.slots };
  } catch {
    return emptyDay(today);
  }
}

/** Anota a conferência de agora. Fora do ar vence: meia hora com uma queda fica vermelha. */
export function recordSample(day: UptimeDay, now: Date, online: boolean): UptimeDay {
  const index = slotIndex(now);
  const current = day.slots[index];
  const next = current === "0" ? "0" : online ? "1" : "0";
  if (next === current) return day;
  return { ...day, slots: day.slots.slice(0, index) + next + day.slots.slice(index + 1) };
}

export function dayStrip(day: UptimeDay, now: Date): SlotState[] {
  const current = slotIndex(now);
  return Array.from({ length: SLOTS_PER_DAY }, (_, index) => {
    if (index > current) return "future";
    const value = day.slots[index];
    return value === "1" ? "on" : value === "0" ? "off" : "none";
  });
}

export function slotLabel(index: number): string {
  const hour = String(Math.floor(index / 2)).padStart(2, "0");
  return `${hour}:${index % 2 ? "30" : "00"}`;
}

export function readUptime(now = new Date()): UptimeDay {
  try {
    return parseDay(window.localStorage.getItem(UPTIME_KEY), now);
  } catch {
    return emptyDay(dayKey(now));
  }
}

export function saveUptimeSample(online: boolean, now = new Date()): void {
  try {
    const next = recordSample(readUptime(now), now, online);
    window.localStorage.setItem(UPTIME_KEY, JSON.stringify(next));
  } catch {
    // Sem localStorage: a faixa só não aparece.
  }
}
