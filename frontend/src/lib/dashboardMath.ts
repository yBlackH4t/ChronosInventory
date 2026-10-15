import dayjs from "dayjs";

import type { FlowPoint, StockEvolutionPoint, StockItemOverview } from "./api";
import { detectBrand, detectCondition } from "./brands";
import type { VersionLabel } from "./semantic";

// Contas da dashboard, separadas da tela para poderem ser testadas.

export type DayFlow = { date: string; entradas: number; saidas: number };

/** Um ponto por dia entre `from` e `to` (inclusive), com zero nos dias sem movimento. */
export function fillDays(points: FlowPoint[], from: string, to: string): DayFlow[] {
  const byDay = new Map(points.map((p) => [p.period, p]));
  const out: DayFlow[] = [];
  let cursor = dayjs(from);
  const end = dayjs(to);
  while (!cursor.isAfter(end, "day")) {
    const key = cursor.format("YYYY-MM-DD");
    const point = byDay.get(key);
    out.push({ date: key, entradas: point?.entradas ?? 0, saidas: point?.saidas ?? 0 });
    cursor = cursor.add(1, "day");
  }
  return out;
}

export function sum(values: number[]): number {
  return values.reduce((acc, value) => acc + value, 0);
}

/** Variação percentual arredondada; null quando não dá para comparar (antes era zero). */
export function percentChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/** Saldo de cada dia, voltando a partir do saldo de hoje (nunca negativo). */
export function stockBackward(currentTotal: number, days: DayFlow[]): number[] {
  const out = new Array<number>(days.length);
  let running = currentTotal;
  for (let i = days.length - 1; i >= 0; i -= 1) {
    out[i] = Math.max(running, 0);
    running -= days[i].entradas - days[i].saidas;
  }
  return out;
}

export type BalancePoint = {
  key: string;
  label: string;
  entradas: number;
  saidas: number;
  saldo: number | null;
};

function weekLabel(key: string): string {
  // "%Y-%W" do SQLite: semana do ano começando na segunda.
  const [, week] = key.split("-");
  return `Sem. ${Number(week)}`;
}

/**
 * Junta entradas/saídas e o saldo num eixo só. Na semana mostra os 7 dias,
 * mesmo os sem movimento. O saldo segue o último valor conhecido e para em hoje.
 */
export function buildBalanceSeries(
  flow: FlowPoint[],
  evolution: StockEvolutionPoint[],
  periodMode: "week" | "month",
  dateFrom: string,
  dateTo: string,
  today: string = dayjs().format("YYYY-MM-DD"),
  /** Saldo de hoje: usado quando o período chega em hoje e não teve movimento. */
  currentTotal: number | null = null,
): BalancePoint[] {
  const flowBy = new Map(flow.map((p) => [p.period, p]));
  const evoBy = new Map(evolution.map((p) => [p.period, p.total_stock]));

  let keys: string[];
  if (periodMode === "week") {
    keys = fillDays([], dateFrom, dateTo).map((d) => d.date);
  } else {
    keys = Array.from(new Set([...flowBy.keys(), ...evoBy.keys()])).sort();
  }

  // Saldo antes do primeiro ponto: o primeiro valor menos o movimento daquele dia.
  const firstEvoKey = keys.find((k) => evoBy.has(k));
  let carry: number | null = null;
  if (firstEvoKey) {
    const f = flowBy.get(firstEvoKey);
    carry = Math.max((evoBy.get(firstEvoKey) ?? 0) - ((f?.entradas ?? 0) - (f?.saidas ?? 0)), 0);
  } else if (currentTotal !== null && dateTo >= today) {
    carry = currentTotal;
  }

  return keys.map((key) => {
    const f = flowBy.get(key);
    if (evoBy.has(key)) carry = evoBy.get(key) ?? carry;
    const future = periodMode === "week" && key > today;
    return {
      key,
      label: periodMode === "week" ? dayjs(key).format("ddd DD/MM") : weekLabel(key),
      entradas: f?.entradas ?? 0,
      saidas: f?.saidas ?? 0,
      saldo: future ? null : carry,
    };
  });
}

