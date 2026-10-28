import dayjs from "dayjs";
import type { BackupListItemOut, NfeConfig, OfficialBaseStatusOut } from "../types/api";
import type { DayFlow } from "./dashboardMath";

// Contas do Centro de comando (Painel 2.7.9). Lógica pura, para testar.

export type SystemTone = "ok" | "warn" | "danger" | "neutral";

export type SystemLine = {
  label: string;
  detail: string;
  tone: SystemTone;
};

/** Certificado A1 da NF-e: avisa 30 dias antes de vencer. */
export function certificateLine(config: NfeConfig | null | undefined, now = dayjs()): SystemLine {
  const cert = config?.certificado;
  if (!cert) return { label: "Certificado A1", detail: "não instalado", tone: "neutral" };
  const until = dayjs(cert.validade);
  if (!until.isValid()) return { label: "Certificado A1", detail: "validade desconhecida", tone: "warn" };
  const days = until.startOf("day").diff(now.startOf("day"), "day");
  const date = until.format("DD/MM/YYYY");
  if (days < 0) return { label: "Certificado A1", detail: `venceu em ${date}`, tone: "danger" };
  if (days <= 30) return { label: "Certificado A1", detail: `vence em ${days} dias (${date})`, tone: "warn" };
  return { label: "Certificado A1", detail: `válido até ${date}`, tone: "ok" };
}

/** Backup mais novo: mais de 2 dias sem backup já pede atenção. */
export function backupLine(backups: BackupListItemOut[] | null | undefined, now = dayjs()): SystemLine {
  const newest = (backups ?? [])
    .map((item) => dayjs(item.created_at))
    .filter((when) => when.isValid())
    .sort((a, b) => b.valueOf() - a.valueOf())[0];
  if (!newest) return { label: "Backup", detail: "nenhum backup ainda", tone: "warn" };
  const days = now.startOf("day").diff(newest.startOf("day"), "day");
  return {
    label: "Backup",
    detail: `último ${whenLabel(newest, now)}`,
    tone: days > 2 ? "warn" : "ok",
  };
}

/** Base oficial: quem publica mostra quando publicou; quem consome, a mais nova que vê. */
export function officialBaseLine(status: OfficialBaseStatusOut | null | undefined, now = dayjs()): SystemLine {
  if (!status) return { label: "Base oficial", detail: "sem informação", tone: "neutral" };
  const publisher = status.role === "publisher";
  // A base pode ir pela pasta compartilhada ou pelo servidor local: vale a mais nova.
  const manifest = [status.server_latest_manifest, status.latest_manifest]
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((a, b) => dayjs(b.published_at).valueOf() - dayjs(a.published_at).valueOf())[0];
  const label = publisher ? "Base publicada" : "Base consumida";
  if (!manifest) {
    return { label, detail: publisher ? "ainda não publicou" : "nenhuma base encontrada", tone: "warn" };
  }
  const when = dayjs(manifest.published_at);
  const who = publisher ? "" : ` por ${manifest.publisher_name || manifest.publisher_machine}`;
  return { label, detail: `${whenLabel(when, now)}${who}`, tone: "ok" };
}

/** "hoje 07:58", "ontem 18:10" ou "12/10". */
export function whenLabel(when: dayjs.Dayjs, now = dayjs()): string {
  if (!when.isValid()) return "";
  if (when.isSame(now, "day")) return `hoje ${when.format("HH:mm")}`;
  if (when.isSame(now.subtract(1, "day"), "day")) return `ontem ${when.format("HH:mm")}`;
  return when.format("DD/MM");
}

export type HealthRing = { key: "GIRANDO" | "LENTO" | "PARADO"; value: number; fraction: number };

/** Anéis do medidor: cada um mostra a parte do total (de 0 a 1). */
export function healthRings(counts: Record<HealthRing["key"], number>): HealthRing[] {
  const total = counts.GIRANDO + counts.LENTO + counts.PARADO;
  return (["GIRANDO", "LENTO", "PARADO"] as const).map((key) => ({
    key,
    value: counts[key],
    fraction: total > 0 ? counts[key] / total : 0,
  }));
}

export type FlowRange = "30" | "90" | "365";

export type FlowBar = { date: string; entradas: number; saidas: number };

/** Dias em colunas. No ano, junta por semana (segunda a domingo) para caber na largura. */
export function flowBars(days: DayFlow[], range: FlowRange): FlowBar[] {
  if (range !== "365") {
    return days.slice(-Number(range)).map((d) => ({ date: d.date, entradas: d.entradas, saidas: d.saidas }));
  }
  const weeks = new Map<string, FlowBar>();
  for (const day of days) {
    const date = dayjs(day.date);
    const monday = date.subtract((date.day() + 6) % 7, "day").format("YYYY-MM-DD");
    const bar = weeks.get(monday) ?? { date: monday, entradas: 0, saidas: 0 };
    bar.entradas += day.entradas;
    bar.saidas += day.saidas;
    weeks.set(monday, bar);
  }
  return [...weeks.values()];
}

/**
 * Caminho SVG suave que passa por todos os pontos sem ultrapassá-los (curva monotônica
 * de Fritsch–Carlson): a linha nunca sobe acima do eixo nem inventa picos.
 */
export function monotonePath(points: Array<[number, number]>): string {
  const n = points.length;
  if (n === 0) return "";
  if (n === 1) return `M${points[0][0]} ${points[0][1]}`;
  const dx = points.slice(1).map((p, i) => p[0] - points[i][0]);
  const slope = points.slice(1).map((p, i) => (dx[i] === 0 ? 0 : (p[1] - points[i][1]) / dx[i]));
  const tangent = points.map((_, i) => {
    if (i === 0) return slope[0];
    if (i === n - 1) return slope[n - 2];
    const a = slope[i - 1];
    const b = slope[i];
    if (a * b <= 0) return 0;
    return (3 * (dx[i - 1] + dx[i])) / ((2 * dx[i] + dx[i - 1]) / a + (dx[i] + 2 * dx[i - 1]) / b);
  });
  const f = (value: number) => value.toFixed(1);
  let d = `M${f(points[0][0])} ${f(points[0][1])}`;
  for (let i = 0; i < n - 1; i += 1) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    const h = dx[i] / 3;
    d += ` C${f(x0 + h)} ${f(y0 + tangent[i] * h)} ${f(x1 - h)} ${f(y1 - tangent[i + 1] * h)} ${f(x1)} ${f(y1)}`;
  }
  return d;
}
