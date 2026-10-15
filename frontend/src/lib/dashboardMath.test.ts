import { describe, expect, it } from "vitest";

import {
  buildBalanceSeries,
  fillDays,
  groupByBrandVersion,
  heatmapWeeks,
  percentChange,
  stockBackward,
  summarizeHealth,
} from "./dashboardMath";
import type { StockItemOverview } from "./api";

const item = (nome: string, estoque: number, dias: number | null): StockItemOverview => ({
  produto_id: Math.floor(Math.random() * 1e6),
  nome,
  estoque,
  ultima_saida: null,
  dias_sem_saida: dias,
  saidas_periodo: 0,
});

describe("dashboardMath", () => {
  it("fills every day of the range with zeros", () => {
    const days = fillDays([{ period: "2026-10-02", entradas: 3, saidas: 1 }], "2026-10-01", "2026-10-03");
    expect(days.map((d) => d.entradas)).toEqual([0, 3, 0]);
    expect(days).toHaveLength(3);
  });

  it("compares periods and refuses to divide by zero", () => {
    expect(percentChange(58, 52)).toBe(12);
    expect(percentChange(41, 0)).toBeNull();
  });

  it("walks the stock back from today and never goes negative", () => {
    const days = [
      { date: "a", entradas: 0, saidas: 2 },
      { date: "b", entradas: 5, saidas: 0 },
      { date: "c", entradas: 0, saidas: 1 },
    ];
    expect(stockBackward(10, days)).toEqual([6, 11, 10]);
    expect(stockBackward(1, [{ date: "a", entradas: 9, saidas: 0 }, { date: "b", entradas: 0, saidas: 0 }])).toEqual([1, 1]);
  });

  it("builds a 7-day week with the balance carried and stopped at today", () => {
    const series = buildBalanceSeries(
      [{ period: "2026-10-13", entradas: 4, saidas: 1 }],
      [{ period: "2026-10-13", total_stock: 103 }],
      "week",
      "2026-10-12",
      "2026-10-18",
      "2026-10-15",
    );
    expect(series).toHaveLength(7);
    expect(series[0].saldo).toBe(100);
    expect(series[1]).toMatchObject({ entradas: 4, saidas: 1, saldo: 103 });
    expect(series[3].saldo).toBe(103);
    expect(series[4].saldo).toBeNull();
  });

  it("uses today's balance when the week had no movement", () => {
    const series = buildBalanceSeries([], [], "week", "2026-10-12", "2026-10-18", "2026-10-15", 386);
    expect(series[0].saldo).toBe(386);
  });

  it("groups stock by brand and version", () => {
    const rows = groupByBrandVersion([
      item("TURBINA HOLSET 4031195", 2, 1),
      item("TURBINA HOLSET 4031195 MONTADA", 3, 1),
      item("TURBINA GARRETT 750849-9001", 4, 1),
      item("PECA SEM MARCA", 1, 1),
    ]);
    const holset = rows.find((r) => r.brand === "HOLSET")!;
    expect(holset.total).toBe(5);
    expect(holset.versions).toEqual({ NOVA: 2, REMAN: 0, MONTADA: 3 });
    expect(rows.find((r) => r.brand === "GARRETT")!.versions.REMAN).toBe(4);
    expect(rows[rows.length - 1].brand).toBe("Outras");
  });

  it("splits stock health by days since the last sale", () => {
    const { counts, parados } = summarizeHealth([
      item("A", 1, 3),
      item("B", 1, 45),
      item("C", 9, 200),
      item("D", 2, null),
    ]);
    expect(counts).toEqual({ GIRANDO: 1, LENTO: 1, PARADO: 2 });
    expect(parados[0].nome).toBe("C");
  });

  it("lays the heatmap out in Monday-first weeks", () => {
    const grid = heatmapWeeks(
      [{ date: "2026-10-15", entradas: 2, saidas: 2 }],
      "2026-10-15",
      2,
    );
    expect(grid).toHaveLength(2);
    expect(grid[1][0].date).toBe("2026-10-12");
    expect(grid[1][3]).toMatchObject({ date: "2026-10-15", total: 4, level: 4 });
    expect(grid[1][4].future).toBe(true);
  });
});