export const BRAND_OTHERS = "Outras";

export type BrandVersionRow = {
  brand: string;
  total: number;
  versions: Record<VersionLabel, number>;
};

/** Estoque de hoje por marca, dividido em NOVA, REMAN e MONTADA (pelo nome do produto). */
export function groupByBrandVersion(items: StockItemOverview[], maxBrands = 6): BrandVersionRow[] {
  const rows = new Map<string, BrandVersionRow>();
  for (const item of items) {
    const brand = detectBrand(item.nome)?.label ?? BRAND_OTHERS;
    const version = detectCondition(item.nome).label;
    const row = rows.get(brand) ?? {
      brand,
      total: 0,
      versions: { NOVA: 0, REMAN: 0, MONTADA: 0 },
    };
    row.total += item.estoque;
    row.versions[version] += item.estoque;
    rows.set(brand, row);
  }
  const sorted = Array.from(rows.values())
    .filter((r) => r.brand !== BRAND_OTHERS)
    .sort((a, b) => b.total - a.total);
  const kept = sorted.slice(0, maxBrands - 1);
  const rest = [...sorted.slice(maxBrands - 1), ...(rows.has(BRAND_OTHERS) ? [rows.get(BRAND_OTHERS)!] : [])];
  if (rest.length) {
    kept.push(
      rest.reduce<BrandVersionRow>(
        (acc, row) => ({
          brand: BRAND_OTHERS,
          total: acc.total + row.total,
          versions: {
            NOVA: acc.versions.NOVA + row.versions.NOVA,
            REMAN: acc.versions.REMAN + row.versions.REMAN,
            MONTADA: acc.versions.MONTADA + row.versions.MONTADA,
          },
        }),
        { brand: BRAND_OTHERS, total: 0, versions: { NOVA: 0, REMAN: 0, MONTADA: 0 } },
      ),
    );
  }
  return kept;
}

export type HealthBucket = "GIRANDO" | "LENTO" | "PARADO";

/** Girando: saiu nos últimos 30 dias. Lento: 31 a 90. Parado: mais de 90 ou nunca saiu. */
export function healthBucket(item: StockItemOverview): HealthBucket {
  const days = item.dias_sem_saida;
  if (days === null || days === undefined || days > 90) return "PARADO";
  if (days > 30) return "LENTO";
  return "GIRANDO";
}

export function summarizeHealth(items: StockItemOverview[]) {
  const counts: Record<HealthBucket, number> = { GIRANDO: 0, LENTO: 0, PARADO: 0 };
  for (const item of items) counts[healthBucket(item)] += 1;
  const parados = items
    .filter((item) => healthBucket(item) === "PARADO")
    .sort((a, b) => b.estoque - a.estoque || (b.dias_sem_saida ?? 9999) - (a.dias_sem_saida ?? 9999));
  return { counts, parados };
}

export type HeatCell = { date: string; total: number; level: 0 | 1 | 2 | 3 | 4; future: boolean };

/** Grade de semanas (colunas, segunda a domingo) terminando na semana de `end`. */
export function heatmapWeeks(days: DayFlow[], end: string, weeks = 12): HeatCell[][] {
  const totals = new Map(days.map((d) => [d.date, d.entradas + d.saidas]));
  const max = Math.max(0, ...totals.values());
  const endDay = dayjs(end);
  // Segunda-feira da semana de `end`.
  const lastMonday = endDay.subtract((endDay.day() + 6) % 7, "day");
  const firstMonday = lastMonday.subtract(weeks - 1, "week");
  const grid: HeatCell[][] = [];
  for (let w = 0; w < weeks; w += 1) {
    const column: HeatCell[] = [];
    for (let d = 0; d < 7; d += 1) {
      const date = firstMonday.add(w, "week").add(d, "day");
      const key = date.format("YYYY-MM-DD");
      const total = totals.get(key) ?? 0;
      const level = (total === 0 || max === 0 ? 0 : Math.min(4, Math.ceil((total / max) * 4))) as HeatCell["level"];
      column.push({ date: key, total, level, future: date.isAfter(endDay, "day") });
    }
    grid.push(column);
  }
  return grid;
}
